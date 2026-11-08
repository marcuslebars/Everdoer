import type Anthropic from "@anthropic-ai/sdk";

/**
 * "No up-front thinking" differs by model (docs: build-with-claude/thinking → per-model table):
 *
 *   - Claude Sonnet 5.5 rejects `{ type: "disabled" }` with a 400; its lowest setting is
 *     `{ type: "between_tools" }` (no thinking before answering; short progress notes between
 *     tool calls come back as thinking blocks, which runAgentLoop already passes back unchanged).
 *   - Claude Opus 5.5, Fable and Mythos have no off setting at all (both values 400): send no
 *     `thinking` field and they use adaptive thinking.
 *   - Everything else (Sonnet 5, Opus 5, Haiku 5.5, the 4.x models) takes `{ type: "disabled" }`.
 *
 * The SMS agent shipped sending "disabled" to its Sonnet 5.5 default, so every customer text
 * failed and was handed to the owner. Always build the field with this. PURE.
 */
export type ThinkingOff = { type: "disabled" } | { type: "between_tools" };

export function thinkingOff(model: string): ThinkingOff | undefined {
  const m = model.trim().toLowerCase();
  if (/^claude-sonnet-5-5\b/.test(m)) return { type: "between_tools" };
  if (/^claude-opus-5-5\b/.test(m) || /^claude-(fable|mythos)-/.test(m)) return undefined;
  return { type: "disabled" };
}

/**
 * Spread into a Messages API request: `{ ...thinkingOffField(model) }`. Typed as the SDK's
 * ThinkingConfigParam because the installed @anthropic-ai/sdk predates "between_tools" (the API
 * accepts it; the SDK just forwards the object).
 */
export function thinkingOffField(model: string): { thinking?: Anthropic.ThinkingConfigParam } {
  const t = thinkingOff(model);
  return t ? { thinking: t as unknown as Anthropic.ThinkingConfigParam } : {};
}
