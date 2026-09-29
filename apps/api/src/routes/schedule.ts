import { isLocalDate, nzDate } from "@sparkytalk/shared";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { employees, jobs, scheduleEntries, sites, siteVisits } from "../db/schema";
import type { AppEnv } from "../lib/auth";

/** Planned entries for a day, joined with job/site/employee names. */
function planFor(companyId: string, date: string, employeeId?: string) {
  const conditions = [eq(scheduleEntries.companyId, companyId), eq(scheduleEntries.date, date)];
  if (employeeId) conditions.push(eq(scheduleEntries.employeeId, employeeId));
  return db
    .select({
      id: scheduleEntries.id,
      date: scheduleEntries.date,
      status: scheduleEntries.status,
      notes: scheduleEntries.notes,
      employeeId: employees.id,
      employeeName: employees.name,
      jobId: jobs.id,
      jobTitle: jobs.title,
      stage: jobs.stage,
      siteId: sites.id,
      siteName: sites.displayName,
      siteLocation: sites.location,
      siteGeofence: sites.geofence,
    })
    .from(scheduleEntries)
    .innerJoin(employees, eq(employees.id, scheduleEntries.employeeId))
    .innerJoin(jobs, eq(jobs.id, scheduleEntries.jobId))
    .innerJoin(sites, eq(sites.id, scheduleEntries.siteId))
    .where(and(...conditions))
    .orderBy(asc(employees.name), asc(scheduleEntries.createdAt));
}

/**
 * Site visit events for a NZ calendar day. Uses a ±1 day UTC window and then
 * filters by NZ date, which avoids hand-rolling DST offsets.
 */
async function visitsOn(companyId: string, date: string) {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 2);
  const rows = await db
    .select({
      employeeId: siteVisits.employeeId,
      siteId: siteVisits.siteId,
      siteName: sites.displayName,
      type: siteVisits.type,
      at: siteVisits.at,
    })
    .from(siteVisits)
    .innerJoin(sites, eq(sites.id, siteVisits.siteId))
    .where(
      and(eq(siteVisits.companyId, companyId), gte(siteVisits.at, start), lt(siteVisits.at, end)),
    )
    .orderBy(asc(siteVisits.at));
  return rows.filter((r) => nzDate(r.at) === date);
}

function dateParam(value: string | undefined) {
  if (value === undefined) return nzDate();
  return isLocalDate(value) ? value : null;
}

export const scheduleRoutes = new Hono<AppEnv>()
  /** Boss board: plan vs actual for everyone on a day. */
  .get("/", async (c) => {
    const date = dateParam(c.req.query("date"));
    if (!date) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
    const { companyId } = c.get("user");
    const [plan, visits] = await Promise.all([planFor(companyId, date), visitsOn(companyId, date)]);
    return c.json({ date, plan, visits });
  })
  /** Worker app: my jobs for a day. */
  .get("/me", async (c) => {
    const date = dateParam(c.req.query("date"));
    if (!date) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
    const user = c.get("user");
    return c.json({ date, plan: await planFor(user.companyId, date, user.id) });
  });
