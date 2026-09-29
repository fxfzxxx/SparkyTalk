import type { ProposedAction } from "@sparkytalk/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({ db: {} }));
const { validateActions } = await import("./actions");

const boss = { id: "boss", companyId: "c1", name: "Boss", role: "owner" as const };
const worker = { id: "w1", companyId: "c1", name: "张伟", role: "worker" as const };
const known = {
  employeeIds: new Set(["boss", "w1", "w2"]),
  roomsBySite: new Map([
    ["s1", new Set(["r1", "r2"])],
    ["s2", new Set<string>()],
  ]),
};

const createJob: ProposedAction = {
  type: "create_job",
  site: { id: "s1", spoken: "151 coast rd" },
  title: "拉线",
  stage: "rough_in",
  assignees: [{ id: "w1", spoken: "小张" }],
  date: "2026-09-30",
  notes: null,
};

describe("validateActions", () => {
  it("accepts a fully resolved job from the owner", () => {
    expect(validateActions([createJob], boss, known)).toEqual([]);
  });

  it("rejects unresolved references", () => {
    const action = { ...createJob, assignees: [{ id: null, spoken: "小李" }] };
    expect(validateActions([action], boss, known)).toEqual([
      { index: 0, problem: 'unknown employee "小李"' },
    ]);
  });

  it("does not let workers create jobs", () => {
    expect(validateActions([createJob], worker, known)[0]?.problem).toMatch(/owners\/admins/);
  });

  it("lets workers move only themselves", () => {
    const move = (employeeId: string): ProposedAction => ({
      type: "change_schedule",
      employee: { id: employeeId, spoken: "me" },
      date: "2026-09-30",
      fromSite: null,
      toSite: { id: "s2", spoken: "22 Smith St" },
      timeNote: "下午",
      reason: "老板让我先去",
    });
    expect(validateActions([move("w1")], worker, known)).toEqual([]);
    expect(validateActions([move("w2")], worker, known)).toHaveLength(1);
  });

  it("rejects progress on rooms from another site", () => {
    const report: ProposedAction = {
      type: "report_progress",
      site: { id: "s2", spoken: "22 Smith St" },
      updates: [
        { roomId: "r1", roomSpoken: "Kitchen", stage: "rough_in", status: "done", remainingDays: null },
      ],
      note: null,
    };
    expect(validateActions([report], worker, known)).toEqual([
      { index: 0, problem: 'unknown room "Kitchen"' },
    ]);
  });
});
