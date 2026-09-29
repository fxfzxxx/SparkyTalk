import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

/**
 * Server-side refusal fallback: if the primary model declines, the API re-runs
 * the request on Anthropic's recommended fallback model within the same call.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let shared: Anthropic | undefined;

/** Lazily constructed so importing this package never requires an API key. */
export function getClient(): Anthropic {
  shared ??= new Anthropic();
  return shared;
}

export class AiRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Model declined the request${category ? ` (${category})` : ""}`);
    this.name = "AiRefusalError";
  }
}

export class AiParseError extends Error {
  constructor(readonly stopReason: string | null) {
    super(`Model output could not be parsed (stop_reason: ${stopReason})`);
    this.name = "AiParseError";
  }
}
