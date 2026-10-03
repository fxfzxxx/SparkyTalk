import { DEFAULT_SITE_ITEMS, type CreateSiteInput, type Site } from "@sparkytalk/shared";
import { asc, eq, inArray } from "drizzle-orm";
import type { Db, Tx } from "../db/client";
import { levels, rooms, siteItems, sites } from "../db/schema";

/** Loads a company's sites with their level/room tree. */
export async function loadSites(db: Db | Tx, companyId: string): Promise<Site[]> {
  const siteRows = await db
    .select()
    .from(sites)
    .where(eq(sites.companyId, companyId))
    .orderBy(asc(sites.displayName));
  if (siteRows.length === 0) return [];

  const levelRows = await db
    .select()
    .from(levels)
    .where(
      inArray(
        levels.siteId,
        siteRows.map((s) => s.id),
      ),
    )
    .orderBy(asc(levels.sortOrder));
  const roomRows = levelRows.length
    ? await db
        .select()
        .from(rooms)
        .where(
          inArray(
            rooms.levelId,
            levelRows.map((l) => l.id),
          ),
        )
        .orderBy(asc(rooms.sortOrder))
    : [];
  const itemRows = await db
    .select()
    .from(siteItems)
    .where(
      inArray(
        siteItems.siteId,
        siteRows.map((s) => s.id),
      ),
    )
    .orderBy(asc(siteItems.sortOrder), asc(siteItems.updatedAt));

  return siteRows.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    officialAddress: s.officialAddress,
    legalDescription: s.legalDescription,
    aliases: s.aliases,
    location: s.location,
    geofence: s.geofence,
    locationSource: s.locationSource,
    floorAreaM2: s.floorAreaM2,
    levels: levelRows
      .filter((l) => l.siteId === s.id)
      .map((l) => ({
        id: l.id,
        name: l.name,
        sortOrder: l.sortOrder,
        rooms: roomRows
          .filter((r) => r.levelId === l.id)
          .map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder })),
      })),
    items: itemRows
      .filter((i) => i.siteId === s.id)
      .map((i) => ({
        id: i.id,
        name: i.name,
        aliases: i.aliases,
        status: i.status,
        remainingDays: i.remainingDays,
      })),
  }));
}

export async function createSite(tx: Tx, companyId: string, input: CreateSiteInput) {
  const [site] = await tx
    .insert(sites)
    .values({
      companyId,
      displayName: input.displayName,
      officialAddress: input.officialAddress,
      legalDescription: input.legalDescription,
      aliases: input.aliases,
      floorAreaM2: input.floorAreaM2,
    })
    .returning();
  if (!site) throw new Error("insert failed");

  for (const [i, level] of input.levels.entries()) {
    const [levelRow] = await tx
      .insert(levels)
      .values({ siteId: site.id, name: level.name, sortOrder: i })
      .returning();
    if (!levelRow) throw new Error("insert failed");
    if (level.rooms.length) {
      await tx
        .insert(rooms)
        .values(level.rooms.map((name, j) => ({ levelId: levelRow.id, name, sortOrder: j })));
    }
  }
  await tx
    .insert(siteItems)
    .values(DEFAULT_SITE_ITEMS.map((item, i) => ({ siteId: site.id, ...item, sortOrder: i })));
  return site;
}
