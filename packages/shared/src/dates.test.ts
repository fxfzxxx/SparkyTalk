import { describe, expect, it } from "vitest";
import { addDays, isLocalDate, nzDate, weekday } from "./dates";

describe("dates", () => {
  it("uses the New Zealand calendar date", () => {
    // 2026-09-29 20:00 UTC is already 2026-09-30 in Auckland (NZDT, UTC+13)
    expect(nzDate(new Date("2026-09-29T20:00:00Z"))).toBe("2026-09-30");
    expect(nzDate(new Date("2026-09-29T09:00:00Z"))).toBe("2026-09-29");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("validates and names dates", () => {
    expect(isLocalDate("2026-09-30")).toBe(true);
    expect(isLocalDate("30/09/2026")).toBe(false);
    expect(weekday("2026-09-30")).toBe("Wednesday");
  });
});
