/**
 * "Have the AI call" from the app (docs/sales-calls.md → "Calls with your instructions"): on a
 * contact, the owner writes what the AI should do on the call ("ask if they still want the spring
 * cleanup, mention we have Tuesday open"), picks now or a time, and the AI calls from the
 * business's own number on the sales agent, with its tools. Same queue, consent, do-not-call,
 * calling hours, daily cap and result text as an owner-requested call by text
 * (owner-request.ts → startOwnerSalesCall); only who asked differs.
 *
 * Callers (the route) have already checked the signed-in user may act for this organization and
 * that the contact is in it; everything here is scoped to that organization + company.
 */
import { cleanInstructions, cancelSalesCall, SALES_CALL_INSTRUCTIONS_MAX, skipReasonText, type SalesCallRow } from "./queue";
import { findCallConsent, isDoNotCall } from "./compliance";
import { startOwnerSalesCall, type StartOwnerSalesCallResult } from "./owner-request";
import { loadSalesCallSettings } from "./settings";
import { salesAgentId } from "@/server/services/voice/sales-agent";
import { isRetellOutboundActive } from "@/server/services/voice";
import { hasReceptionistPlan, requireReceptionistMinutes } from "@/server/services/voice/minutes";
import { DEFAULT_TIMEZONE } from "@/server/services/owner-channel/common";
import { resolveCallTime } from "@/server/services/owner-channel/calls";
import { ValidationError } from "@/server/organizations/context";
import type { AdminClient } from "@/server/services/front-desk/contracts";

export type AiCallAvailability = "enabled" | "not_set_up" | "not_in_plan";

export interface AiCallScope {
  organizationId: string;
  companyId: string;
}

export interface AiCallSummary {
  id: string;
  status: SalesCallRow["status"];
  reason: SalesCallRow["reason"];
  runAt: string;
  createdAt: string;
  instructions: string | null;
  /** One line on how it went (outcome / skip reason), or null while it's pending. */
  result: string | null;
}

export interface AiCallView {
  availability: AiCallAvailability;
  /** Why the button is off, in a sentence, or null when calls are available. */
  unavailableReason: string | null;
  hasPhone: boolean;
  hasConsent: boolean;
  doNotCall: boolean;
  /** The business calls any time of day (sales_call_settings.anyTime), not only in calling hours. */
  anyTime: boolean;
  maxChars: number;
  calls: AiCallSummary[];
}

export async function aiCallAvailability(admin: AdminClient, organizationId: string): Promise<AiCallAvailability> {
  if (!isRetellOutboundActive() || !salesAgentId()) return "not_set_up";
  try {
    return (await hasReceptionistPlan(admin, organizationId)) ? "enabled" : "not_in_plan";
  } catch {
    return "not_in_plan";
  }
}

const UNAVAILABLE: Record<Exclude<AiCallAvailability, "enabled">, string> = {
  not_set_up: "AI calls aren't set up on this account yet.",
  not_in_plan: "AI calls are on the Front Desk plan.",
};

type Outcome = { reached?: boolean; inVoicemail?: boolean; salesOutcome?: string | null; doNotCall?: boolean; instructionsResult?: string | null; summary?: string | null } | null;

const OUTCOME_WORDS: Record<string, string> = {
  booked: "Booked",
  quote_sent: "Quote texted",
  interested_follow_up: "Interested — worth a follow-up",
  call_back_later: "Asked to be called back later",
  not_interested: "Not interested",
  do_not_call: "Asked not to be called",
  wrong_number: "Wrong number",
  no_conversation: "Reached, no real conversation",
};

/** One line for a past call. PURE. */
export function aiCallResultLine(row: Pick<SalesCallRow, "status" | "skip_reason" | "outcome">): string | null {
  if (row.status === "skipped") return row.skip_reason ? `Not called: ${skipReasonText(row.skip_reason as Parameters<typeof skipReasonText>[0])}.` : "Not called.";
  if (row.status === "cancelled") return "Cancelled.";
  if (row.status === "failed" && !row.outcome) return "The call didn't go through.";
  const o = row.outcome as Outcome;
  if (!o) return null;
  if (o.doNotCall) return OUTCOME_WORDS.do_not_call + ".";
  if (!o.reached) return o.inVoicemail ? "Voicemail." : "No answer.";
  const head = OUTCOME_WORDS[o.salesOutcome ?? "no_conversation"] ?? OUTCOME_WORDS.no_conversation;
  const detail = o.instructionsResult || o.summary;
  return detail ? `${head}. ${detail}` : `${head}.`;
}

function toSummary(row: SalesCallRow): AiCallSummary {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    runAt: row.run_at,
    createdAt: row.created_at,
    instructions: row.instructions,
    result: aiCallResultLine(row),
  };
}

async function contactOf(admin: AdminClient, scope: AiCallScope, contactId: string) {
  const { data } = await admin
    .from("contacts")
    .select("id, first_name, last_name, phone")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("id", contactId)
    .maybeSingle();
  return data as { id: string; first_name: string | null; last_name: string | null; phone: string | null } | null;
}

/** What the "Have the AI call" panel shows for one contact. */
export async function getAiCallView(admin: AdminClient, scope: AiCallScope, contactId: string): Promise<AiCallView> {
  const [availability, contact, { data: rows }, settings] = await Promise.all([
    aiCallAvailability(admin, scope.organizationId),
    contactOf(admin, scope, contactId),
    admin
      .from("sales_calls")
      .select("*")
      .eq("organization_id", scope.organizationId)
      .eq("company_id", scope.companyId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    loadSalesCallSettings(admin, scope),
  ]);
  const phone = contact?.phone?.trim() || null;
  const [hasConsent, doNotCall] = phone && contact ? await Promise.all([findCallConsent(admin, scope, contact).then(Boolean), isDoNotCall(admin, scope, phone)]) : [false, false];
  return {
    availability,
    unavailableReason: availability === "enabled" ? null : UNAVAILABLE[availability],
    hasPhone: Boolean(phone),
    hasConsent,
    doNotCall,
    anyTime: settings.anyTime,
    maxChars: SALES_CALL_INSTRUCTIONS_MAX,
    calls: ((rows ?? []) as SalesCallRow[]).map(toSummary),
  };
}

export interface AiCallRequest {
  instructions: string;
  /** "now", "YYYY-MM-DD HH:MM" (the business's local time), or blank for the next calling hours. */
  when: string | null;
  /** The user confirms the customer asked to be called (recorded as consent when none is on file). */
  customerAsked: boolean;
}

/** Ask the AI to call one contact with the owner's instructions. Throws ValidationError for the user. */
export async function requestAiCallFromApp(
  admin: AdminClient,
  scope: AiCallScope,
  contactId: string,
  request: AiCallRequest,
  actor: { profileId: string; label: string },
  nowMs: number = Date.now(),
): Promise<Extract<StartOwnerSalesCallResult, { ok: true }>> {
  const instructions = cleanInstructions(request.instructions);
  if (!instructions) throw new ValidationError("Tell the AI what to do on the call.");
  if (request.instructions.trim().length > SALES_CALL_INSTRUCTIONS_MAX) throw new ValidationError(`Keep the instructions under ${SALES_CALL_INSTRUCTIONS_MAX} characters.`);

  const availability = await aiCallAvailability(admin, scope.organizationId);
  if (availability !== "enabled") throw new ValidationError(UNAVAILABLE[availability]);
  try {
    await requireReceptionistMinutes(admin, scope.organizationId);
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : "This month's AI minutes are used up.");
  }

  const [contact, { data: company }, settings] = await Promise.all([
    contactOf(admin, scope, contactId),
    admin.from("companies").select("timezone").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle(),
    loadSalesCallSettings(admin, scope),
  ]);
  if (!contact) throw new ValidationError("That contact isn't in this business.");
  const who = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || "this contact";
  const timeZone = (company as { timezone: string | null } | null)?.timezone?.trim() || DEFAULT_TIMEZONE;

  // No time given: the next calling hours, or right now when the business calls any time.
  const when = resolveCallTime(request.when?.trim() || (settings.anyTime ? "now" : null), nowMs, timeZone);
  if ("error" in when) throw new ValidationError(when.error);

  const result = await startOwnerSalesCall(admin, {
    scope: { ...scope, timeZone },
    contactId: contact.id,
    who,
    instructions,
    customerAsked: request.customerAsked,
    consentEvidence: `${actor.label} confirmed in the app that ${who} asked to be called.`,
    consentRef: `app:${actor.profileId}`,
    runAtMs: when.immediate ? null : when.runAtMs,
    requestedByProfileId: actor.profileId,
    claimedBy: "app",
    nowMs,
  });
  if (!result.ok) {
    throw new ValidationError(result.status === "no_consent" ? `${who} hasn't agreed to automated calls. Tick the box only if they asked you to call them.` : result.message);
  }
  return result;
}

/** Cancel a call that hasn't been dialed yet. Returns false when it already went out or isn't theirs. */
export async function cancelAiCallFromApp(admin: AdminClient, scope: AiCallScope, contactId: string, salesCallId: string): Promise<boolean> {
  const { data } = await admin
    .from("sales_calls")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("contact_id", contactId)
    .eq("id", salesCallId)
    .maybeSingle();
  if (!data) return false;
  return Boolean(await cancelSalesCall(admin, salesCallId));
}
