import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { BlueprintExtraction } from "@sparkytalk/shared";
import { AiParseError, AiRefusalError, FALLBACK_BETA, MODEL, getClient } from "./client";
import { BLUEPRINT_PROMPT_VERSION, BLUEPRINT_SYSTEM_PROMPT } from "./prompts/blueprint";

export interface BlueprintResult {
  extraction: BlueprintExtraction;
  promptVersion: string;
  model: string;
}

/** @param pdf the raw PDF bytes (max ~32 MB per request). */
export async function extractBlueprint(pdf: Uint8Array): Promise<BlueprintResult> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(BlueprintExtraction) },
    system: BLUEPRINT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(pdf).toString("base64"),
            },
          },
          { type: "text", text: "Extract the site details from these plans." },
        ],
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
    extraction: response.parsed_output,
    promptVersion: BLUEPRINT_PROMPT_VERSION,
    model: response.model,
  };
}
