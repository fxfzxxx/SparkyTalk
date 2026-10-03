import { describe, expect, it } from "vitest";
import { describeAction } from "./describe";

describe("describeAction report_progress", () => {
  it("groups rooms, lists work items and shows the note", () => {
    const rooms = (ids: string[], roomSpoken: string, stage: "prewire" | "rough_in", status: "done" | "in_progress" | "not_started") =>
      ids.map((roomId) => ({ roomId, roomSpoken, stage, status, remainingDays: null }));
    const text = describeAction({
      type: "report_progress",
      site: { id: "site-1", spoken: "151 Coast Rd" },
      updates: [
        ...rooms(["g1", "g2", "g3"], "一楼", "prewire", "done"),
        ...rooms(["g1", "g2", "g3"], "一楼", "rough_in", "in_progress"),
        ...rooms(["f1", "f2"], "二楼", "prewire", "done"),
        ...rooms(["f1", "f2"], "二楼", "rough_in", "not_started"),
      ],
      items: [
        { itemId: "i-mains", name: "主线缆", status: "not_started", remainingDays: null },
        { itemId: null, name: "EV 充电桩", status: "in_progress", remainingDays: 0.5 },
      ],
      note: "材料没到",
    });
    expect(text).toBe(
      "进度：151 Coast Rd — 一楼（3 间） 打洞/布管✅ 拉线⏳；二楼（2 间） 打洞/布管✅ 拉线未开始；主线缆未开始；新增工作项 EV 充电桩⏳（剩 0.5 天）。备注：材料没到",
    );
  });
});
