/**
 * The agent run log (docs/agent-kernel.md → "Run log"): one `agent_runs` row per agent run, so
 * every decision the AI made can be looked at afterwards — which tools it called with what, what
 * came back, how it stopped, what it said, what it cost in tokens and time.
 *
 * Best-effort: recordAgentRun never throws (a failed write is logged and the run goes on).
 * AGENT_RUN_LOG=off turns it off. Tool inputs/results are truncated and keys that look like
 * secrets are redacted before they're stored; rows are owner/admin-read only and purged after
 * AGENT_RUN_RETENTION_DAYS (default 90) by the worker.
 */
import type { AiUsageMeta } from "@/server/ai/claude";
import type { Inserts } from "@/server/db/database.types";
import type { AgentChannel, StoppedReason, ToolCallRecord } from "@/server/agent/runtime";
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type Env = Readonly<Record<string, string | undefined>>;

export const MAX_LOGGED_TOOL_CALLS = 30;
export const MAX_FIELD_CHARS = 2_000;
export const MAX_REPLY_CHARS = 2_000;
export const DEFAULT_RETENTION_DAYS = 90;

const SECRET_KEY = /(token|secret|password|passcode|\bpin\b|_pin$|^pin$|account_number|card_number|\bcvc\b|api_key|authorization|signature)/i;

export interface AgentRunRecord {
  organizationId: string;
  companyId: string | null;
  channel: AgentChannel;
  triggerRef?: string | null;
  model?: string | null;
  status: StoppedReason | "error";
  rounds: number;
  toolCalls: ToolCallRecord[];
  usage: AiUsageMeta[];
  durationMs: number;
  reply?: string | null;
  error?: string | null;
}

export function runLogEnabled(env: Env = process.env): boolean {
  const v = env.AGENT_RUN_LOG?.trim().toLowerCase();
  return !(v === "off" || v === "0" || v === "false");
}

export function retentionDays(env: Env = process.env): number {
  const n = Number.parseInt(env.AGENT_RUN_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(3_650, n) : DEFAULT_RETENTION_DAYS;
}

/** Deep copy with secret-looking keys replaced by "[redacted]". PURE. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

/** Redacted, then cut to MAX_FIELD_CHARS of JSON (kept as JSON when it fits, else a string). PURE. */
export function compact(value: unknown): unknown {
  const clean = redact(value);
  const json = JSON.stringify(clean ?? null);
  if (json.length <= MAX_FIELD_CHARS) return clean ?? null;
  return `${json.slice(0, MAX_FIELD_CHARS - 1)}…`;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(2_147_483_647, Math.round(n)));
}

/** The agent_runs row for a run. PURE. */
export function toRunRow(rec: AgentRunRecord): Inserts<"agent_runs"> {
  const sum = (pick: (u: AiUsageMeta["usage"]) => number) => clamp(rec.usage.reduce((t, u) => t + (pick(u.usage) || 0), 0));
  return {
    organization_id: rec.organizationId,
    company_id: rec.companyId,
    channel: rec.channel,
    trigger_ref: rec.triggerRef ?? null,
    model: rec.model ?? rec.usage[0]?.model ?? null,
    status: rec.status,
    rounds: clamp(rec.rounds),
    tool_calls: rec.toolCalls.slice(0, MAX_LOGGED_TOOL_CALLS).map((c) => ({
      name: c.name,
      is_error: c.isError,
      input: compact(c.input),
      result: compact(c.result),
    })) as Inserts<"agent_runs">["tool_calls"],
    tool_count: rec.toolCalls.length,
    input_tokens: sum((u) => u.inputTokens),
    output_tokens: sum((u) => u.outputTokens),
    cache_read_tokens: sum((u) => u.cacheReadTokens),
    cache_write_tokens: sum((u) => u.cacheWriteTokens),
    duration_ms: clamp(rec.durationMs),
    reply: rec.reply ? rec.reply.slice(0, MAX_REPLY_CHARS) : null,
    error: rec.error ? rec.error.slice(0, 500) : null,
  };
}

/** Write one run. Never throws; returns the row id, or null when off / it failed. */
export async function recordAgentRun(admin: AdminClient, rec: AgentRunRecord, env: Env = process.env): Promise<string | null> {
  if (!runLogEnabled(env)) return null;
  try {
    const { data, error } = await admin.from("agent_runs").insert(toRunRow(rec)).select("id").maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.error("[agent-runs] failed to record a run:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Delete runs older than the retention window (a bounded batch). Never throws; returns rows deleted. */
export async function purgeAgentRuns(admin: AdminClient, nowMs: number, env: Env = process.env, batch = 5_000): Promise<number> {
  try {
    const cutoff = new Date(nowMs - retentionDays(env) * 86_400_000).toISOString();
    const { data: old, error } = await admin.from("agent_runs").select("id").lt("created_at", cutoff).limit(batch);
    if (error) throw error;
    const ids = ((old ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return 0;
    const { error: deleteError } = await admin.from("agent_runs").delete().in("id", ids);
    if (deleteError) throw deleteError;
    return ids.length;
  } catch (err) {
    console.error("[agent-runs] purge failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
