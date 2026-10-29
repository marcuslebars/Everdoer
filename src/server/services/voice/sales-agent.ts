/**
 * The ONE shared Retell agent that places sales calls for every company (docs/sales-calls.md).
 * Like the owner-call outbound agent, its prompt is the `{{system_prompt}}` passthrough: each call
 * carries its own prompt (retell/outbound-prompt.ts → buildSalesCallPrompt) built from that
 * company's facts. Unlike it, this agent has tools — the receptionist's price-list quote,
 * availability, booking and deposit link, plus the shared skills — so it can actually quote and
 * book. The tools find the company from the call (the company's own number we dial from) and
 * the customer from the number we dialled (retell/functions.ts normalises outbound calls).
 *
 * buildSalesAgentConfig() is the exact config; ensureSalesAgent() creates or updates it
 * (src/server/jobs/retell-sales-agent.ts). Pure except ensureSalesAgent.
 */
import type { RetellClient } from "@/server/services/retell/provision";
import { buildReceptionistTools } from "@/server/services/retell/receptionist-tools";

export const SALES_AGENT_NAME = "Sales calls (speed-to-lead)";

/** The tools a sales call may use. No capture_lead (it would file the lead again), no invoices. */
export const SALES_TOOL_NAMES = ["find_services", "quote_services", "check_availability", "book_job", "send_deposit_link", "message_owner", "business_notes", "end_call"] as const;

/** Used only if a call ever arrives without its own prompt: say who we are and hang up politely. */
export const SALES_FALLBACK_PROMPT =
  "You are an automated assistant. Say: \"Sorry, I've called at a bad time — someone from the team will be in touch.\" Then end the call.";

/**
 * Post-call analysis the agent fills (sales-calls/queue.ts → recordSalesCallOutcome reads these).
 * `do_not_call_requested` puts the number on the company's do-not-call list.
 */
export const SALES_AGENT_ANALYSIS_FIELDS: Array<Record<string, unknown>> = [
  { type: "string", name: "caller_name", description: "The customer's name, as they gave it. Empty if not given." },
  {
    type: "enum",
    name: "sales_outcome",
    description: "How the call ended for the sale.",
    choices: ["booked", "quote_sent", "interested_follow_up", "call_back_later", "not_interested", "do_not_call", "wrong_number", "no_conversation"],
  },
  { type: "boolean", name: "do_not_call_requested", description: "True if they said not to call them again, asked to be removed, or objected to being called." },
  { type: "string", name: "callback_time", description: "When they'd prefer to be called back, if they said (e.g. 'tomorrow after 5')." },
  { type: "string", name: "services_interested", description: "The services they were interested in, in a few words." },
];

export interface SalesAgentConfigInput {
  /** Public origin of this app (APP_BASE_URL) for the tools + webhook. */
  baseUrl: string;
  /** RETELL_FUNCTION_SECRET — sent as each tool's auth header. */
  functionSecret: string;
  voiceId?: string;
}

/** The sales tools, taken from the receptionist's (same routes, same secret header). PURE. */
export function buildSalesAgentTools(input: SalesAgentConfigInput): Array<Record<string, unknown>> {
  const wanted = new Set<string>(SALES_TOOL_NAMES);
  const tools = buildReceptionistTools({ baseUrl: input.baseUrl, functionSecret: input.functionSecret, marine: false }).filter((t) => wanted.has(String(t.name)));
  return tools.map((t) =>
    t.name === "end_call" ? { ...t, description: "End the call politely once you've wrapped up, they asked not to be called, or it's a wrong number." } : t,
  );
}

export function buildSalesAgentConfig(input: SalesAgentConfigInput): { llm: Record<string, unknown>; agent: (llmId: string) => Record<string, unknown> } {
  const base = input.baseUrl.replace(/\/+$/, "");
  return {
    llm: {
      model: "gpt-4.1",
      start_speaker: "agent",
      // No begin message: the per-call prompt dictates the opening line.
      general_prompt: "{{system_prompt}}",
      default_dynamic_variables: { system_prompt: SALES_FALLBACK_PROMPT, customer_name: "", company_name: "the business" },
      general_tools: buildSalesAgentTools(input),
    },
    agent: (llmId: string) => ({
      agent_name: SALES_AGENT_NAME,
      response_engine: { type: "retell-llm", llm_id: llmId },
      voice_id: input.voiceId ?? "11labs-Adrian",
      language: "en-US",
      webhook_url: `${base}/api/retell/webhook`,
      post_call_analysis_data: SALES_AGENT_ANALYSIS_FIELDS,
      max_call_duration_ms: 10 * 60_000,
      end_call_after_silence_ms: 20_000,
    }),
  };
}

/**
 * Create or update the shared sales agent. Idempotent: pass the ids from the last run
 * (RETELL_SALES_LLM_ID / RETELL_SALES_AGENT_ID) and it updates them in place.
 */
export async function ensureSalesAgent(
  client: RetellClient,
  input: SalesAgentConfigInput & { existing?: { llmId?: string | null; agentId?: string | null } },
): Promise<{ llmId: string; agentId: string; created: { llm: boolean; agent: boolean } }> {
  const config = buildSalesAgentConfig(input);
  const llmId = input.existing?.llmId ? (await client.updateLlm(input.existing.llmId, config.llm)).llm_id : (await client.createLlm(config.llm)).llm_id;
  const agentBody = config.agent(llmId);
  const agentId = input.existing?.agentId
    ? (await client.updateAgent(input.existing.agentId, agentBody)).agent_id
    : (await client.createAgent(agentBody)).agent_id;
  return { llmId, agentId, created: { llm: !input.existing?.llmId, agent: !input.existing?.agentId } };
}

/** RETELL_SALES_AGENT_ID, or null when sales calls aren't set up on this deployment. */
export function salesAgentId(): string | null {
  return process.env.RETELL_SALES_AGENT_ID?.trim() || null;
}
