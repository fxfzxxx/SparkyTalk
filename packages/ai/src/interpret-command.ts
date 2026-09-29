import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  CommandInterpretation,
  addDays,
  weekday,
  type Employee,
  type LocalDate,
  type Site,
} from "@sparkytalk/shared";
import { AiParseError, AiRefusalError, FALLBACK_BETA, MODEL, getClient } from "./client";
import { COMMAND_PROMPT_VERSION, COMMAND_SYSTEM_PROMPT } from "./prompts/command";

export interface CommandContext {
  today: LocalDate;
  speaker: Pick<Employee, "id" | "name" | "role">;
  employees: Pick<Employee, "id" | "name" | "aliases" | "role">[];
  sites: Pick<Site, "id" | "displayName" | "officialAddress" | "aliases" | "levels">[];
}

export function renderCommandContext(ctx: CommandContext): string {
  const employees = ctx.employees.map((e) => ({
    id: e.id,
    name: e.name,
    aliases: e.aliases,
    role: e.role,
  }));
  const sites = ctx.sites.map((s) => ({
    id: s.id,
    name: s.displayName,
    address: s.officialAddress,
    aliases: s.aliases,
    levels: s.levels.map((l) => ({
      name: l.name,
      rooms: l.rooms.map((r) => ({ id: r.id, name: r.name })),
    })),
  }));
  return [
    `Today in New Zealand: ${ctx.today} (${weekday(ctx.today)}). Tomorrow: ${addDays(ctx.today, 1)}.`,
    `Speaker: ${ctx.speaker.name} (id ${ctx.speaker.id}, role ${ctx.speaker.role}).`,
    `Employees: ${JSON.stringify(employees)}`,
    `Sites: ${JSON.stringify(sites)}`,
  ].join("\n");
}

export interface InterpretResult {
  interpretation: CommandInterpretation;
  promptVersion: string;
  model: string;
}

export async function interpretCommand(
  transcript: string,
  ctx: CommandContext,
): Promise<InterpretResult> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(CommandInterpretation) },
    system: [{ type: "text", text: COMMAND_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `${renderCommandContext(ctx)}\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new AiRefusalError(response.stop_details?.category ?? null);
  }
  if (!response.parsed_output) {
    throw new AiParseError(response.stop_reason);
  }
  return {
    interpretation: response.parsed_output,
    promptVersion: COMMAND_PROMPT_VERSION,
    model: response.model,
  };
}
