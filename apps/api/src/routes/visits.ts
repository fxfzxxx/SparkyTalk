import { zValidator } from "@hono/zod-validator";
import { SiteVisitEventInput } from "@sparkytalk/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { sites, siteVisits } from "../db/schema";
import type { AppEnv } from "../lib/auth";

/** Geofence enter/exit and manual check-in/out from the worker's phone. */
export const visitRoutes = new Hono<AppEnv>().post(
  "/",
  zValidator("json", SiteVisitEventInput),
  async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, input.siteId), eq(sites.companyId, user.companyId)))
      .limit(1);
    if (!site) return c.json({ error: "not_found" }, 404);

    const [row] = await db
      .insert(siteVisits)
      .values({
        companyId: user.companyId,
        employeeId: user.id,
        siteId: input.siteId,
        type: input.type,
        at: new Date(input.at),
        location: input.location,
      })
      .returning();
    return c.json(row, 201);
  },
);
