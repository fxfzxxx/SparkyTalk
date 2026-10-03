import { STAGE_LABELS, type ProgressStatus } from "./enums";
import type { ProposedAction } from "./schemas/ai";

function statusMark(status: ProgressStatus): string {
  return status === "done" ? "✅" : status === "in_progress" ? "⏳" : "未开始";
}

/** Human-readable line for a proposed action on the confirmation card. */
export function describeAction(action: ProposedAction): string {
  switch (action.type) {
    case "create_job": {
      const who = action.assignees.map((a) => a.spoken).join("、") || "（未指派）";
      const stage = action.stage ? STAGE_LABELS[action.stage].zh : action.title;
      return `新建工作：${who} ${action.date ?? "（日期未定）"} 去 ${action.site.spoken} ${stage}`;
    }
    case "change_schedule":
      return `改计划：${action.employee.spoken} ${action.date}${action.timeNote ? ` ${action.timeNote}` : ""} ${
        action.fromSite ? `从 ${action.fromSite.spoken} ` : ""
      }改去 ${action.toSite.spoken}`;
    case "report_progress": {
      // "一楼" expands to one update per room; show each spoken place once with its room count.
      const places = new Map<string, { rooms: Set<string | null>; stages: string[] }>();
      for (const u of action.updates) {
        const place = places.get(u.roomSpoken) ?? { rooms: new Set(), stages: [] };
        place.rooms.add(u.roomId);
        const stage = `${STAGE_LABELS[u.stage].zh}${statusMark(u.status)}${
          u.remainingDays ? `（剩 ${u.remainingDays} 天）` : ""
        }`;
        if (!place.stages.includes(stage)) place.stages.push(stage);
        places.set(u.roomSpoken, place);
      }
      const parts = [...places].map(
        ([spoken, { rooms, stages }]) =>
          `${spoken}${rooms.size > 1 ? `（${rooms.size} 间）` : ""} ${stages.join(" ")}`,
      );
      for (const item of action.items) {
        parts.push(
          `${item.itemId ? "" : "新增工作项 "}${item.name}${statusMark(item.status)}${
            item.remainingDays ? `（剩 ${item.remainingDays} 天）` : ""
          }`,
        );
      }
      return `进度：${action.site.spoken} — ${parts.join("；")}${action.note ? `。备注：${action.note}` : ""}`;
    }
    case "clarify":
      return `需要确认：${action.question}`;
  }
}
