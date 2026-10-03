import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { BlueprintExtraction, CommandInterpretation } from "@sparkytalk/shared";
import { describe, expect, it } from "vitest";
import { renderCommandContext } from "./interpret-command";

describe("structured output schemas", () => {
  it("convert to JSON schema for the API", () => {
    for (const schema of [CommandInterpretation, BlueprintExtraction]) {
      const format = betaZodOutputFormat(schema);
      expect(format.type).toBe("json_schema");
      expect(JSON.stringify(format.schema)).toContain('"additionalProperties":false');
    }
  });

  it("parses a representative model output", () => {
    const parsed = CommandInterpretation.parse({
      summary: "明天安排张伟去 151 Coast Rd 拉线",
      actions: [
        {
          type: "create_job",
          site: { id: "site-1", spoken: "151 coast rd" },
          title: "拉线",
          stage: "rough_in",
          assignees: [{ id: "emp-1", spoken: "小张" }],
          date: "2026-09-30",
          notes: null,
        },
      ],
    });
    expect(parsed.actions[0]?.type).toBe("create_job");
  });
});

describe("renderCommandContext", () => {
  it("includes NZ today/tomorrow and entity ids", () => {
    const text = renderCommandContext({
      today: "2026-09-29",
      speaker: { id: "boss", name: "Aaron", role: "owner" },
      speakerSitesToday: ["site-1"],
      employees: [{ id: "emp-1", name: "张伟", aliases: ["小张"], role: "worker" }],
      sites: [
        {
          id: "site-1",
          displayName: "151 Coast Rd",
          officialAddress: null,
          aliases: [],
          levels: [],
          items: [{ id: "item-1", name: "主线缆", aliases: ["mains"], status: "not_started", remainingDays: null }],
        },
      ],
    });
    expect(text).toContain("2026-09-29 (Tuesday)");
    expect(text).toContain("Tomorrow: 2026-09-30");
    expect(text).toContain('"id":"emp-1"');
    expect(text).toContain(`Speaker's sites today: ["site-1"]`);
    expect(text).toContain('"items":[{"id":"item-1","name":"主线缆","aliases":["mains"]}]');
  });
});
