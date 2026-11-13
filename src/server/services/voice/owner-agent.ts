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
 * (src/server/jobs/retell-owner-agent.ts). Pure except ensureOwnerAgent.
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

/** Used only if a call ever arrives without its own prompt. */
export const OWNER_FALLBACK_PROMPT =
  'You are an automated assistant. Say: "Sorry, I can\'t help on this line right now. Please text me instead." Then end the call.';

export interface OwnerAgentConfigInput {
  /** Public origin of this app (APP_BASE_URL) for the tools. */
  baseUrl: string;
  /** RETELL_FUNCTION_SECRET — sent as each tool's auth header. */
  functionSecret: string;
  model?: string | null;
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

export function buildOwnerAgentConfig(input: OwnerAgentConfigInput): { llm: Json; agent: (llmId: string) => Json } {
  return {
    llm: {
      model: input.model?.trim() || OWNER_AGENT_DEFAULT_MODEL,
      start_speaker: "agent",
      // No begin message: the per-call prompt dictates the opening line.
      general_prompt: "{{system_prompt}}",
      default_dynamic_variables: { system_prompt: OWNER_FALLBACK_PROMPT, company_name: "the business", owner_name: "" },
      general_tools: buildOwnerAgentTools(input),
    },
    agent: (llmId: string) => ({
      agent_name: OWNER_AGENT_NAME,
      response_engine: { type: "retell-llm", llm_id: llmId },
      voice_id: input.voiceId?.trim() || OWNER_AGENT_DEFAULT_VOICE,
      language: "en-US",
      // No webhook_url and no post-call analysis: an owner call is not a lead. If the account has
      // a default webhook, /api/retell/webhook skips owner-line calls (isOwnerLineWebhook).
      max_call_duration_ms: 60 * 60_000,
      end_call_after_silence_ms: 45_000,
    }),
  };
}

/**
 * Create or update the shared owner agent. Idempotent: pass the ids from the last run
 * (RETELL_OWNER_LLM_ID / RETELL_OWNER_AGENT_ID) and it updates them in place.
 */
export async function ensureOwnerAgent(
  client: RetellClient,
  input: OwnerAgentConfigInput & { existing?: { llmId?: string | null; agentId?: string | null } },
): Promise<{ llmId: string; agentId: string; created: { llm: boolean; agent: boolean } }> {
  const config = buildOwnerAgentConfig(input);
  const llmId = input.existing?.llmId ? (await client.updateLlm(input.existing.llmId, config.llm)).llm_id : (await client.createLlm(config.llm)).llm_id;
  const agentBody = config.agent(llmId);
  const agentId = input.existing?.agentId
    ? (await client.updateAgent(input.existing.agentId, agentBody)).agent_id
    : (await client.createAgent(agentBody)).agent_id;
  return { llmId, agentId, created: { llm: !input.existing?.llmId, agent: !input.existing?.agentId } };
}
