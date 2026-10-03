import { zValidator } from "@hono/zod-validator";
import {
  AiParseError,
  AiRefusalError,
  extractBlueprint,
  interpretCommand,
  type CommandContext,
} from "@sparkytalk/ai";
import {
  CreateSiteInput,
  ProposedAction,
  VoiceCommandRequest,
  nzDate,
  type Site,
} from "@sparkytalk/shared";
import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db } from "../db/client";
import { aiProposals, employees, scheduleEntries } from "../db/schema";
import { applyActions, validateActions, type KnownEntities } from "../lib/actions";
import { isManager, requireManager, type AppEnv, type AuthUser } from "../lib/auth";
import { createSite, loadSites } from "../lib/sites";

const MAX_PDF_BYTES = 32 * 1024 * 1024;

function knownEntities(employeeIds: string[], sites: Site[]): KnownEntities {
  return {
    employeeIds: new Set(employeeIds),
    roomsBySite: new Map(
      sites.map((s) => [s.id, new Set(s.levels.flatMap((l) => l.rooms.map((r) => r.id)))]),
    ),
    itemsBySite: new Map(sites.map((s) => [s.id, new Set(s.items.map((i) => i.id))])),
  };
}

async function loadContext(user: AuthUser) {
  const today = nzDate();
  const [staff, sites, todaysPlan] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        aliases: employees.aliases,
        role: employees.role,
      })
      .from(employees)
      .where(eq(employees.companyId, user.companyId)),
    loadSites(db, user.companyId),
    db
      .select({ siteId: scheduleEntries.siteId })
      .from(scheduleEntries)
      .where(
        and(
          eq(scheduleEntries.companyId, user.companyId),
          eq(scheduleEntries.employeeId, user.id),
          eq(scheduleEntries.date, today),
          eq(scheduleEntries.status, "planned"),
        ),
      ),
  ]);
  const ctx: CommandContext = {
    today,
    speaker: { id: user.id, name: user.name, role: user.role },
    speakerSitesToday: [...new Set(todaysPlan.map((p) => p.siteId))],
    employees: staff,
    sites,
  };
  return { ctx, known: knownEntities(staff.map((e) => e.id), sites) };
}

function aiError(c: Context<AppEnv>, err: unknown) {
  if (err instanceof AiRefusalError) return c.json({ error: "ai_refused", detail: err.message }, 422);
  if (err instanceof AiParseError) return c.json({ error: "ai_unparseable", detail: err.message }, 502);
  throw err;
}

const ConfirmBody = z.union([
  z.object({ actions: z.array(ProposedAction).optional() }),
  z.object({ site: CreateSiteInput }),
]);

export const aiRoutes = new Hono<AppEnv>()
  /** Speech (already transcribed) or typed text → proposed actions awaiting confirmation. */
  .post("/command", zValidator("json", VoiceCommandRequest), async (c) => {
    const user = c.get("user");
    const { transcript } = c.req.valid("json");
    const { ctx, known } = await loadContext(user);

    let result;
    try {
      result = await interpretCommand(transcript, ctx);
    } catch (err) {
      return aiError(c, err);
    }

    const [proposal] = await db
      .insert(aiProposals)
      .values({
        companyId: user.companyId,
        createdBy: user.id,
        kind: "command",
        input: transcript,
        output: result.interpretation,
        promptVersion: result.promptVersion,
        model: result.model,
      })
      .returning({ id: aiProposals.id });

    return c.json({
      proposalId: proposal!.id,
      ...result.interpretation,
      // Shown on the confirmation card so the user can fix references before confirming.
      issues: validateActions(result.interpretation.actions, user, known),
    });
  })

  /** Blueprint PDF → extracted site details for the owner to review. */
  .post("/blueprint", requireManager, async (c) => {
    const user = c.get("user");
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File) || file.type !== "application/pdf") {
      return c.json({ error: "upload a PDF in the 'file' field" }, 400);
    }
    if (file.size > MAX_PDF_BYTES) return c.json({ error: "PDF is larger than 32 MB" }, 413);

    let result;
    try {
      result = await extractBlueprint(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      return aiError(c, err);
    }

    const [proposal] = await db
      .insert(aiProposals)
      .values({
        companyId: user.companyId,
        createdBy: user.id,
        kind: "blueprint",
        input: file.name,
        output: result.extraction,
        promptVersion: result.promptVersion,
        model: result.model,
      })
      .returning({ id: aiProposals.id });

    return c.json({ proposalId: proposal!.id, ...result.extraction });
  })

  /**
   * Confirm a proposal. The body may carry the user's edits:
   * `{ actions }` for commands, `{ site }` for blueprints.
   */
  .post("/proposals/:id/confirm", zValidator("json", ConfirmBody), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const [proposal] = await db
      .select()
      .from(aiProposals)
      .where(and(eq(aiProposals.id, c.req.param("id")), eq(aiProposals.companyId, user.companyId)))
      .limit(1);
    if (!proposal) return c.json({ error: "not_found" }, 404);
    if (proposal.status !== "pending") return c.json({ error: "already_resolved" }, 409);
    if (proposal.createdBy !== user.id && !isManager(user)) {
      return c.json({ error: "forbidden" }, 403);
    }

    let actions: ProposedAction[] = [];
    let siteInput: CreateSiteInput | undefined;
    if (proposal.kind === "command") {
      if ("site" in body) return c.json({ error: "expected actions" }, 400);
      actions = body.actions ?? proposal.output.actions ?? [];
      const { known } = await loadContext(user);
      const issues = validateActions(actions, user, known);
      if (issues.length) return c.json({ error: "unresolved", issues }, 422);
    } else {
      if (!("site" in body)) return c.json({ error: "expected site" }, 400);
      if (!isManager(user)) return c.json({ error: "forbidden" }, 403);
      siteInput = body.site;
    }

    const outcome = await db.transaction(async (tx) => {
      // Conditional update guards against double confirmation.
      const claimed = await tx
        .update(aiProposals)
        .set({ status: "confirmed", resolvedAt: new Date() })
        .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, "pending")))
        .returning({ id: aiProposals.id });
      if (!claimed.length) return null;
      if (siteInput) return { site: await createSite(tx, user.companyId, siteInput) };
      await applyActions(tx, user, actions);
      return { applied: actions.length };
    });
    if (!outcome) return c.json({ error: "already_resolved" }, 409);
    return c.json(outcome);
  })

  .post("/proposals/:id/reject", async (c) => {
    const user = c.get("user");
    const conditions = [
      eq(aiProposals.id, c.req.param("id")),
      eq(aiProposals.companyId, user.companyId),
      eq(aiProposals.status, "pending"),
    ];
    if (!isManager(user)) conditions.push(eq(aiProposals.createdBy, user.id));
    const rows = await db
      .update(aiProposals)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(and(...conditions))
      .returning({ id: aiProposals.id });
    if (!rows.length) return c.json({ error: "not_found_or_resolved" }, 404);
    return c.json({ ok: true });
  });
