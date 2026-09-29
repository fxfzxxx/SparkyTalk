import { zValidator } from "@hono/zod-validator";
import { CreateSiteInput, SetSiteLocationInput } from "@sparkytalk/shared";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { sites } from "../db/schema";
import { isManager, requireManager, type AppEnv } from "../lib/auth";
import { createSite, loadSites } from "../lib/sites";

export const siteRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await loadSites(db, c.get("user").companyId)))
  .post("/", requireManager, zValidator("json", CreateSiteInput), async (c) => {
    const input = c.req.valid("json");
    const site = await db.transaction((tx) => createSite(tx, c.get("user").companyId, input));
    return c.json(site, 201);
  })
  /**
   * Set or correct a site's location. Workers may call this too, for the
   * "我在这个工地" on-site capture when the address isn't on the map yet —
   * but only owners/admins can overwrite a location that is already set.
   */
  .put("/:id/location", zValidator("json", SetSiteLocationInput), async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const conditions = [eq(sites.id, c.req.param("id")), eq(sites.companyId, user.companyId)];
    if (!isManager(user)) conditions.push(isNull(sites.location));
    const geofence = input.geofence ?? { kind: "circle" as const, center: input.location, radiusM: 60 };
    const [row] = await db
      .update(sites)
      .set({ location: input.location, geofence, locationSource: input.source })
      .where(and(...conditions))
      .returning();
    if (!row) return c.json({ error: "not_found_or_already_located" }, 404);
    return c.json(row);
  });
