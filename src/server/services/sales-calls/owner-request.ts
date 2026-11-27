/**
 * Owner-requested sales calls (docs/sales-calls.md → "By text"): "call Dave and see if he wants
 * to book the spring cleanup". The owner channel proposes it (owner-channel/tools.ts →
 * sales_call), the owner confirms with a code, and executeSalesCallCommand queues it (and dials
 * now when calling hours are open).
 *
 * Consent: the customer must have agreed to automated calls. If they asked the owner to call
 * them, the owner says so and confirming the code records that as consent (owner_attested), with
 * the owner's confirmation as the evidence.
 */
import type { AdminClient, ApprovalDecision, ExecuteResult, OwnerApprovalRow } from "@/server/services/front-desk/contracts";
import { shortWhen } from "@/server/services/owner-channel/common";

import { findCallConsent, isDoNotCall, nextCallableAt, recordCallConsent } from "./compliance";
import { placeSalesCall, scheduleSalesCall } from "./queue";
import { loadSalesCallSettings } from "./settings";

export interface SalesCallPayload {
  action: "sales_call";
  contactId: string;
  who: string;
  focus: string | null;
  /** The owner said the customer asked to be called (recorded as consent on confirm). */
  customerAsked: boolean;
  /** Requested time (ms); null = as soon as calling hours allow. */
  runAtMs: number | null;
  /** The owner phone that asked (the result texts go back to it). */
  ownerPhone: string;
}

/** The confirmation line the owner answers with a code. PURE. */
export function salesCallProposal(input: { who: string; phone: string; focus: string | null; customerAsked: boolean; whenLabel: string }): { summary: string; payload: Omit<SalesCallPayload, "contactId" | "runAtMs" | "ownerPhone"> } {
  const name = input.who.length > 60 ? `${input.who.slice(0, 59).trimEnd()}…` : input.who;
  // The text shows the start of long instructions; the call gets them whole (payload.focus).
  const about = input.focus ? ` and follow your instructions ("${clip(input.focus, 160)}")` : " to answer questions, quote and book";
  const consent = input.customerAsked ? ` You're confirming ${name.split(" ")[0]} asked to be called.` : "";
  return {
    summary: `Have the AI call ${name} (${input.phone}) ${input.whenLabel}${about}?${consent}`,
    payload: { action: "sales_call", who: name, focus: input.focus, customerAsked: input.customerAsked },
  };
}

type Scope = { organizationId: string; companyId: string; timeZone: string };

/**
 * A confirmed (or declined) sales call. The contact is loaded by the approval's own organization +
 * company, never the payload alone; consent and the do-not-call list are checked again here.
 */
export async function executeSalesCallCommand(
  admin: AdminClient,
  approval: OwnerApprovalRow,
  payload: Partial<SalesCallPayload>,
  decision: ApprovalDecision,
  scope: Scope | null,
  nowMs: number = Date.now(),
): Promise<ExecuteResult> {
  const who = payload.who ?? "them";
  if (!decision.approved) return { ok: true, message: `OK, no call to ${who}.` };
  if (!scope) return { ok: false, message: "I couldn't find that business." };
  const focus = payload.focus ? ` about "${clip(payload.focus, 120)}"` : "";
  const result = await startOwnerSalesCall(admin, {
    scope,
    contactId: payload.contactId ?? "",
    who,
    instructions: payload.focus ?? null,
    customerAsked: payload.customerAsked === true,
    consentEvidence: `The owner (${payload.ownerPhone ?? decision.decidedBy}) confirmed with a code that ${who} asked to be called${focus}.`,
    consentRef: approval.id,
    runAtMs: payload.runAtMs ?? null,
    requestedByPhone: payload.ownerPhone && /^\+[0-9]{8,15}$/.test(payload.ownerPhone) ? payload.ownerPhone : null,
    claimedBy: "owner_channel",
    nowMs,
  });
  if (result.status === "no_consent") return { ok: false, message: `${who} hasn't agreed to automated calls, so I can't call. Want me to text them?` };
  if (result.status === "scheduled") return { ok: true, message: `${result.message} Say "cancel the sales call to ${who.split(" ")[0]}" to stop it.`, detail: { salesCallId: result.salesCallId, status: "scheduled" } };
  return { ok: result.ok, message: result.message, ...(result.salesCallId ? { detail: { salesCallId: result.salesCallId, status: result.status } } : {}) };
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export type StartOwnerSalesCallResult =
  | { ok: true; status: "placed" | "deferred" | "scheduled"; message: string; salesCallId: string; runAtMs: number }
  | { ok: false; status: "no_contact" | "do_not_call" | "no_consent" | "already_open"; message: string; salesCallId?: undefined }
  | { ok: false; status: "skipped" | "failed" | "already"; message: string; salesCallId: string };

/**
 * An owner-requested call to one of their contacts — by text (above, after the code) or from the
 * app (contacts/[contactId]/ai-call). Loads the contact in the caller's own organization +
 * company, checks the do-not-call list and consent (recording the owner's attestation when they
 * say the customer asked), queues the call with the owner's instructions and dials now when
 * calling hours are open. Every dial-time rule runs again in placeSalesCall.
 */
export async function startOwnerSalesCall(
  admin: AdminClient,
  input: {
    scope: Scope;
    contactId: string;
    who: string;
    instructions: string | null;
    customerAsked: boolean;
    /** Kept with the consent row when the owner attests the customer asked. */
    consentEvidence: string;
    consentRef: string | null;
    /** Requested time (ms); null = as soon as calling hours allow. */
    runAtMs: number | null;
    requestedByPhone?: string | null;
    requestedByProfileId?: string | null;
    claimedBy: string;
    nowMs?: number;
  },
): Promise<StartOwnerSalesCallResult> {
  const nowMs = input.nowMs ?? Date.now();
  const { scope, who } = input;
  const { data } = await admin
    .from("contacts")
    .select("id, phone")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("id", input.contactId)
    .maybeSingle();
  const contact = data as { id: string; phone: string | null } | null;
  if (!contact?.phone) return { ok: false, status: "no_contact", message: `I couldn't find a number for ${who} any more.` };
  if (await isDoNotCall(admin, scope, contact.phone, nowMs)) return { ok: false, status: "do_not_call", message: `${who} is on your do-not-call list - no call.` };

  if (!(await findCallConsent(admin, scope, contact))) {
    if (!input.customerAsked) return { ok: false, status: "no_consent", message: `${who} hasn't agreed to automated calls, so I can't call.` };
    await recordCallConsent(admin, {
      scope,
      contactId: contact.id,
      phone: contact.phone,
      source: "owner_attested",
      evidence: input.consentEvidence.slice(0, 600),
      sourceRef: input.consentRef,
    });
  }

  const settings = await loadSalesCallSettings(admin, scope);
  const runAtMs = nextCallableAt(Math.max(nowMs, input.runAtMs ?? nowMs), scope.timeZone, settings.anyTime);
  const row = await scheduleSalesCall(admin, {
    scope,
    contactId: contact.id,
    reason: "owner_request",
    runAtMs,
    maxAttempts: settings.maxAttempts,
    instructions: input.instructions,
    requestedByPhone: input.requestedByPhone ?? null,
    requestedByProfileId: input.requestedByProfileId ?? null,
  });
  if (row === "already_open") return { ok: false, status: "already_open", message: `A call to ${who} is already lined up.` };
  if (runAtMs <= nowMs) {
    const placed = await placeSalesCall(admin, row, { nowMs, claimedBy: input.claimedBy });
    if (placed.status === "placed" || placed.status === "deferred") {
      return { ok: true, status: placed.status, message: placed.message, salesCallId: row.id, runAtMs: placed.runAtMs ?? runAtMs };
    }
    return { ok: false, status: placed.status, message: placed.message, salesCallId: row.id };
  }
  const when = shortWhen(new Date(runAtMs).toISOString(), scope.timeZone);
  return { ok: true, status: "scheduled", message: `OK - I'll call ${who} ${when}${/[.!?]$/.test(when) ? "" : "."}`, salesCallId: row.id, runAtMs };
}
