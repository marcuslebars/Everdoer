/**
 * The ONE shared Retell agent behind the owner line (voice/owner-line.ts, docs/owner-line.md):
 * the assistant an owner reaches by calling their own business number from their own phone.
 * Like the outbound and sales agents its prompt is the `{{system_prompt}}` passthrough — each
 * call carries its own prompt and the company comes from the call's signed metadata, so one
 * agent serves every owner.
 *
 * Unlike the receptionist it has no customer tools (quote, book, capture a lead): it has
 * `business`, which runs the owner's text-command agent with the spoken request (for the
 * dialled business, or another of the owner's own when `business_name` says so), and
 * `web_lookup` for current information. General knowledge needs no tool: that is the model.
 *
 * The tool list lives on the agent, not in the per-call prompt: after changing it here, run
 * `npm run job:retell-owner-agent -- --apply` again so the live agent picks it up.
 *
 * buildOwnerAgentConfig() is the exact config; ensureOwnerAgent() creates or updates it
 * (src/server/jobs/retell-owner-agent.ts). What this file OWNS on the live agent: the prompt
 * passthrough, the tools and the call limits. What the dashboard may own: the model and the
 * voice. An update leaves those two alone unless they are set explicitly, so switching the
 * agent to a speech-to-speech model (Grok Voice, GPT Realtime) in Retell is not undone here.
 * Pure except ensureOwnerAgent / readOwnerAgent / publishOwnerAgent.
 */
import { retellFunctionSecretHeaderForWrite } from "@/server/services/retell/auth";
import type { RetellClient } from "@/server/services/retell/provision";
import { OWNER_AGENT_DEADLINE_MS } from "@/server/services/owner-channel/agent";
import { WEB_LOOKUP_DEADLINE_MS } from "@/server/services/voice/owner-web-lookup";

export const OWNER_AGENT_NAME = "Owner line (call your AI)";
export const OWNER_LINE_TOOL_PATH = "/api/retell/functions/owner-line";
/** A general assistant wants a stronger model than the receptionist's; RETELL_OWNER_AGENT_MODEL overrides. */
export const OWNER_AGENT_DEFAULT_MODEL = "claude-5.5-sonnet";
const OWNER_AGENT_DEFAULT_VOICE = "11labs-Adrian";

/** The agent's whole prompt in Retell: each call supplies the real one (voice/owner-line.ts buildOwnerLinePrompt). */
export const OWNER_AGENT_PROMPT = "{{system_prompt}}";

/** Used only if a call ever arrives without its own prompt. */
export const OWNER_FALLBACK_PROMPT =
  'You are an automated assistant. Say: "Sorry, I can\'t help on this line right now. Please text me instead." Then end the call.';

export interface OwnerAgentConfigInput {
  /** Public origin of this app (APP_BASE_URL) for the tools. */
  baseUrl: string;
  /** RETELL_FUNCTION_SECRET — sent as each tool's auth header. */
  functionSecret: string;
  /**
   * RETELL_OWNER_AGENT_MODEL. Unset: a NEW agent gets OWNER_AGENT_DEFAULT_MODEL, and an
   * existing one KEEPS the model it has (so a model picked in Retell's dashboard, e.g. a
   * speech-to-speech one, survives a re-run).
   */
  model?: string | null;
  /** RETELL_OWNER_AGENT_VOICE_ID. Unset: a new agent gets the default voice; an existing one keeps its voice. */
  voiceId?: string | null;
}

type Json = Record<string, unknown>;

export function buildOwnerAgentTools(input: Pick<OwnerAgentConfigInput, "baseUrl" | "functionSecret">): Json[] {
  const custom = (name: string, description: string, parameters: Json, speakDuring: string, timeoutMs: number): Json => ({
    type: "custom",
    name,
    description,
    url: `${input.baseUrl.replace(/\/+$/, "")}${OWNER_LINE_TOOL_PATH}`,
    method: "POST",
    headers: { [retellFunctionSecretHeaderForWrite()]: input.functionSecret },
    // Payload: args only stays OFF — the company comes from Retell's trusted `call` object.
    args_at_root: false,
    speak_during_execution: true,
    execution_message_description: speakDuring,
    speak_after_execution: true,
    timeout_ms: timeoutMs,
    parameters,
  });
  return [
    custom(
      "business",
      "Anything about the owner's own business records, or anything they want done in the business: jobs on a day, who is waiting on them, new leads, quotes still open, money owed, the day's briefing, look up a customer, open times, move or cancel a booking, text or call a customer, turn the AI on or off, pause texts, remember or recall a note. Returns `say`: what to tell the owner.",
      {
        type: "object",
        properties: {
          request: { type: "string", description: "The owner's request in their own words, with names, days and times exactly as they said them." },
          business_name: {
            type: "string",
            description: "Only when the owner means one of their OTHER businesses listed in your instructions: that business's name, spelled exactly as listed. Leave out for the business this call came in on.",
          },
          unlock_code: { type: "string", description: "The six-digit security code the owner read out on this call, digits only. Leave out until they have read one out; then include it every time." },
        },
        required: ["request"],
      },
      "Say briefly that you're checking the business records, e.g. \"One sec, let me pull that up.\"",
      OWNER_AGENT_DEADLINE_MS + 10_000,
    ),
    custom(
      "web_lookup",
      "Look something up on the web: anything current or that may have changed (news, weather, prices, another business's hours, events, rules, product details), or a fact you are not sure of. Returns `say`: a short answer to read out.",
      {
        type: "object",
        properties: { question: { type: "string", description: "The full question to answer, self-contained (include the place, date or product it is about)." } },
        required: ["question"],
      },
      "Say briefly that you're looking it up, e.g. \"Let me check that.\"",
      WEB_LOOKUP_DEADLINE_MS + 5_000,
    ),
    { type: "end_call", name: "end_call", description: "End the call once the owner says goodbye or is done." },
  ];
}

/**
 * Retell's speech-to-speech models: one model hears and speaks, so there is no separate text
 * model and the voice must be one of that model's own. PURE.
 */
export function isSpeechToSpeechModel(model: string | null | undefined): boolean {
  return /^(gpt-realtime|grok-voice)/i.test(model?.trim() ?? "");
}

/** How a model name is sent to Retell: speech-to-speech ones go in `model_config`. PURE. */
export function modelFields(model: string | null | undefined): Json {
  const name = model?.trim();
  if (!name) return {};
  return isSpeechToSpeechModel(name) ? { model_config: { type: "s2s", primary: { model: name } } } : { model: name };
}

/**
 * The exact config. `update: true` is for an agent that already exists: the model and the voice
 * are sent only when set explicitly, so whatever the live agent uses is kept.
 */
export function buildOwnerAgentConfig(input: OwnerAgentConfigInput, options: { update?: boolean } = {}): { llm: Json; agent: (llmId: string) => Json } {
  const model = input.model?.trim() || (options.update ? null : OWNER_AGENT_DEFAULT_MODEL);
  // A speech-to-speech model speaks with its own voices: never pair it with the default one.
  const voiceId = input.voiceId?.trim() || (options.update || isSpeechToSpeechModel(model) ? null : OWNER_AGENT_DEFAULT_VOICE);
  return {
    llm: {
      ...modelFields(model),
      start_speaker: "agent",
      // No begin message: the per-call prompt dictates the opening line.
      general_prompt: OWNER_AGENT_PROMPT,
      default_dynamic_variables: { system_prompt: OWNER_FALLBACK_PROMPT, company_name: "the business", owner_name: "" },
      general_tools: buildOwnerAgentTools(input),
    },
    agent: (llmId: string) => ({
      agent_name: OWNER_AGENT_NAME,
      response_engine: { type: "retell-llm", llm_id: llmId },
      ...(voiceId ? { voice_id: voiceId } : {}),
      ...(options.update ? {} : { language: "en-US" }),
      // No webhook_url and no post-call analysis: an owner call is not a lead. If the account has
      // a default webhook, /api/retell/webhook skips owner-line calls (isOwnerLineWebhook).
      max_call_duration_ms: 60 * 60_000,
      end_call_after_silence_ms: 45_000,
    }),
  };
}

type OwnerAgentIds = { llmId?: string | null; agentId?: string | null };

/**
 * Create or update the shared owner agent. Idempotent: pass the ids from the last run
 * (RETELL_OWNER_LLM_ID / RETELL_OWNER_AGENT_ID) and it updates them in place, keeping the
 * model and voice they have unless `model` / `voiceId` are given.
 */
export async function ensureOwnerAgent(
  client: RetellClient,
  input: OwnerAgentConfigInput & { existing?: OwnerAgentIds; keepTools?: Json[] },
): Promise<{ llmId: string; agentId: string; created: { llm: boolean; agent: boolean } }> {
  // Checked before anything is created, so a refusal leaves nothing half-made in Retell.
  if (!input.existing?.agentId && !buildOwnerAgentConfig(input).agent("x").voice_id) {
    throw new Error("A new agent on a speech-to-speech model needs RETELL_OWNER_AGENT_VOICE_ID (one of that model's own voices).");
  }
  const llmBody = buildOwnerAgentConfig(input, { update: Boolean(input.existing?.llmId) }).llm;
  // Tools someone added to the live agent by hand stay on it, after ours (liveExtraTools).
  if (input.keepTools?.length) llmBody.general_tools = [...(llmBody.general_tools as Json[]), ...input.keepTools];
  const llmId = input.existing?.llmId ? (await client.updateLlm(input.existing.llmId, llmBody)).llm_id : (await client.createLlm(llmBody)).llm_id;
  const agentBody = buildOwnerAgentConfig(input, { update: Boolean(input.existing?.agentId) }).agent(llmId);
  const agentId = input.existing?.agentId
    ? (await client.updateAgent(input.existing.agentId, agentBody)).agent_id
    : (await client.createAgent(agentBody)).agent_id;
  return { llmId, agentId, created: { llm: !input.existing?.llmId, agent: !input.existing?.agentId } };
}

// ── Reading the live agent back ───────────────────────────────────────────────

export type ToolState = "ok" | "missing" | "out_of_date";

export interface OwnerAgentReport {
  /** The model the live agent runs on, as Retell reports it. */
  model: string | null;
  speechToSpeech: boolean;
  voiceId: string | null;
  /** The live prompt is exactly the `{{system_prompt}}` passthrough (each call brings its own prompt). */
  promptIsPassthrough: boolean;
  /** Each tool this file defines, against what is live. */
  tools: Array<{ name: string; state: ToolState; detail?: string }>;
  /** Tools on the live agent that this file doesn't define (added by hand in the dashboard). */
  extraTools: string[];
  /** The version these settings are on, and whether that version is published or still a draft. */
  version: number | null;
  published: boolean | null;
  /** Everything this file owns is in place. */
  ok: boolean;
}

function rec(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function paramNames(tool: Json): string[] {
  return Object.keys(rec(rec(tool.parameters).properties)).sort();
}

/** What is different about a live tool, or null when it matches. Never includes a header value. PURE. */
function toolDifference(expected: Json, live: Json): string | null {
  if (expected.type !== live.type) return `type is ${String(live.type)}`;
  if (expected.type !== "custom") return null;
  if (expected.url !== live.url) return "points at a different address";
  const want = paramNames(expected);
  const have = paramNames(live);
  const lacking = want.filter((n) => !have.includes(n));
  if (lacking.length) return `no ${lacking.join(", ")} argument`;
  const surplus = have.filter((n) => !want.includes(n));
  if (surplus.length) return `unexpected ${surplus.join(", ")} argument`;
  if (live.args_at_root) return "sends arguments at the root";
  if (expected.description !== live.description) return "older description";
  const header = Object.keys(rec(expected.headers))[0];
  if (header && !text(rec(live.headers)[header])) return "no auth header";
  return null;
}

/** The live agent against what this file defines. PURE: takes Retell's own get-llm / get-agent bodies. */
export function ownerAgentReport(input: Pick<OwnerAgentConfigInput, "baseUrl" | "functionSecret">, live: { llm: unknown; agent: unknown }): OwnerAgentReport {
  const llm = rec(live.llm);
  const agent = rec(live.agent);
  const liveTools = (Array.isArray(llm.general_tools) ? llm.general_tools : []).map(rec);
  const expected = buildOwnerAgentTools(input);
  const tools = expected.map((want) => {
    const name = String(want.name);
    const have = liveTools.find((t) => t.name === name);
    if (!have) return { name, state: "missing" as const };
    const detail = toolDifference(want, have);
    return detail ? { name, state: "out_of_date" as const, detail } : { name, state: "ok" as const };
  });
  const model = text(rec(rec(llm.model_config).primary).model) ?? text(llm.s2s_model) ?? text(llm.model);
  const promptIsPassthrough = text(llm.general_prompt) === OWNER_AGENT_PROMPT;
  return {
    model,
    speechToSpeech: rec(llm.model_config).type === "s2s" || Boolean(text(llm.s2s_model)) || isSpeechToSpeechModel(model),
    voiceId: text(agent.voice_id),
    promptIsPassthrough,
    tools,
    extraTools: liveTools.map((t) => String(t.name)).filter((n) => !expected.some((e) => e.name === n)),
    version: typeof agent.version === "number" ? agent.version : null,
    published: typeof agent.is_published === "boolean" ? agent.is_published : null,
    ok: promptIsPassthrough && tools.every((t) => t.state === "ok"),
  };
}

/** Tools on the live LLM that this file doesn't define, exactly as Retell returned them. PURE. */
export function liveExtraTools(input: Pick<OwnerAgentConfigInput, "baseUrl" | "functionSecret">, liveLlm: unknown): Json[] {
  const liveTools = Array.isArray(rec(liveLlm).general_tools) ? (rec(liveLlm).general_tools as unknown[]).map(rec) : [];
  const ours = new Set(buildOwnerAgentTools(input).map((t) => t.name));
  return liveTools.filter((t) => !ours.has(t.name));
}

/** The report as plain lines for the job's output. PURE. */
export function describeOwnerAgentReport(report: OwnerAgentReport): string[] {
  const version = report.version === null ? "version unknown" : `version ${report.version}${report.published === null ? "" : report.published ? " (published)" : " (draft, not published)"}`;
  return [
    `Model:  ${report.model ?? "unknown"}${report.speechToSpeech ? " (speech-to-speech)" : ""}`,
    `Voice:  ${report.voiceId ?? "unknown"}`,
    `Prompt: ${report.promptIsPassthrough ? "ok: {{system_prompt}} (each call brings its own prompt)" : "NOT the {{system_prompt}} passthrough: calls would ignore their own prompt"}`,
    ...report.tools.map((t) => `Tool:   ${t.name}: ${t.state === "ok" ? "ok" : t.state === "missing" ? "MISSING" : `OUT OF DATE (${t.detail})`}`),
    ...(report.extraTools.length ? [`Other tools on the agent (added by hand; kept as they are): ${report.extraTools.join(", ")}`] : []),
    `Agent:  ${version}`,
  ];
}

/** Read the live agent and its LLM. Needs a client that can read (createRetellClient can). */
export async function readOwnerAgent(
  client: RetellClient,
  input: Pick<OwnerAgentConfigInput, "baseUrl" | "functionSecret">,
  ids: { llmId: string; agentId: string },
): Promise<{ report: OwnerAgentReport; extraTools: Json[] }> {
  if (!client.getLlm || !client.getAgent) throw new Error("This Retell client can't read agents back.");
  const [llm, agent] = await Promise.all([client.getLlm(ids.llmId), client.getAgent(ids.agentId)]);
  return { report: ownerAgentReport(input, { llm, agent }), extraTools: liveExtraTools(input, llm) };
}

/**
 * Publish the version the settings are on, if it is still a draft. Retell's update endpoints
 * write to the latest DRAFT; publishing makes that the version "latest published" resolves to.
 * Returns what happened; never throws (a failed publish is reported, the update still stands).
 */
export async function publishOwnerAgent(client: RetellClient, agentId: string, report: Pick<OwnerAgentReport, "version" | "published">): Promise<"published" | "already_published" | "unknown_version" | { failed: string }> {
  if (report.published === true) return "already_published";
  if (report.version === null || !client.publishAgentVersion) return "unknown_version";
  try {
    await client.publishAgentVersion(agentId, report.version);
    return "published";
  } catch (err) {
    return { failed: err instanceof Error ? err.message : String(err) };
  }
}
