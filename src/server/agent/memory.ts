/**
 * Agent memory (docs/agent-kernel.md → "Memory").
 *
 * Short-term — `agent_turns`: one row per exchange on a thread (the owner's texts today). The
 * owner agent replays the last few turns from the recent hours, so a follow-up ("actually make it
 * 4pm", "and tell her the price too") knows what it refers to.
 *
 * Long-term — `agent_notes`: facts the owner asks the agent to keep, about the business or one
 * customer. The owner agent and the customer texting agent read them; the owner adds / forgets
 * them by text (owner-channel/tools.ts remember / list_notes / forget_note).
 *
 * Everything is scoped to one organization + company (every query filters by both), written
 * with the service role, and best-effort where it rides along a reply (recordTurn never throws).
 */
import type { Inserts, Tables } from "@/server/db/database.types";
import type { AgentChannel, ToolCallRecord } from "@/server/agent/runtime";
import { compact } from "@/server/agent/run-log";
import { fromJson, toJson } from "@/server/db/json";
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface MemoryScope {
  organizationId: string;
  companyId: string;
}

// ── Short-term: turns ─────────────────────────────────────────────────────────

/** Turns older than this don't come back into the conversation. */
export const TURN_WINDOW_MS = 6 * 60 * 60 * 1000;
/** At most this many earlier exchanges are replayed. */
export const MAX_TURNS = 8;
export const TURN_RETENTION_DAYS = 30;
const MAX_TURN_TEXT = 1_000;

export interface TurnAction {
  tool: string;
  ok: boolean;
  input: unknown;
  result: unknown;
}

export interface MemoryTurn {
  at: string;
  userText: string;
  reply: string | null;
  intent: string | null;
  actions: TurnAction[];
}

/** Kernel tool calls → what's worth remembering (compacted, secrets redacted). PURE. */
export function turnActions(calls: ToolCallRecord[]): TurnAction[] {
  return calls.slice(0, 12).map((c) => ({ tool: c.name, ok: !c.isError && !isFailure(c.result), input: compact(c.input), result: compact(c.result) }));
}

function isFailure(result: unknown): boolean {
  const r = result as { error?: unknown; ok?: unknown } | null;
  return Boolean(r && typeof r === "object" && ("error" in r || r.ok === false));
}

export async function recordTurn(
  admin: AdminClient,
  input: MemoryScope & { channel: AgentChannel; threadKey: string; userText: string; reply: string | null; intent?: string | null; actions?: TurnAction[]; sourceRef?: string | null; atMs?: number },
): Promise<void> {
  try {
    const row: Inserts<"agent_turns"> = {
      organization_id: input.organizationId,
      company_id: input.companyId,
      channel: input.channel,
      thread_key: input.threadKey.slice(0, 200),
      user_text: input.userText.slice(0, MAX_TURN_TEXT),
      reply: input.reply ? input.reply.slice(0, MAX_TURN_TEXT) : null,
      intent: input.intent ?? null,
      actions: toJson(input.actions ?? []),
      source_ref: input.sourceRef ?? null,
      created_at: new Date(input.atMs ?? Date.now()).toISOString(),
    };
    const { error } = await admin.from("agent_turns").insert(row);
    if (error) throw error;
  } catch (err) {
    console.error("[agent-memory] failed to record a turn:", err instanceof Error ? err.message : err);
  }
}

/** The recent exchanges on a thread, oldest first (excluding `excludeRef`). Never throws (→ []). */
export async function recentTurns(
  admin: AdminClient,
  input: MemoryScope & { channel: AgentChannel; threadKey: string; nowMs: number; excludeRef?: string | null; windowMs?: number; limit?: number },
): Promise<MemoryTurn[]> {
  try {
    const since = new Date(input.nowMs - (input.windowMs ?? TURN_WINDOW_MS)).toISOString();
    const { data, error } = await admin
      .from("agent_turns")
      .select("created_at, user_text, reply, intent, actions, source_ref")
      .eq("organization_id", input.organizationId)
      .eq("company_id", input.companyId)
      .eq("channel", input.channel)
      .eq("thread_key", input.threadKey)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit((input.limit ?? MAX_TURNS) + 1);
    if (error) throw error;
    const rows = ((data ?? []) as Array<Pick<Tables<"agent_turns">, "created_at" | "user_text" | "reply" | "intent" | "actions" | "source_ref">>)
      .filter((r) => !input.excludeRef || r.source_ref !== input.excludeRef)
      .slice(0, input.limit ?? MAX_TURNS);
    return rows.reverse().map((r) => ({
      at: r.created_at,
      userText: r.user_text,
      reply: r.reply,
      intent: r.intent,
      actions: Array.isArray(r.actions) ? fromJson<TurnAction[]>(r.actions) : [],
    }));
  } catch (err) {
    console.error("[agent-memory] failed to read turns:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Delete turns past the retention window (a bounded batch). Never throws. */
export async function purgeTurns(admin: AdminClient, nowMs: number, batch = 5_000): Promise<number> {
  try {
    const cutoff = new Date(nowMs - TURN_RETENTION_DAYS * 86_400_000).toISOString();
    const { data, error } = await admin.from("agent_turns").select("id").lt("created_at", cutoff).limit(batch);
    if (error) throw error;
    const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return 0;
    const { error: deleteError } = await admin.from("agent_turns").delete().in("id", ids);
    if (deleteError) throw deleteError;
    return ids.length;
  } catch (err) {
    console.error("[agent-memory] turn purge failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

// ── Long-term: notes ──────────────────────────────────────────────────────────

export const MAX_NOTE_CHARS = 500;
/** Active notes per company (business + customers together). */
export const MAX_ACTIVE_NOTES = 300;
/** Notes shown to an agent at once (newest first). */
export const NOTES_IN_PROMPT = 15;

export type NoteSource = "owner_sms" | "app" | "customer_sms" | "voice" | "system";

export interface AgentNote {
  id: string;
  contactId: string | null;
  body: string;
  createdAt: string;
}

type NoteRow = Pick<Tables<"agent_notes">, "id" | "contact_id" | "body" | "created_at">;

const toNote = (r: NoteRow): AgentNote => ({ id: r.id, contactId: r.contact_id, body: r.body, createdAt: r.created_at });

/**
 * Active notes, newest first. `contactId`: undefined → business notes only; a string → that
 * customer's notes only. Never throws (→ []).
 */
export async function listNotes(admin: AdminClient, scope: MemoryScope, opts: { contactId?: string; limit?: number } = {}): Promise<AgentNote[]> {
  try {
    let query = admin
      .from("agent_notes")
      .select("id, contact_id, body, created_at")
      .eq("organization_id", scope.organizationId)
      .eq("company_id", scope.companyId)
      .is("archived_at", null);
    query = opts.contactId ? query.eq("contact_id", opts.contactId) : query.is("contact_id", null);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(opts.limit ?? NOTES_IN_PROMPT);
    if (error) throw error;
    return ((data ?? []) as NoteRow[]).map(toNote);
  } catch (err) {
    console.error("[agent-memory] failed to read notes:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** A note as the model may store it: plain one-paragraph text, trimmed. PURE. */
export function cleanNote(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, MAX_NOTE_CHARS);
}

/** `note` when saved; `reason` (for the owner) when not. */
export interface AddNoteResult {
  ok: boolean;
  note?: AgentNote;
  reason?: string;
}

/** Add a note (the contact, when given, must already be checked to belong to the scope). */
export async function addNote(
  admin: AdminClient,
  scope: MemoryScope,
  input: { contactId: string | null; body: unknown; source: NoteSource; createdBy?: string | null },
): Promise<AddNoteResult> {
  const body = cleanNote(input.body);
  if (!body) return { ok: false, reason: "What should I remember?" };
  const { data: active, error: countError } = await admin
    .from("agent_notes")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .is("archived_at", null)
    .limit(MAX_ACTIVE_NOTES);
  if (countError) throw countError;
  if (((active ?? []) as unknown[]).length >= MAX_ACTIVE_NOTES) return { ok: false, reason: `That's ${MAX_ACTIVE_NOTES} notes — forget a few old ones first.` };
  const { data, error } = await admin
    .from("agent_notes")
    .insert({
      organization_id: scope.organizationId,
      company_id: scope.companyId,
      contact_id: input.contactId,
      body,
      source: input.source,
      created_by: input.createdBy ?? null,
    })
    .select("id, contact_id, body, created_at")
    .single();
  if (error) throw error;
  return { ok: true, note: toNote(data as NoteRow) };
}

/** Archive one note of this company. False when there's no such active note. */
export async function forgetNote(admin: AdminClient, scope: MemoryScope, noteId: unknown, nowMs: number): Promise<boolean> {
  if (typeof noteId !== "string" || !/^[\w-]{1,64}$/.test(noteId)) return false;
  const { data, error } = await admin
    .from("agent_notes")
    .update({ archived_at: new Date(nowMs).toISOString() })
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("id", noteId)
    .is("archived_at", null)
    .select("id");
  if (error) {
    if ((error as { code?: string }).code === "22P02") return false; // not a uuid
    throw error;
  }
  return ((data ?? []) as unknown[]).length > 0;
}

/** Notes as a fenced block for a prompt (data, not instructions). PURE. */
export function notesBlock(tag: string, notes: AgentNote[], timeZone: string): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone, month: "short", day: "numeric" });
  const safe = (t: string) => t.replace(/<\/?[a-z_]+[^>]*>/gi, "[tag removed]");
  return `<${tag}>\n${notes.map((n) => `- (${day(n.createdAt)}) ${safe(n.body)}`).join("\n")}\n</${tag}>`;
}
