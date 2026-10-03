import { zValidator } from "@hono/zod-validator";
import {
  AddSiteItemInput,
  CreateSiteInput,
  SetSiteLocationInput,
  type SiteProgress,
} from "@sparkytalk/shared";
import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { employees, levels, roomProgress, rooms, siteItems, siteNotes, sites } from "../db/schema";
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
  })
  /** Room × stage progress and recent notes for one site. */
  .get("/:id/progress", async (c) => {
    const user = c.get("user");
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, c.req.param("id")), eq(sites.companyId, user.companyId)));
    if (!site) return c.json({ error: "not_found" }, 404);
    const roomIds = db
      .select({ id: rooms.id })
      .from(rooms)
      .innerJoin(levels, eq(rooms.levelId, levels.id))
      .where(eq(levels.siteId, site.id));
    const [cells, notes] = await Promise.all([
      db
        .select({
          roomId: roomProgress.roomId,
          stage: roomProgress.stage,
          status: roomProgress.status,
          remainingDays: roomProgress.remainingDays,
        })
        .from(roomProgress)
        .where(inArray(roomProgress.roomId, roomIds)),
      db
        .select({
          id: siteNotes.id,
          note: siteNotes.note,
          createdByName: employees.name,
          createdAt: siteNotes.createdAt,
        })
        .from(siteNotes)
        .innerJoin(employees, eq(siteNotes.createdBy, employees.id))
        .where(eq(siteNotes.siteId, site.id))
        .orderBy(desc(siteNotes.createdAt))
        .limit(20),
    ]);
    const progress: SiteProgress = {
      rooms: cells,
      notes: notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    };
    return c.json(progress);
  })
  .post("/:id/items", requireManager, zValidator("json", AddSiteItemInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, c.req.param("id")), eq(sites.companyId, user.companyId)));
    if (!site) return c.json({ error: "not_found" }, 404);
    const [last] = await db
      .select({ n: max(siteItems.sortOrder) })
      .from(siteItems)
      .where(eq(siteItems.siteId, site.id));
    const [item] = await db
      .insert(siteItems)
      .values({ siteId: site.id, ...input, sortOrder: (last?.n ?? -1) + 1 })
      .returning();
    return c.json(item, 201);
  })
  .delete("/:id/items/:itemId", requireManager, async (c) => {
    const user = c.get("user");
    const owned = db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, c.req.param("id")), eq(sites.companyId, user.companyId)));
    const rows = await db
      .delete(siteItems)
      .where(and(eq(siteItems.id, c.req.param("itemId")), inArray(siteItems.siteId, owned)))
      .returning({ id: siteItems.id });
    if (!rows.length) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });
