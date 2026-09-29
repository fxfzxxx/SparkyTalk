import type { Geofence, GeoPoint, ProposedAction } from "@sparkytalk/shared";
import { sql } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["owner", "admin", "worker"]);
export const stageEnum = pgEnum("stage", [
  "prewire",
  "rough_in",
  "fit_off",
  "testing",
  "certification",
]);
export const progressStatusEnum = pgEnum("progress_status", ["not_started", "in_progress", "done"]);
export const locationSourceEnum = pgEnum("location_source", [
  "geocode",
  "parcel",
  "pin",
  "onsite",
  "learned",
]);
export const scheduleStatusEnum = pgEnum("schedule_status", ["planned", "cancelled", "moved"]);
export const visitTypeEnum = pgEnum("visit_type", [
  "enter",
  "exit",
  "manual_checkin",
  "manual_checkout",
]);
export const proposalKindEnum = pgEnum("proposal_kind", ["command", "blueprint"]);
export const proposalStatusEnum = pgEnum("proposal_status", ["pending", "confirmed", "rejected"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const companyId = () =>
  uuid("company_id")
    .notNull()
    .references(() => companies.id);

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const employees = pgTable(
  "employees",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    role: roleEnum("role").notNull(),
    phone: text("phone"),
    createdAt: createdAt(),
  },
  (t) => [index("employees_company_idx").on(t.companyId)],
);

export const sites = pgTable(
  "sites",
  {
    id: id(),
    companyId: companyId(),
    displayName: text("display_name").notNull(),
    officialAddress: text("official_address"),
    legalDescription: text("legal_description"),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    location: jsonb("location").$type<GeoPoint>(),
    geofence: jsonb("geofence").$type<Geofence>(),
    locationSource: locationSourceEnum("location_source"),
    floorAreaM2: doublePrecision("floor_area_m2"),
    createdAt: createdAt(),
  },
  (t) => [index("sites_company_idx").on(t.companyId)],
);

export const levels = pgTable("levels", {
  id: id(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const rooms = pgTable("rooms", {
  id: id(),
  levelId: uuid("level_id")
    .notNull()
    .references(() => levels.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const jobs = pgTable("jobs", {
  id: id(),
  companyId: companyId(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  title: text("title").notNull(),
  stage: stageEnum("stage"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => employees.id),
  createdAt: createdAt(),
});

/** The plan: who should be where on which day. */
export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: id(),
    companyId: companyId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    date: date("date", { mode: "string" }).notNull(),
    status: scheduleStatusEnum("status").notNull().default("planned"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("schedule_company_date_idx").on(t.companyId, t.date)],
);

/** Audit log of plan changes: who changed what, when and why. */
export const scheduleChanges = pgTable("schedule_changes", {
  id: id(),
  companyId: companyId(),
  fromEntryId: uuid("from_entry_id").references(() => scheduleEntries.id),
  toEntryId: uuid("to_entry_id").references(() => scheduleEntries.id),
  changedBy: uuid("changed_by")
    .notNull()
    .references(() => employees.id),
  reason: text("reason"),
  createdAt: createdAt(),
});

/** The actual: geofence and manual check-in/out events. */
export const siteVisits = pgTable(
  "site_visits",
  {
    id: id(),
    companyId: companyId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    type: visitTypeEnum("type").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    location: jsonb("location").$type<GeoPoint>(),
    createdAt: createdAt(),
  },
  (t) => [index("site_visits_company_at_idx").on(t.companyId, t.at)],
);

/** Progress matrix: one row per room × stage. */
export const roomProgress = pgTable(
  "room_progress",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    stage: stageEnum("stage").notNull(),
    status: progressStatusEnum("status").notNull(),
    remainingDays: doublePrecision("remaining_days"),
    updatedBy: uuid("updated_by").references(() => employees.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.stage] })],
);

/**
 * Every AI interpretation, kept for review and evaluation.
 * Nothing is applied until a person confirms it.
 */
export const aiProposals = pgTable("ai_proposals", {
  id: id(),
  companyId: companyId(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => employees.id),
  kind: proposalKindEnum("kind").notNull(),
  input: text("input").notNull(),
  output: jsonb("output").$type<{ summary?: string; actions?: ProposedAction[] } & Record<string, unknown>>().notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  status: proposalStatusEnum("status").notNull().default("pending"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});
