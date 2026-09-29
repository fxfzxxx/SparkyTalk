import { STAGE_LABELS } from "./enums";
import type { ProposedAction } from "./schemas/ai";

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
    case "report_progress":
      return `进度：${action.site.spoken} — ${action.updates
        .map(
          (u) =>
            `${u.roomSpoken} ${STAGE_LABELS[u.stage].zh}${
              u.status === "done" ? "✅" : u.status === "in_progress" ? "⏳" : "未开始"
            }${u.remainingDays ? `（剩 ${u.remainingDays} 天）` : ""}`,
        )
        .join("，")}`;
    case "clarify":
      return `需要确认：${action.question}`;
  }
}
