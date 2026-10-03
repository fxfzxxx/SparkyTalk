import { isLocalDate, type ProposedAction } from "@sparkytalk/shared";
import { and, desc, eq, max } from "drizzle-orm";
import type { Tx } from "../db/client";
import {
  jobs,
  roomProgress,
  scheduleChanges,
  scheduleEntries,
  siteItems,
  siteNotes,
} from "../db/schema";
import { isManager, type AuthUser } from "./auth";

/** Ids that exist in the caller's company, used to reject unresolved or foreign references. */
export interface KnownEntities {
  employeeIds: Set<string>;
  /** siteId → room ids on that site */
  roomsBySite: Map<string, Set<string>>;
  /** siteId → work item ids on that site */
  itemsBySite: Map<string, Set<string>>;
}

export interface ActionIssue {
  index: number;
  problem: string;
}

/**
 * Checks that every action is fully resolved and allowed for this user.
 * Unresolved references (id: null) must be fixed on the confirmation card first.
 */
export function validateActions(
  actions: ProposedAction[],
  user: AuthUser,
  known: KnownEntities,
): ActionIssue[] {
  const issues: ActionIssue[] = [];
  const add = (index: number, problem: string) => issues.push({ index, problem });
  const siteKnown = (id: string | null) => id !== null && known.roomsBySite.has(id);
  const employeeKnown = (id: string | null) => id !== null && known.employeeIds.has(id);

  actions.forEach((action, i) => {
    switch (action.type) {
      case "clarify":
        return; // informational only; skipped on apply
      case "create_job":
        if (!isManager(user)) add(i, "only owners/admins can create jobs");
        if (!siteKnown(action.site.id)) add(i, `unknown site "${action.site.spoken}"`);
        for (const a of action.assignees) {
          if (!employeeKnown(a.id)) add(i, `unknown employee "${a.spoken}"`);
        }
        if (action.assignees.length > 0 && !(action.date && isLocalDate(action.date))) {
          add(i, "a date is required to schedule assignees");
        }
        return;
      case "change_schedule":
        if (!employeeKnown(action.employee.id)) {
          add(i, `unknown employee "${action.employee.spoken}"`);
        } else if (!isManager(user) && action.employee.id !== user.id) {
          add(i, "workers can only change their own schedule");
        }
        if (!siteKnown(action.toSite.id)) add(i, `unknown site "${action.toSite.spoken}"`);
        if (action.fromSite?.id && !siteKnown(action.fromSite.id)) {
          add(i, `unknown site "${action.fromSite.spoken}"`);
        }
        if (!isLocalDate(action.date)) add(i, "invalid date");
        return;
      case "report_progress": {
        const siteRooms = action.site.id ? known.roomsBySite.get(action.site.id) : undefined;
        if (!siteRooms) {
          add(i, `unknown site "${action.site.spoken}"`);
          return;
        }
        for (const u of action.updates) {
          if (!u.roomId || !siteRooms.has(u.roomId)) add(i, `unknown room "${u.roomSpoken}"`);
          if (u.remainingDays !== null && u.remainingDays < 0) add(i, "negative remaining days");
        }
        const siteItemIds = known.itemsBySite.get(action.site.id!) ?? new Set<string>();
        for (const item of action.items) {
          if (item.itemId !== null && !siteItemIds.has(item.itemId)) {
            add(i, `unknown work item "${item.name}"`);
          }
          if (item.itemId === null && !item.name.trim()) add(i, "new work item needs a name");
          if (item.remainingDays !== null && item.remainingDays < 0) add(i, "negative remaining days");
        }
        return;
      }
    }
  });
  return issues;
}

/** Applies already-validated actions. Call inside a transaction. */
export async function applyActions(tx: Tx, user: AuthUser, actions: ProposedAction[]) {
  const companyId = user.companyId;
  for (const action of actions) {
    switch (action.type) {
      case "clarify":
        break;

      case "create_job": {
        const [job] = await tx
          .insert(jobs)
          .values({
            companyId,
            siteId: action.site.id!,
            title: action.title,
            stage: action.stage,
            notes: action.notes,
            createdBy: user.id,
          })
          .returning();
        if (action.assignees.length && action.date) {
          await tx.insert(scheduleEntries).values(
            action.assignees.map((a) => ({
              companyId,
              jobId: job!.id,
              siteId: action.site.id!,
              employeeId: a.id!,
              date: action.date!,
              notes: action.notes,
            })),
          );
        }
        break;
      }

      case "change_schedule": {
        const conditions = [
          eq(scheduleEntries.companyId, companyId),
          eq(scheduleEntries.employeeId, action.employee.id!),
          eq(scheduleEntries.date, action.date),
          eq(scheduleEntries.status, "planned"),
        ];
        if (action.fromSite?.id) conditions.push(eq(scheduleEntries.siteId, action.fromSite.id));
        const moved = await tx
          .update(scheduleEntries)
          .set({ status: "moved" })
          .where(and(...conditions))
          .returning({ id: scheduleEntries.id });

        // Attach to the site's most recent job, or open a new one for ad-hoc work.
        let [job] = await tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.companyId, companyId), eq(jobs.siteId, action.toSite.id!)))
          .orderBy(desc(jobs.createdAt))
          .limit(1);
        job ??= (
          await tx
            .insert(jobs)
            .values({
              companyId,
              siteId: action.toSite.id!,
              title: action.reason ?? "临时安排",
              createdBy: user.id,
            })
            .returning({ id: jobs.id })
        )[0];

        const [entry] = await tx
          .insert(scheduleEntries)
          .values({
            companyId,
            jobId: job!.id,
            siteId: action.toSite.id!,
            employeeId: action.employee.id!,
            date: action.date,
            notes: action.timeNote,
          })
          .returning({ id: scheduleEntries.id });

        await tx.insert(scheduleChanges).values({
          companyId,
          fromEntryId: moved[0]?.id ?? null,
          toEntryId: entry!.id,
          changedBy: user.id,
          reason: action.reason,
        });
        break;
      }

      case "report_progress":
        for (const u of action.updates) {
          await tx
            .insert(roomProgress)
            .values({
              roomId: u.roomId!,
              stage: u.stage,
              status: u.status,
              remainingDays: u.remainingDays,
              updatedBy: user.id,
            })
            .onConflictDoUpdate({
              target: [roomProgress.roomId, roomProgress.stage],
              set: {
                status: u.status,
                remainingDays: u.remainingDays,
                updatedBy: user.id,
                updatedAt: new Date(),
              },
            });
        }
        for (const item of action.items) {
          const progress = {
            status: item.status,
            remainingDays: item.remainingDays,
            updatedBy: user.id,
            updatedAt: new Date(),
          };
          // A "new" item whose name already exists on the site updates that one instead.
          const [existing] = item.itemId
            ? [{ id: item.itemId }]
            : await tx
                .select({ id: siteItems.id })
                .from(siteItems)
                .where(and(eq(siteItems.siteId, action.site.id!), eq(siteItems.name, item.name.trim())))
                .limit(1);
          if (existing) {
            await tx
              .update(siteItems)
              .set(progress)
              .where(and(eq(siteItems.id, existing.id), eq(siteItems.siteId, action.site.id!)));
          } else {
            const [last] = await tx
              .select({ n: max(siteItems.sortOrder) })
              .from(siteItems)
              .where(eq(siteItems.siteId, action.site.id!));
            await tx.insert(siteItems).values({
              siteId: action.site.id!,
              name: item.name.trim(),
              sortOrder: (last?.n ?? -1) + 1,
              ...progress,
            });
          }
        }
        if (action.note?.trim()) {
          await tx.insert(siteNotes).values({
            companyId,
            siteId: action.site.id!,
            note: action.note.trim(),
            createdBy: user.id,
          });
        }
        break;
    }
  }
}
