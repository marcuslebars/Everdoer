/**
 * Owner call requests (docs/owner-call-requests.md): "call Dave, tell him the lift is fixed and
 * ask if Thursday still works". The command agent proposes the call (tools.ts →
 * call_customer), the owner confirms with a code (owner-commands.ts → executeOwnerCommand),
 * the call is placed now or by the scheduler at `run_at` (processDueOwnerCalls), and the Retell
 * call_analyzed webhook writes the outcome and texts the owner once (recordOwnerCallOutcome).
 *
 * Every row is pinned to the owner's resolved company; nothing here trusts an id from a text
 * or from Retell's metadata without the organization it came with.
 */
import { z } from "zod";

import type { Json, Tables } from "@/server/db/database.types";
import { toJson } from "@/server/db/json";
import { UserFacingError } from "@/server/errors";
import { UsageCapExceeded } from "@/server/organizations/context";
import { addDays, localDate, zonedInstant } from "@/server/services/booking-windows";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { BRIEF_ASK_FOR_MAX, BRIEF_PURPOSE_MAX, type OwnerCallBrief } from "@/server/services/retell/outbound-prompt";
import { toPlainText } from "@/server/services/sms-agent/guard";
import { callContactWithMarina, toE164 } from "@/server/services/voice";
import { requireReceptionistMinutes } from "@/server/services/voice/minutes";
import { ctxFor, ownerAlertGate, OWNER_ALERTS_SUMMARY, sendOwnerSms, shortWhen } from "./common";
import type { CompanyScope } from "./schedule";

export type OwnerCallRequestRow = Tables<"owner_call_requests">;

/** Owner-requested calls per company per local day (env OWNER_CALLS_DAILY_CAP). */
export const DEFAULT_OWNER_CALLS_DAILY_CAP = 30;
/** When a call with no stated time may be placed (env OWNER_CALLS_HOURS, "HH:MM-HH:MM"). */
export const DEFAULT_OWNER_CALLS_HOURS = "08:00-20:00";
/** A scheduled call may be booked this far out. */
const MAX_SCHEDULE_DAYS = 14;
/** A worker that claimed a due call and vanished loses the claim after this long. */
const STALE_CLAIM_MS = 15 * 60_000;
/** A proposed call nobody confirmed is expired after this long (the code itself dies at 30 min). */
const PROPOSAL_TTL_MS = 30 * 60_000;
/** Result texts keep the call summary to this many characters. */
const SUMMARY_MAX = 220;
/** A call shorter than this with no "successful" verdict is a ring, not a conversation. */
const REACHED_MIN_MS = 5000;
/** Retell disconnection reasons that mean nobody picked up (ring time still counts as duration). */
const NOT_CONNECTED_REASONS = /^(dial_|error|invalid_destination|user_declined|telephony_provider|sip_routing|marked_as_spam|concurrency_limit|no_valid_payment|scam_detected)/;
const VOICEMAIL_REASONS = /^(voicemail_reached|machine_detected)$/;

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function ownerCallsDailyCap(): number {
  return envPositiveInt("OWNER_CALLS_DAILY_CAP", DEFAULT_OWNER_CALLS_DAILY_CAP);
}

/** "08:00-20:00" → minutes since midnight; a malformed value falls back to the default. PURE. */
export function parseCallHours(raw: string | undefined | null): { startMin: number; endMin: number } {
  const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(raw ?? "");
  const parsed = m ? { startMin: Number(m[1]) * 60 + Number(m[2]), endMin: Number(m[3]) * 60 + Number(m[4]) } : null;
  if (!parsed || parsed.startMin >= parsed.endMin || parsed.endMin > 24 * 60) return parseCallHours(DEFAULT_OWNER_CALLS_HOURS);
  return parsed;
}

export function ownerCallHours(): { startMin: number; endMin: number } {
  return parseCallHours(process.env.OWNER_CALLS_HOURS);
}

// ── The brief ─────────────────────────────────────────────────────────────────

function tidy(text: unknown): string {
  return typeof text === "string" ? toPlainText(text).replace(/\s+/g, " ").trim() : "";
}

export const briefInputSchema = z.object({
  purpose: z.string().transform(tidy).pipe(z.string().min(1, "What should Marina tell them?").max(BRIEF_PURPOSE_MAX, `Keep the message under ${BRIEF_PURPOSE_MAX} characters - you confirm it word for word.`)),
  ask_for: z
    .string()
    .optional()
    .nullable()
    .transform((v) => tidy(v) || null)
    .pipe(z.string().max(BRIEF_ASK_FOR_MAX, `Keep the question under ${BRIEF_ASK_FOR_MAX} characters.`).nullable()),
  if_voicemail: z.enum(["leave_message", "hang_up"]).optional().nullable(),
  when: z.string().optional().nullable(),
});

export function readBrief(row: Pick<OwnerCallRequestRow, "brief">): OwnerCallBrief | null {
  const b = row.brief && typeof row.brief === "object" && !Array.isArray(row.brief) ? (row.brief as Record<string, unknown>) : null;
  if (!b || typeof b.purpose !== "string" || typeof b.who !== "string") return null;
  return {
    purpose: b.purpose,
    askFor: typeof b.askFor === "string" && b.askFor ? b.askFor : null,
    ifVoicemail: b.ifVoicemail === "hang_up" ? "hang_up" : "leave_message",
    who: b.who,
  };
}

// ── When ──────────────────────────────────────────────────────────────────────

export type ResolvedCallTime = { runAtMs: number; immediate: boolean; label: string };

function localMinutes(nowMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(nowMs));
  const [h, m] = parts.split(":").map(Number);
  return (h % 24) * 60 + m;
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * "now" → now. Blank → now inside calling hours, else the next opening (today's start if it's
 * still ahead, otherwise tomorrow's). "YYYY-MM-DD HH:MM" (company local) → that instant, which
 * must be ahead and within MAX_SCHEDULE_DAYS. PURE given nowMs.
 */
export function resolveCallTime(when: string | null | undefined, nowMs: number, timeZone: string): ResolvedCallTime | { error: string } {
  const raw = (when ?? "").trim().toLowerCase();
  if (raw === "now" || raw === "asap" || raw === "right away") return { runAtMs: nowMs, immediate: true, label: "now" };
  const hours = ownerCallHours();
  if (!raw) {
    const minutes = localMinutes(nowMs, timeZone);
    if (minutes >= hours.startMin && minutes < hours.endMin) return { runAtMs: nowMs, immediate: true, label: "now" };
    const today = localDate(new Date(nowMs), timeZone);
    const day = minutes < hours.startMin ? today : addDays(today, 1);
    const at = zonedInstant(day, hhmm(hours.startMin), timeZone);
    return { runAtMs: at.getTime(), immediate: false, label: shortWhen(at.toISOString(), timeZone) };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ t](\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return { error: "Give the time as YYYY-MM-DD HH:MM (local), or say 'now'." };
  const [, y, mo, d, hh, mm] = m.map(Number) as [unknown, number, number, number, number, number];
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || hh > 23 || mm > 59) return { error: "That date or time doesn't look right." };
  const at = zonedInstant(`${m[1]}-${m[2]}-${m[3]}`, `${String(hh).padStart(2, "0")}:${m[5]}`, timeZone);
  if (!Number.isFinite(at.getTime())) return { error: "That date doesn't look right." };
  if (at.getTime() <= nowMs) return { error: "That time has already passed - say 'now' or give a later time." };
  if (at.getTime() > nowMs + MAX_SCHEDULE_DAYS * 86_400_000) return { error: `I can only schedule a call up to ${MAX_SCHEDULE_DAYS} days ahead.` };
  return { runAtMs: at.getTime(), immediate: false, label: shortWhen(at.toISOString(), timeZone) };
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export async function findScopedCallRequest(admin: AdminClient, scope: Pick<CompanyScope, "organizationId" | "companyId">, requestId: unknown): Promise<OwnerCallRequestRow | null> {
  if (typeof requestId !== "string" || !requestId) return null;
  const { data } = await admin
    .from("owner_call_requests")
    .select("*")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("id", requestId)
    .maybeSingle();
  return (data as OwnerCallRequestRow | null) ?? null;
}

/** The open request for a customer, if any (proposed / scheduled / dialing). */
export async function openCallRequestFor(admin: AdminClient, scope: Pick<CompanyScope, "organizationId" | "companyId">, contactId: string): Promise<OwnerCallRequestRow | null> {
  const { data } = await admin
    .from("owner_call_requests")
    .select("*")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("contact_id", contactId)
    .in("status", ["proposed", "scheduled", "dialing"])
    .limit(1);
  return ((data ?? []) as OwnerCallRequestRow[])[0] ?? null;
}

export async function createCallRequest(
  admin: AdminClient,
  input: { scope: Pick<CompanyScope, "organizationId" | "companyId">; contactId: string; brief: OwnerCallBrief; runAtMs: number; ownerPhone: string },
): Promise<OwnerCallRequestRow | "already_open"> {
  const { data, error } = await admin
    .from("owner_call_requests")
    .insert({
      organization_id: input.scope.organizationId,
      company_id: input.scope.companyId,
      contact_id: input.contactId,
      requested_by_phone: input.ownerPhone,
      brief: toJson(input.brief) as Json,
      status: "proposed",
      run_at: new Date(input.runAtMs).toISOString(),
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return "already_open";
    throw error;
  }
  return data as OwnerCallRequestRow;
}

export async function attachApproval(admin: AdminClient, requestId: string, approvalId: string): Promise<void> {
  const { error } = await admin.from("owner_call_requests").update({ approval_id: approvalId }).eq("id", requestId);
  if (error) throw error;
}

async function setStatus(admin: AdminClient, requestId: string, from: string[], patch: Record<string, unknown>): Promise<OwnerCallRequestRow | null> {
  const { data, error } = await admin.from("owner_call_requests").update(patch).eq("id", requestId).in("status", from).select("*");
  if (error) throw error;
  return ((data ?? []) as OwnerCallRequestRow[])[0] ?? null;
}

/** Cancel an open request (the owner changed their mind). Returns the row if it was open. */
export async function cancelCallRequest(admin: AdminClient, requestId: string): Promise<OwnerCallRequestRow | null> {
  return setStatus(admin, requestId, ["proposed", "scheduled"], { status: "cancelled" });
}

export async function expireCallRequest(admin: AdminClient, requestId: string): Promise<OwnerCallRequestRow | null> {
  return setStatus(admin, requestId, ["proposed"], { status: "expired" });
}

/**
 * The confirmation an open request was waiting on is gone (it expired, or three wrong codes
 * rejected it) without going through executeOwnerCommand: close the request with it.
 */
export async function closeCallRequestForApproval(admin: AdminClient, approvalId: string, status: "expired" | "cancelled"): Promise<void> {
  const { error } = await admin.from("owner_call_requests").update({ status }).eq("approval_id", approvalId).eq("status", "proposed");
  if (error) console.error("[owner-calls] closing request for approval failed:", error.message);
}

// ── Placing ───────────────────────────────────────────────────────────────────

export interface PlaceOwnerCallResult {
  ok: boolean;
  /** One line for the owner. */
  message: string;
  status: "placed" | "scheduled" | "failed" | "already";
}

/** What the owner is told. Only messages written for people pass through; anything else is generic. */
export function failureMessage(err: unknown): string {
  if (err instanceof UsageCapExceeded) return "this month's AI minutes are used up";
  if (err instanceof UserFacingError) {
    const text = err.message.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}`.slice(0, 160) : "the call couldn't be placed";
  }
  return "the call couldn't be placed";
}

/**
 * Dial one request: claim it (proposed/scheduled → dialing — exactly one caller wins), re-check
 * the plan's minutes, place the call, record the Retell call id. A placement that throws is
 * `failed` and is never retried here (an ambiguous timeout must not become two calls).
 */
export async function placeOwnerCall(admin: AdminClient, request: OwnerCallRequestRow, options: { nowMs?: number; claimedBy?: string } = {}): Promise<PlaceOwnerCallResult> {
  const nowMs = options.nowMs ?? Date.now();
  const brief = readBrief(request);
  const who = brief?.who ?? "them";
  const claimed = await setStatus(admin, request.id, ["proposed", "scheduled"], {
    status: "dialing",
    claimed_at: new Date(nowMs).toISOString(),
    claimed_by: options.claimedBy ?? "owner_channel",
  });
  if (!claimed) return { ok: true, status: "already", message: `That call to ${who} was already handled.` };
  if (!brief) {
    await setStatus(admin, request.id, ["dialing"], { status: "failed", last_error: "brief unreadable" });
    return { ok: false, status: "failed", message: `Couldn't place the call to ${who} - the request was incomplete.` };
  }
  try {
    await requireReceptionistMinutes(admin, request.organization_id);
    const placed = await callContactWithMarina(ctxFor(admin, request.organization_id), request.contact_id, { brief, requestId: request.id });
    await setStatus(admin, request.id, ["dialing"], { status: "placed", placed_at: new Date().toISOString(), retell_call_id: placed.agentCallId });
    return { ok: true, status: "placed", message: `Calling ${who} now. I'll text you how it went.` };
  } catch (err) {
    const why = failureMessage(err);
    console.error("[owner-calls] placing call failed", request.id, err instanceof Error ? err.message : err);
    await setStatus(admin, request.id, ["dialing"], { status: "failed", last_error: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
    return { ok: false, status: "failed", message: `Couldn't place the call to ${who} - ${why}.` };
  }
}

/**
 * The confirmed request: dial it now, or schedule it. Called from executeOwnerCommand with the
 * approval's own organization + company (never the payload's alone).
 */
export async function placeOrScheduleOwnerCall(admin: AdminClient, request: OwnerCallRequestRow, timeZone: string, nowMs: number = Date.now()): Promise<PlaceOwnerCallResult> {
  const brief = readBrief(request);
  const who = brief?.who ?? "them";
  if (request.status !== "proposed") return { ok: true, status: "already", message: `That call to ${who} was already handled.` };
  if (Date.parse(request.run_at) <= nowMs) return placeOwnerCall(admin, request, { nowMs });
  const scheduled = await setStatus(admin, request.id, ["proposed"], { status: "scheduled" });
  if (!scheduled) return { ok: true, status: "already", message: `That call to ${who} was already handled.` };
  const first = who.split(" ")[0];
  const when = shortWhen(request.run_at, timeZone);
  // "…9:00 a.m." already ends the sentence.
  return { ok: true, status: "scheduled", message: `OK - I'll call ${who} ${when}${/[.!?]$/.test(when) ? "" : "."} Say "cancel the call to ${first}" to stop it.` };
}

// ── The sweep (scheduler.ts, every tick) ──────────────────────────────────────

/**
 * Place calls that are due (`scheduled`, run_at ≤ now). Each is claimed by the conditional
 * update inside placeOwnerCall, so two workers never dial the same request; a claim older than
 * STALE_CLAIM_MS with no outcome is a crashed worker and is reclaimed. Proposals nobody
 * confirmed are expired. Never throws.
 */
export async function processDueOwnerCalls(admin: AdminClient, nowMs: number = Date.now()): Promise<{ placed: number; failed: number; expired: number }> {
  const result = { placed: 0, failed: 0, expired: 0 };
  try {
    const { data: due } = await admin
      .from("owner_call_requests")
      .select("*")
      .eq("status", "scheduled")
      .lte("run_at", new Date(nowMs).toISOString())
      .order("run_at", { ascending: true })
      .limit(20);
    for (const row of (due ?? []) as OwnerCallRequestRow[]) {
      const outcome = await placeOwnerCall(admin, row, { nowMs, claimedBy: "scheduler" });
      if (outcome.status === "placed") result.placed += 1;
      else if (outcome.status === "failed") result.failed += 1;
      if (outcome.status === "placed" || outcome.status === "failed") await notifyOwner(admin, row, outcome.message);
    }

    // A worker that claimed a call and died before recording a call id: the call may or may not
    // have been placed, so it is never redialed — it's failed, and the owner is told.
    const staleBefore = new Date(nowMs - STALE_CLAIM_MS).toISOString();
    const { data: lost } = await admin
      .from("owner_call_requests")
      .update({ status: "failed", last_error: "worker lost the call after claiming it" })
      .eq("status", "dialing")
      .is("retell_call_id", null)
      .lt("claimed_at", staleBefore)
      .select("*");
    for (const row of (lost ?? []) as OwnerCallRequestRow[]) {
      result.failed += 1;
      const who = readBrief(row)?.who ?? "them";
      await notifyOwner(admin, row, `Couldn't place the call to ${who} - something went wrong on our side. Ask again if you still want it.`);
    }

    const { data: stale } = await admin
      .from("owner_call_requests")
      .select("id")
      .eq("status", "proposed")
      .lt("created_at", new Date(nowMs - PROPOSAL_TTL_MS).toISOString())
      .limit(50);
    for (const row of (stale ?? []) as Array<{ id: string }>) {
      if (await expireCallRequest(admin, row.id)) result.expired += 1;
    }
  } catch (err) {
    console.error("[owner-calls] sweep failed:", err instanceof Error ? err.message : err);
  }
  return result;
}

// ── The result (retell/lead-adapter.ts → call_analyzed, outbound) ─────────────

export interface OwnerCallOutcomeInput {
  requestId: string;
  organizationId: string;
  callId: string | null;
  callSuccessful: boolean | null;
  inVoicemail: boolean | null;
  disconnectionReason?: string | null;
  callSummary: string | null;
  userSentiment: string | null;
  durationMs: number | null;
  /** call_analysis.custom_analysis_data — `owner_question_answer` when the agent defines it. */
  customAnalysisData: unknown;
}

/**
 * Did a call WE placed reach a person? Reached = a real conversation: not voicemail, not a dial
 * failure / busy / no answer / provider error (Retell still reports ring time as duration for
 * those), the analysis didn't mark it failed, and either the analysis called it a success or it
 * lasted longer than a ring (the same 5 s threshold as classifyRetellCall). PURE.
 */
export function classifyOutboundCall(input: { callSuccessful: boolean | null; inVoicemail: boolean | null; disconnectionReason?: string | null; durationMs: number | null }): { reached: boolean; inVoicemail: boolean } {
  const reason = input.disconnectionReason ?? null;
  const inVoicemail = input.inVoicemail === true || (reason != null && VOICEMAIL_REASONS.test(reason));
  const notConnected = reason != null && NOT_CONNECTED_REASONS.test(reason);
  const lasted = input.durationMs != null && input.durationMs >= REACHED_MIN_MS;
  const reached = !inVoicemail && !notConnected && input.callSuccessful !== false && (input.callSuccessful === true || lasted);
  return { reached, inVoicemail };
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

function answerFrom(custom: unknown): string | null {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return null;
  const v = (custom as Record<string, unknown>).owner_question_answer;
  return typeof v === "string" && v.trim() ? clip(v, 200) : null;
}

/** The owner's result text. Customer speech only ever lands inside these fixed templates. PURE. */
export function ownerCallResultText(brief: OwnerCallBrief, outcome: { reached: boolean; inVoicemail: boolean; summary: string | null; answer: string | null; durationMs: number | null }): string {
  const who = brief.who;
  const first = who.split(" ")[0];
  const mins = outcome.durationMs != null && outcome.durationMs > 0 ? ` (${Math.max(1, Math.round(outcome.durationMs / 60000))} min)` : "";
  if (outcome.inVoicemail) {
    const left = brief.ifVoicemail === "hang_up" ? "no message left" : "left a message";
    return `${who}: voicemail - ${left}. Want me to text them? Say "tell ${first} ...".`;
  }
  if (!outcome.reached) return `${who}: no answer. Try again later? Say "call ${first} again".`;
  const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
  const parts = [`${who}: reached.`];
  if (outcome.answer) parts.push(sentence(`Answer: ${outcome.answer}`));
  if (outcome.summary) parts.push(sentence(clip(outcome.summary, SUMMARY_MAX)));
  return `${parts.join(" ")}${mins}`;
}

async function platformBrandFor(admin: AdminClient, organizationId: string): Promise<string | null> {
  const { data } = await admin.from("organizations").select("platform_brand").eq("id", organizationId).maybeSingle();
  return ((data as { platform_brand?: string | null } | null)?.platform_brand as string | null) ?? null;
}

async function notifyOwner(admin: AdminClient, request: OwnerCallRequestRow, body: string): Promise<boolean> {
  const gate = await ownerAlertGate(admin, request.company_id);
  if (gate === "drop") return false;
  const sent = await sendOwnerSms(admin, {
    to: request.requested_by_phone,
    body: gate === "summary" ? OWNER_ALERTS_SUMMARY : body,
    organizationId: request.organization_id,
    companyId: request.company_id,
    platformBrand: await platformBrandFor(admin, request.organization_id),
  });
  return sent.status === "sent";
}

/**
 * Record the call's outcome and text the owner once. The row is loaded by id AND the
 * organization Retell echoed back; the notification is claimed (owner_notified_at) before
 * sending, so a redelivered webhook never texts twice. Never throws.
 */
export async function recordOwnerCallOutcome(admin: AdminClient, input: OwnerCallOutcomeInput): Promise<{ notified: boolean }> {
  try {
    const { data } = await admin
      .from("owner_call_requests")
      .select("*")
      .eq("id", input.requestId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    const request = (data as OwnerCallRequestRow | null) ?? null;
    if (!request) return { notified: false };
    const brief = readBrief(request);
    if (!brief) return { notified: false };

    const { reached, inVoicemail } = classifyOutboundCall(input);
    const outcome = {
      reached,
      inVoicemail,
      summary: input.callSummary ? clip(input.callSummary, 600) : null,
      answer: answerFrom(input.customAnalysisData),
      sentiment: input.userSentiment,
      durationMs: input.durationMs,
      disconnectionReason: input.disconnectionReason ?? null,
    };
    await admin
      .from("owner_call_requests")
      .update({
        status: reached || inVoicemail ? "completed" : "failed",
        outcome: toJson(outcome) as Json,
        ...(input.callId && !request.retell_call_id ? { retell_call_id: input.callId } : {}),
      })
      .eq("id", request.id)
      .in("status", ["placed", "dialing"]);

    const now = new Date().toISOString();
    const { data: claimed } = await admin
      .from("owner_call_requests")
      .update({ owner_notified_at: now })
      .eq("id", request.id)
      .is("owner_notified_at", null)
      .select("id");
    if (((claimed ?? []) as unknown[]).length === 0) return { notified: false };
    const text = ownerCallResultText(brief, outcome);
    return { notified: await notifyOwner(admin, request, text) };
  } catch (err) {
    console.error("[owner-calls] recording outcome failed:", err instanceof Error ? err.message : err);
    return { notified: false };
  }
}

/** For the Settings list: the last N requests for a company, newest first. */
export async function listCallRequests(admin: AdminClient, scope: Pick<CompanyScope, "organizationId" | "companyId">, limit = 20): Promise<OwnerCallRequestRow[]> {
  const { data, error } = await admin
    .from("owner_call_requests")
    .select("*")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OwnerCallRequestRow[];
}

export { toE164 };
