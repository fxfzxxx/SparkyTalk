/**
 * Actions the AI proposes from speech/text. Nothing here is executed directly:
 * every action is shown to the user as a confirmation card first (CLAUDE.md, AI 通用原则 2).
 *
 * These schemas double as Claude structured-output schemas, so every field is
 * required (use nullable for "unknown") and objects are closed.
 */
import { z } from "zod";
import { ProgressStatus, Stage } from "../enums";

/** A reference the model resolved (or failed to resolve) against known entities. */
const EntityRef = z.object({
  /** Matched id from the provided context, or null if no confident match. */
  id: z.string().nullable(),
  /** What the user actually said, e.g. "小张" or "151 coast rd". */
  spoken: z.string(),
});
export type EntityRef = z.infer<typeof EntityRef>;

export const CreateJobAction = z.object({
  type: z.literal("create_job"),
  site: EntityRef,
  title: z.string(),
  stage: Stage.nullable(),
  assignees: z.array(EntityRef),
  /** YYYY-MM-DD in Pacific/Auckland. */
  date: z.string().nullable(),
  notes: z.string().nullable(),
});

export const ChangeScheduleAction = z.object({
  type: z.literal("change_schedule"),
  employee: EntityRef,
  date: z.string(),
  /** Site the worker was planned at, if mentioned. */
  fromSite: EntityRef.nullable(),
  toSite: EntityRef,
  /** Free-text timing like "下午" / "after lunch". */
  timeNote: z.string().nullable(),
  reason: z.string().nullable(),
});

export const ReportProgressAction = z.object({
  type: z.literal("report_progress"),
  site: EntityRef,
  updates: z.array(
    z.object({
      /** Room id from the site structure; null when the room is unknown. */
      roomId: z.string().nullable(),
      roomSpoken: z.string(),
      stage: Stage,
      status: ProgressStatus,
      remainingDays: z.number().nullable(),
    }),
  ),
  note: z.string().nullable(),
});

export const ClarifyAction = z.object({
  type: z.literal("clarify"),
  question: z.string(),
});

export const ProposedAction = z.discriminatedUnion("type", [
  CreateJobAction,
  ChangeScheduleAction,
  ReportProgressAction,
  ClarifyAction,
]);
export type ProposedAction = z.infer<typeof ProposedAction>;

export const CommandInterpretation = z.object({
  actions: z.array(ProposedAction),
  /** One-line summary for the confirmation card, in the user's language. */
  summary: z.string(),
});
export type CommandInterpretation = z.infer<typeof CommandInterpretation>;

export const BlueprintExtraction = z.object({
  address: z.string().nullable(),
  legalDescription: z.string().nullable(),
  /** Only a number written on the plans (area schedule / title block), never measured. */
  floorAreaM2: z.number().nullable(),
  levels: z.array(
    z.object({
      name: z.string(),
      rooms: z.array(z.string()),
    }),
  ),
  confidence: z.object({
    address: z.enum(["high", "medium", "low"]),
    floorArea: z.enum(["high", "medium", "low"]),
    rooms: z.enum(["high", "medium", "low"]),
  }),
  notes: z.string().nullable(),
});
export type BlueprintExtraction = z.infer<typeof BlueprintExtraction>;

export const VoiceCommandRequest = z.object({
  transcript: z.string().min(1),
});
export type VoiceCommandRequest = z.infer<typeof VoiceCommandRequest>;
