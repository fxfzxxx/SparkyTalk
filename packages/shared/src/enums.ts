import { z } from "zod";

export const Role = z.enum(["owner", "admin", "worker"]);
export type Role = z.infer<typeof Role>;

/** Electrical work stages, in the order they normally happen on site. */
export const Stage = z.enum([
  "prewire", // 打洞 / 布管
  "rough_in", // 拉线
  "fit_off", // 装面板
  "testing", // 测试
  "certification", // CoC / ESC
]);
export type Stage = z.infer<typeof Stage>;

export const STAGE_LABELS: Record<Stage, { zh: string; en: string }> = {
  prewire: { zh: "打洞/布管", en: "Pre-wire" },
  rough_in: { zh: "拉线", en: "Rough-in" },
  fit_off: { zh: "装面板", en: "Fit-off" },
  testing: { zh: "测试", en: "Testing" },
  certification: { zh: "证书", en: "CoC / ESC" },
};

export const ProgressStatus = z.enum(["not_started", "in_progress", "done"]);
export type ProgressStatus = z.infer<typeof ProgressStatus>;

/** How a site's location was obtained. See CLAUDE.md §6. */
export const LocationSource = z.enum([
  "geocode", // official address found in the address database
  "parcel", // LINZ parcel polygon from Lot/DP
  "pin", // dropped manually on a map
  "onsite", // captured from a phone while standing on site
  "learned", // inferred from repeated unscheduled stays
]);
export type LocationSource = z.infer<typeof LocationSource>;

export const ScheduleEntryStatus = z.enum(["planned", "cancelled", "moved"]);
export type ScheduleEntryStatus = z.infer<typeof ScheduleEntryStatus>;

export const SiteVisitEventType = z.enum(["enter", "exit", "manual_checkin", "manual_checkout"]);
export type SiteVisitEventType = z.infer<typeof SiteVisitEventType>;

export const ProposalStatus = z.enum(["pending", "confirmed", "rejected"]);
export type ProposalStatus = z.infer<typeof ProposalStatus>;
