/**
 * The sales-call queue (docs/sales-calls.md): schedule a call, dial it when it's due and every
 * rule still passes, record what happened, try again on no answer, and text the owner.
 *
 *   scheduled → dialing → placed → completed | failed      (+ cancelled | skipped)
 *
 * Every rule is re-checked at dial time, not when the call was queued: consent, the do-not-call
 * list, the setting, calling hours, the daily cap, the plan's minutes, and (speed-to-lead) whether
 * the lead already got in touch on their own. A failed placement is never retried automatically
 * (an ambiguous timeout must not become two calls); only a call that rang out schedules the next
 * attempt, as a new row.
 *
 * Service role (worker / owner channel). Every row is read by id AND organization.
 */
import type { Json, Tables } from "@/server/db/database.types";
import { toJson } from "@/server/db/json";
import { UserFacingError } from "@/server/errors";
import { AuthorizationError, UsageCapExceeded } from "@/server/organizations/context";
import { addDays, localDate, zonedInstant } from "@/server/services/booking-windows";
import { formatNanp } from "@/server/services/dfy/intake";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { normalizePhoneLast10 } from "@/server/services/lead-intake/matching";
import { classifyOutboundCall } from "@/server/services/owner-channel/calls";
import { consumeLimit, ctxFor, DEFAULT_TIMEZONE, ownerAlertGate, OWNER_ALERTS_SUMMARY, sendOwnerSms } from "@/server/services/owner-channel/common";
import { buildSalesCallPrompt } from "@/server/services/retell/outbound-prompt";
import { callContactWithMarina, isRetellOutboundActive, toE164 } from "@/server/services/voice";
import { loadCompanyFacts } from "@/server/services/voice/company-facts";
import { requireReceptionistMinutes } from "@/server/services/voice/minutes";
import { salesAgentId } from "@/server/services/voice/sales-agent";

import { addDoNotCall, callingWindow, findCallConsent, isDoNotCall, nextCallableAt } from "./compliance";
import { loadSalesCallSettings, type SalesCallSettings } from "./settings";

export type SalesCallRow = Tables<"sales_calls">;
type Scope = { organizationId: string; companyId: string };

/** A worker that claimed a call and vanished loses it after this long (failed, never redialed). */
const STALE_CLAIM_MS = 15 * 60_000;
/** A placed call with no result after this long is closed (the call itself lasts ≤ 10 min). */
const NO_RESULT_MS = 2 * 3_600_000;
const SUMMARY_MAX = 220;

export type SkipReason =
  | "not_set_up"
  | "no_phone"
  | "do_not_call"
  | "no_consent"
  | "turned_off"
  | "no_business_number"
  | "already_in_touch"
  | "no_plan"
  | "no_minutes";

/** What the owner is told when a call they asked for was skipped. PURE. */
export function skipReasonText(reason: SkipReason): string {
  switch (reason) {
    case "not_set_up":
      return "sales calls aren't set up on this account yet";
    case "no_phone":
      return "there's no callable phone number on file";
    case "do_not_call":
      return "they're on your do-not-call list";
    case "no_consent":
      return "they haven't agreed to automated calls";
    case "turned_off":
      return "lead calls are turned off";
    case "no_business_number":
      return "your business needs its own AI phone number to call from";
    case "already_in_touch":
      return "they already got in touch";
    case "no_plan":
      return "calls need the Front Desk plan";
    case "no_minutes":
      return "this month's AI minutes are used up";
  }
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export async function scheduleSalesCall(
  admin: AdminClient,
  input: {
    scope: Scope;
    contactId: string;
    reason: "speed_to_lead" | "owner_request";
    runAtMs: number;
    maxAttempts: number;
    attempt?: number;
    note?: string | null;
    rawLeadId?: string | null;
    requestedByPhone?: string | null;
  },
): Promise<SalesCallRow | "already_open"> {
  const { data, error } = await admin
    .from("sales_calls")
    .insert({
      organization_id: input.scope.organizationId,
      company_id: input.scope.companyId,
      contact_id: input.contactId,
      reason: input.reason,
      status: "scheduled",
      run_at: new Date(input.runAtMs).toISOString(),
      attempt: input.attempt ?? 1,
      max_attempts: Math.max(input.attempt ?? 1, input.maxAttempts),
      note: input.note ? input.note.replace(/\s+/g, " ").trim().slice(0, 400) : null,
      raw_lead_id: input.rawLeadId ?? null,
      requested_by_phone: input.requestedByPhone ?? null,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return "already_open";
    throw error;
  }
  return data as SalesCallRow;
}

/** The open (scheduled / dialing / placed) sales call for a customer, if any. */
export async function openSalesCallFor(admin: AdminClient, scope: Scope, contactId: string): Promise<SalesCallRow | null> {
  const { data } = await admin
    .from("sales_calls")
    .select("*")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("contact_id", contactId)
    .in("status", ["scheduled", "dialing", "placed"])
    .limit(1);
  return ((data ?? []) as SalesCallRow[])[0] ?? null;
}

async function setStatus(admin: AdminClient, id: string, from: string[], patch: Record<string, unknown>): Promise<SalesCallRow | null> {
  const { data, error } = await admin.from("sales_calls").update(patch).eq("id", id).in("status", from).select("*");
  if (error) throw error;
  return ((data ?? []) as SalesCallRow[])[0] ?? null;
}

/** Cancel a call that hasn't been dialed yet. */
export async function cancelSalesCall(admin: AdminClient, id: string): Promise<SalesCallRow | null> {
  return setStatus(admin, id, ["scheduled"], { status: "cancelled" });
}

export async function listSalesCalls(admin: AdminClient, scope: Scope, limit = 20): Promise<SalesCallRow[]> {
  const { data, error } = await admin
    .from("sales_calls")
    .select("*")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SalesCallRow[];
}

// ── What a call needs ─────────────────────────────────────────────────────────

interface CallInputs {
  companyName: string;
  timeZone: string;
  ownerPhone: string | null;
  platformBrand: string | null;
  businessNumber: string | null;
  contact: { id: string; name: string; phone: string | null };
  settings: SalesCallSettings;
}

async function loadInputs(admin: AdminClient, row: SalesCallRow): Promise<CallInputs | null> {
  const scope = { organizationId: row.organization_id, companyId: row.company_id };
  const [{ data: company }, { data: org }, { data: contact }, { data: number }, settings] = await Promise.all([
    admin.from("companies").select("id, name, timezone, owner_phone_e164").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle(),
    admin.from("organizations").select("platform_brand").eq("id", scope.organizationId).maybeSingle(),
    admin.from("contacts").select("id, first_name, last_name, phone").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).eq("id", row.contact_id).maybeSingle(),
    admin.from("voice_numbers").select("phone_e164").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).eq("provider", "retell").eq("active", true).limit(1).maybeSingle(),
    loadSalesCallSettings(admin, scope),
  ]);
  const c = company as { name: string; timezone: string | null; owner_phone_e164: string | null } | null;
  const k = contact as { id: string; first_name: string | null; last_name: string | null; phone: string | null } | null;
  if (!c || !k) return null;
  const name = [k.first_name, k.last_name].filter(Boolean).join(" ").trim();
  return {
    companyName: c.name,
    timeZone: c.timezone?.trim() || DEFAULT_TIMEZONE,
    ownerPhone: c.owner_phone_e164 ?? null,
    platformBrand: (org as { platform_brand: string | null } | null)?.platform_brand ?? null,
    businessNumber: (number as { phone_e164: string | null } | null)?.phone_e164 ?? null,
    contact: { id: k.id, name: name && name !== "Lead" ? name : "", phone: k.phone },
    settings,
  };
}

/** Since the call was queued, did the lead book or call us themselves? */
async function alreadyInTouch(admin: AdminClient, row: SalesCallRow): Promise<boolean> {
  const since = row.created_at;
  const [{ data: bookings }, { data: calls }] = await Promise.all([
    admin.from("bookings").select("id").eq("organization_id", row.organization_id).eq("contact_id", row.contact_id).gt("created_at", since).neq("status", "cancelled").limit(1),
    admin.from("retell_calls").select("call_id").eq("organization_id", row.organization_id).eq("contact_id", row.contact_id).eq("direction", "inbound").gt("received_at", since).limit(1),
  ]);
  return ((bookings ?? []) as unknown[]).length > 0 || ((calls ?? []) as unknown[]).length > 0;
}

export type DialDecision = { kind: "dial" } | { kind: "skip"; reason: SkipReason } | { kind: "defer"; runAtMs: number };

/**
 * Every rule, in order, at dial time. Doesn't consume the daily cap (the caller does that last,
 * right before dialing). Never throws for a rule; a lookup error throws.
 */
export async function decideDial(admin: AdminClient, row: SalesCallRow, inputs: CallInputs, nowMs: number): Promise<DialDecision> {
  const scope = { organizationId: row.organization_id, companyId: row.company_id };
  if (!salesAgentId() || !isRetellOutboundActive()) return { kind: "skip", reason: "not_set_up" };
  const phone = inputs.contact.phone ? toE164(inputs.contact.phone) : null;
  if (!phone) return { kind: "skip", reason: "no_phone" };
  if (await isDoNotCall(admin, scope, phone, nowMs)) return { kind: "skip", reason: "do_not_call" };
  if (!(await findCallConsent(admin, scope, inputs.contact))) return { kind: "skip", reason: "no_consent" };
  if (row.reason === "speed_to_lead" && !inputs.settings.enabled) return { kind: "skip", reason: "turned_off" };
  if (!inputs.businessNumber) return { kind: "skip", reason: "no_business_number" };
  if (row.reason === "speed_to_lead" && (await alreadyInTouch(admin, row))) return { kind: "skip", reason: "already_in_touch" };
  const window = callingWindow(nowMs, inputs.timeZone);
  if (!window.open) return { kind: "defer", runAtMs: window.nextOpenMs };
  return { kind: "dial" };
}

/** Tomorrow's first calling minute (the daily cap ran out today). PURE given the zone. */
export function tomorrowsOpening(nowMs: number, timeZone: string): number {
  const tomorrow = addDays(localDate(new Date(nowMs), timeZone), 1);
  return nextCallableAt(zonedInstant(tomorrow, "00:00", timeZone).getTime(), timeZone);
}

// ── Placing ───────────────────────────────────────────────────────────────────

export interface PlaceSalesCallResult {
  status: "placed" | "deferred" | "skipped" | "failed" | "already";
  reason?: SkipReason | null;
  /** One line for the owner (owner-requested calls). */
  message: string;
  runAtMs?: number;
}

function whoOf(inputs: Pick<CallInputs, "contact"> | null): string {
  return inputs?.contact.name || (inputs?.contact.phone ? formatNanp(toE164(inputs.contact.phone)) : "") || "the lead";
}

/**
 * Dial one queued call: claim it (scheduled → dialing; exactly one worker wins), run every rule,
 * then place it on the sales agent from the company's own number. Deferred calls go back to
 * `scheduled` with a new run_at; skipped ones are closed with the reason.
 */
export async function placeSalesCall(admin: AdminClient, row: SalesCallRow, options: { nowMs?: number; claimedBy?: string } = {}): Promise<PlaceSalesCallResult> {
  // The calling window and the cap's day are read from a live clock at each check (a fixed nowMs
  // only in tests): a sweep that started minutes ago must not use its start time near 21:15.
  const clock = (): number => options.nowMs ?? Date.now();
  const nowMs = clock();
  const claimed = await setStatus(admin, row.id, ["scheduled"], { status: "dialing", claimed_at: new Date(nowMs).toISOString(), claimed_by: options.claimedBy ?? "scheduler" });
  if (!claimed) return { status: "already", message: "That call was already handled." };

  const inputs = await loadInputs(admin, claimed);
  const who = whoOf(inputs);
  if (!inputs) {
    await setStatus(admin, row.id, ["dialing"], { status: "skipped", skip_reason: "no_phone" });
    return { status: "skipped", reason: "no_phone", message: `Didn't call ${who} - I couldn't find them any more.` };
  }

  let placedCallId: string | null = null;
  try {
    const decision = await decideDial(admin, claimed, inputs, clock());
    if (decision.kind === "defer") {
      await setStatus(admin, row.id, ["dialing"], { status: "scheduled", run_at: new Date(decision.runAtMs).toISOString(), claimed_at: null, claimed_by: null });
      return { status: "deferred", runAtMs: decision.runAtMs, message: `I'll call ${who} when calling hours open.` };
    }
    if (decision.kind === "skip") {
      await setStatus(admin, row.id, ["dialing"], { status: "skipped", skip_reason: decision.reason });
      return { status: "skipped", reason: decision.reason, message: `Didn't call ${who} - ${skipReasonText(decision.reason)}.` };
    }

    const day = localDate(new Date(clock()), inputs.timeZone);
    if (!(await consumeLimit(admin, `sales_calls:${row.company_id}:${day}`, inputs.settings.dailyCap, 86_400))) {
      const runAtMs = tomorrowsOpening(clock(), inputs.timeZone);
      await setStatus(admin, row.id, ["dialing"], { status: "scheduled", run_at: new Date(runAtMs).toISOString(), claimed_at: null, claimed_by: null });
      return { status: "deferred", runAtMs, message: `That's today's limit on sales calls - I'll call ${who} tomorrow.` };
    }

    try {
      await requireReceptionistMinutes(admin, row.organization_id);
    } catch (err) {
      const reason: SkipReason = err instanceof UsageCapExceeded ? "no_minutes" : err instanceof AuthorizationError ? "no_plan" : "no_minutes";
      await setStatus(admin, row.id, ["dialing"], { status: "skipped", skip_reason: reason });
      return { status: "skipped", reason, message: `Didn't call ${who} - ${skipReasonText(reason)}.` };
    }

    const ctx = ctxFor(admin, row.organization_id);
    const facts = await loadCompanyFacts(ctx, row.company_id).catch((): null => null);
    const prompt = buildSalesCallPrompt({
      companyName: facts?.companyName ?? inputs.companyName,
      customerName: inputs.contact.name || null,
      services: facts?.services ?? [],
      hoursText: facts?.hoursText ?? null,
      serviceArea: facts?.serviceArea ?? null,
      transferNumber: null,
      reason: claimed.reason === "owner_request" ? "owner_request" : "speed_to_lead",
      note: claimed.note,
      callbackNumber: inputs.businessNumber ? formatNanp(inputs.businessNumber) : null,
      voicemail: inputs.settings.voicemail,
      attempt: claimed.attempt,
    });
    placedCallId = (
      await callContactWithMarina(ctx, row.contact_id, {
        sales: { salesCallId: row.id, prompt, agentId: salesAgentId() as string, fromNumber: inputs.businessNumber as string },
      })
    ).agentCallId;
  } catch (err) {
    console.error("[sales-calls] placing call failed", row.id, err instanceof Error ? err.message : err);
    await setStatus(admin, row.id, ["dialing"], { status: "failed", last_error: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
    const why = err instanceof UserFacingError ? err.message.replace(/\.$/, "").toLowerCase() : "the call couldn't be placed";
    return { status: "failed", message: `Couldn't call ${who} - ${why}.` };
  }

  // The call is ringing. Record it even if the stale-claim sweep failed the row meanwhile; a failed
  // write is logged, never turned into a "failed" call (the outcome still lands by salesCallId).
  try {
    const { data: recorded, error } = await admin
      .from("sales_calls")
      .update({ status: "placed", placed_at: new Date().toISOString(), retell_call_id: placedCallId, last_error: null })
      .eq("id", row.id)
      .in("status", ["dialing", "failed"])
      .is("retell_call_id", null)
      .select("id");
    if (error) throw error;
    if (((recorded ?? []) as unknown[]).length === 0) console.error("[sales-calls] placed call not recorded (row changed)", row.id, placedCallId);
  } catch (err) {
    console.error("[sales-calls] placed call not recorded", row.id, placedCallId, err instanceof Error ? err.message : err);
  }
  return { status: "placed", message: `Calling ${who} now. I'll text you how it went.` };
}

// ── The sweep (scheduler.ts, every tick) ──────────────────────────────────────

/**
 * Dial what's due (each claimed by placeSalesCall's conditional update, so two workers never
 * dial the same row) and fail claims a crashed worker left behind. Owner-requested calls tell
 * the owner when they were placed, skipped or failed. Never throws.
 */
export async function processDueSalesCalls(admin: AdminClient, fixedNowMs?: number): Promise<{ placed: number; deferred: number; skipped: number; failed: number }> {
  const result = { placed: 0, deferred: 0, skipped: 0, failed: 0 };
  // Live clock per row (fixedNowMs only in tests): see placeSalesCall.
  const clock = (): number => fixedNowMs ?? Date.now();
  try {
    const { data: due } = await admin
      .from("sales_calls")
      .select("*")
      .eq("status", "scheduled")
      .lte("run_at", new Date(clock()).toISOString())
      .order("run_at", { ascending: true })
      .limit(20);
    for (const row of (due ?? []) as SalesCallRow[]) {
      const outcome = await placeSalesCall(admin, row, { nowMs: fixedNowMs, claimedBy: "scheduler" });
      if (outcome.status === "placed") result.placed += 1;
      else if (outcome.status === "deferred") result.deferred += 1;
      else if (outcome.status === "skipped") result.skipped += 1;
      else if (outcome.status === "failed") result.failed += 1;
      // The owner who asked hears about a skip or failure; "placed" is followed by the result text.
      if (row.reason === "owner_request" && (outcome.status === "skipped" || outcome.status === "failed")) {
        await notifyOwner(admin, row, outcome.message);
      }
    }

    const { data: lost } = await admin
      .from("sales_calls")
      .update({ status: "failed", last_error: "worker lost the call after claiming it" })
      .eq("status", "dialing")
      .is("retell_call_id", null)
      .lt("claimed_at", new Date(clock() - STALE_CLAIM_MS).toISOString())
      .select("*");
    result.failed += ((lost ?? []) as unknown[]).length;

    // Placed but Retell never sent a result: close it so the customer isn't blocked for good (no
    // retry, no owner text — whether they were reached is unknown). A late result still applies a
    // do-not-call request (recordSalesCallOutcome).
    const { data: stuck } = await admin
      .from("sales_calls")
      .update({ status: "failed", last_error: "no call result from Retell" })
      .eq("status", "placed")
      .lt("placed_at", new Date(clock() - NO_RESULT_MS).toISOString())
      .select("id");
    result.failed += ((stuck ?? []) as unknown[]).length;
  } catch (err) {
    console.error("[sales-calls] sweep failed:", err instanceof Error ? err.message : err);
  }
  return result;
}

// ── The result (retell/lead-adapter.ts → call_analyzed, outbound) ─────────────

export type SalesOutcome =
  | "booked"
  | "quote_sent"
  | "interested_follow_up"
  | "call_back_later"
  | "not_interested"
  | "do_not_call"
  | "wrong_number"
  | "no_conversation";

const OUTCOMES = new Set<SalesOutcome>(["booked", "quote_sent", "interested_follow_up", "call_back_later", "not_interested", "do_not_call", "wrong_number", "no_conversation"]);

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

export interface SalesAnalysis {
  salesOutcome: SalesOutcome | null;
  doNotCall: boolean;
  callbackTime: string | null;
  servicesInterested: string | null;
}

/** call_analysis.custom_analysis_data → what the sales agent reported. PURE. */
export function readSalesAnalysis(custom: unknown): SalesAnalysis {
  const c = custom && typeof custom === "object" && !Array.isArray(custom) ? (custom as Record<string, unknown>) : {};
  const outcome = typeof c.sales_outcome === "string" && OUTCOMES.has(c.sales_outcome as SalesOutcome) ? (c.sales_outcome as SalesOutcome) : null;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? clip(v, max) : null);
  return {
    salesOutcome: outcome,
    doNotCall: c.do_not_call_requested === true || outcome === "do_not_call",
    callbackTime: text(c.callback_time, 80),
    servicesInterested: text(c.services_interested, 120),
  };
}

const OUTCOME_LABEL: Record<SalesOutcome, string> = {
  booked: "booked",
  quote_sent: "quote texted",
  interested_follow_up: "interested - worth a follow-up",
  call_back_later: "asked to be called back later",
  not_interested: "not interested",
  do_not_call: "asked not to be called (added to your do-not-call list)",
  wrong_number: "wrong number",
  no_conversation: "reached, no real conversation",
};

/** The owner's result text. Customer speech only lands inside fixed templates, clipped. PURE. */
export function salesCallResultText(input: {
  who: string;
  reason: "speed_to_lead" | "owner_request";
  reached: boolean;
  inVoicemail: boolean;
  analysis: SalesAnalysis;
  summary: string | null;
  durationMs: number | null;
  attempt: number;
}): string {
  const head = input.reason === "speed_to_lead" ? `New-lead call - ${input.who}` : `Sales call - ${input.who}`;
  const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
  if (!input.reached) {
    const missed = input.inVoicemail ? "voicemail" : "no answer";
    const tries = input.attempt > 1 ? ` after ${input.attempt} tries` : "";
    return `${head}: ${missed}${tries}. Want me to text them? Say "tell ${input.who.split(" ")[0]} ...".`;
  }
  const mins = input.durationMs != null && input.durationMs > 0 ? ` (${Math.max(1, Math.round(input.durationMs / 60000))} min)` : "";
  const label = input.analysis.doNotCall ? OUTCOME_LABEL.do_not_call : OUTCOME_LABEL[input.analysis.salesOutcome ?? "no_conversation"];
  const parts = [`${head}: ${label}${input.analysis.salesOutcome === "call_back_later" && input.analysis.callbackTime ? ` (${input.analysis.callbackTime})` : ""}.`];
  if (input.analysis.servicesInterested && !input.analysis.doNotCall) parts.push(sentence(`Interested in: ${input.analysis.servicesInterested}`));
  if (input.summary && !input.analysis.doNotCall) parts.push(sentence(clip(input.summary, SUMMARY_MAX)));
  return `${parts.join(" ")}${mins}`;
}

async function notifyOwner(admin: AdminClient, row: SalesCallRow, body: string): Promise<boolean> {
  const { data } = await admin.from("companies").select("owner_phone_e164").eq("organization_id", row.organization_id).eq("id", row.company_id).maybeSingle();
  const to = row.requested_by_phone ?? (data as { owner_phone_e164: string | null } | null)?.owner_phone_e164 ?? null;
  if (!to) return false;
  const gate = await ownerAlertGate(admin, row.company_id);
  if (gate === "drop") return false;
  const { data: org } = await admin.from("organizations").select("platform_brand").eq("id", row.organization_id).maybeSingle();
  const sent = await sendOwnerSms(admin, {
    to,
    body: gate === "summary" ? OWNER_ALERTS_SUMMARY : body,
    organizationId: row.organization_id,
    companyId: row.company_id,
    platformBrand: (org as { platform_brand: string | null } | null)?.platform_brand ?? null,
  });
  return sent.status === "sent";
}

export interface SalesCallOutcomeInput {
  salesCallId: string;
  organizationId: string;
  callId: string | null;
  callSuccessful: boolean | null;
  inVoicemail: boolean | null;
  disconnectionReason?: string | null;
  callSummary: string | null;
  durationMs: number | null;
  customAnalysisData: unknown;
  /** The number actually dialled (Retell's outbound to_number): do-not-call and consent use it. */
  dialedNumber?: string | null;
  nowMs?: number;
}

/**
 * Record a sales call's outcome: honour a "don't call me" (do-not-call list + consent revoked) and
 * drop consent on a wrong number — always, whatever Retell's verdict and even if the row is
 * already closed — then close the row, schedule the next attempt when nobody answered and
 * attempts remain, and text the owner once at the end (owner_notified_at is the claim). Never
 * throws.
 */
export async function recordSalesCallOutcome(admin: AdminClient, input: SalesCallOutcomeInput): Promise<{ notified: boolean; retryId: string | null }> {
  const nowMs = input.nowMs ?? Date.now();
  try {
    const { data } = await admin.from("sales_calls").select("*").eq("id", input.salesCallId).eq("organization_id", input.organizationId).maybeSingle();
    const row = (data as SalesCallRow | null) ?? null;
    if (!row) return { notified: false, retryId: null };
    const scope = { organizationId: row.organization_id, companyId: row.company_id };
    const { reached, inVoicemail } = classifyOutboundCall(input);
    const analysis = readSalesAnalysis(input.customAnalysisData);
    const inputs = await loadInputs(admin, row);
    const phone = input.dialedNumber ?? inputs?.contact.phone ?? null;
    const wrongNumber = analysis.salesOutcome === "wrong_number";

    // "Don't call me" and "wrong number" are honoured whatever Retell's success verdict says, and
    // even when the row was already closed (redelivery, a stale claim, a lost "placed" write).
    if (analysis.doNotCall) {
      await addDoNotCall(admin, { scope, phone, source: "call", contactId: row.contact_id, note: input.callId ? `call ${input.callId}` : null, nowMs });
    } else if (wrongNumber) {
      const last10 = normalizePhoneLast10(phone);
      if (last10) {
        await admin.from("call_consents").update({ revoked_at: new Date(nowMs).toISOString() }).eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).eq("phone_last10", last10).is("revoked_at", null);
      }
    }

    const updated = await setStatus(admin, row.id, ["placed", "dialing"], {
      status: reached || inVoicemail || analysis.doNotCall ? "completed" : "failed",
      outcome: toJson({
        reached,
        inVoicemail,
        salesOutcome: analysis.salesOutcome,
        doNotCall: analysis.doNotCall,
        callbackTime: analysis.callbackTime,
        servicesInterested: analysis.servicesInterested,
        summary: input.callSummary ? clip(input.callSummary, 600) : null,
        durationMs: input.durationMs,
        disconnectionReason: input.disconnectionReason ?? null,
      }) as Json,
      ...(input.callId && !row.retell_call_id ? { retell_call_id: input.callId } : {}),
    });
    // A redelivered webhook finds the row already closed: nothing more to do.
    if (!updated) return { notified: false, retryId: null };

    let retryId: string | null = null;
    if (!reached && !analysis.doNotCall && !wrongNumber && row.attempt < row.max_attempts && inputs) {
      const runAtMs = nextCallableAt(nowMs + inputs.settings.retryMinutes * 60_000, inputs.timeZone);
      const next = await scheduleSalesCall(admin, {
        scope,
        contactId: row.contact_id,
        reason: row.reason === "owner_request" ? "owner_request" : "speed_to_lead",
        runAtMs,
        maxAttempts: row.max_attempts,
        attempt: row.attempt + 1,
        note: row.note,
        rawLeadId: row.raw_lead_id,
        requestedByPhone: row.requested_by_phone,
      });
      if (next !== "already_open") retryId = next.id;
    }

    // A call that will be tried again waits for the last attempt before texting the owner.
    if (retryId) return { notified: false, retryId };

    const { data: claimed } = await admin.from("sales_calls").update({ owner_notified_at: new Date(nowMs).toISOString() }).eq("id", row.id).is("owner_notified_at", null).select("id");
    if (((claimed ?? []) as unknown[]).length === 0) return { notified: false, retryId };
    const text = salesCallResultText({
      who: whoOf(inputs),
      reason: row.reason === "owner_request" ? "owner_request" : "speed_to_lead",
      // Someone spoke (they asked not to be called / it's not their number) even if Retell
      // judged the call unsuccessful.
      reached: reached || analysis.doNotCall || wrongNumber,
      inVoicemail,
      analysis,
      summary: input.callSummary,
      durationMs: input.durationMs,
      attempt: row.attempt,
    });
    return { notified: await notifyOwner(admin, row, text), retryId };
  } catch (err) {
    console.error("[sales-calls] recording outcome failed:", err instanceof Error ? err.message : err);
    return { notified: false, retryId: null };
  }
}
