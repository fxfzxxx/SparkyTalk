import { z } from "zod";
import { LocationSource, ProgressStatus, Role, Stage, SiteVisitEventType } from "../enums";

const Id = z.string().uuid();
const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const Employee = z.object({
  id: Id,
  name: z.string().min(1),
  /** Nicknames used in speech, e.g. "小张", "Zhang", "Johnny". Used by AI entity matching. */
  aliases: z.array(z.string()),
  role: Role,
  phone: z.string().nullable(),
});
export type Employee = z.infer<typeof Employee>;

export const GeoPoint = z.object({ lat: z.number(), lng: z.number() });
export type GeoPoint = z.infer<typeof GeoPoint>;

export const Geofence = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), center: GeoPoint, radiusM: z.number().positive() }),
  z.object({ kind: z.literal("polygon"), points: z.array(GeoPoint).min(3) }),
]);
export type Geofence = z.infer<typeof Geofence>;

export const Room = z.object({
  id: Id,
  name: z.string(),
  sortOrder: z.number().int(),
});
export type Room = z.infer<typeof Room>;

export const Level = z.object({
  id: Id,
  name: z.string(),
  sortOrder: z.number().int(),
  rooms: z.array(Room),
});
export type Level = z.infer<typeof Level>;

export const Site = z.object({
  id: Id,
  /** What people call it: official address, "Lot 23, Stage 2", or "老王那个新房". */
  displayName: z.string().min(1),
  officialAddress: z.string().nullable(),
  /** Legal description from the plans, e.g. "Lot 23 DP 512345". */
  legalDescription: z.string().nullable(),
  aliases: z.array(z.string()),
  location: GeoPoint.nullable(),
  geofence: Geofence.nullable(),
  locationSource: LocationSource.nullable(),
  floorAreaM2: z.number().nullable(),
  levels: z.array(Level),
});
export type Site = z.infer<typeof Site>;

export const CreateSiteInput = z.object({
  displayName: z.string().min(1),
  officialAddress: z.string().nullable().default(null),
  legalDescription: z.string().nullable().default(null),
  aliases: z.array(z.string()).default([]),
  floorAreaM2: z.number().nullable().default(null),
  levels: z
    .array(z.object({ name: z.string().min(1), rooms: z.array(z.string().min(1)) }))
    .default([]),
});
export type CreateSiteInput = z.infer<typeof CreateSiteInput>;

export const SetSiteLocationInput = z.object({
  location: GeoPoint,
  geofence: Geofence.nullable().default(null),
  source: LocationSource,
});
export type SetSiteLocationInput = z.infer<typeof SetSiteLocationInput>;

export const Job = z.object({
  id: Id,
  siteId: Id,
  title: z.string(),
  stage: Stage.nullable(),
  notes: z.string().nullable(),
});
export type Job = z.infer<typeof Job>;

/** The *plan*: who should be where on which day. */
export const ScheduleEntry = z.object({
  id: Id,
  jobId: Id,
  siteId: Id,
  employeeId: Id,
  date: LocalDateSchema,
  notes: z.string().nullable(),
});
export type ScheduleEntry = z.infer<typeof ScheduleEntry>;

/** The *actual*: a geofence or manual check-in/out event. */
export const SiteVisitEventInput = z.object({
  siteId: Id,
  type: SiteVisitEventType,
  at: z.string().datetime(),
  location: GeoPoint.nullable().default(null),
});
export type SiteVisitEventInput = z.infer<typeof SiteVisitEventInput>;

export const RoomProgress = z.object({
  roomId: Id,
  stage: Stage,
  status: ProgressStatus,
  remainingDays: z.number().nullable(),
});
export type RoomProgress = z.infer<typeof RoomProgress>;
