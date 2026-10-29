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
  const about = input.focus ? ` about "${input.focus}"` : "";
  const consent = input.customerAsked ? ` You're confirming ${name.split(" ")[0]} asked to be called.` : "";
  return {
    summary: `Have the AI call ${name} (${input.phone}) ${input.whenLabel}${about} to answer questions, quote and book?${consent}`,
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
  const { data } = await admin
    .from("contacts")
    .select("id, phone")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("id", payload.contactId ?? "")
    .maybeSingle();
  const contact = data as { id: string; phone: string | null } | null;
  if (!contact?.phone) return { ok: false, message: `I couldn't find a number for ${who} any more.` };
  if (await isDoNotCall(admin, scope, contact.phone, nowMs)) return { ok: false, message: `${who} is on your do-not-call list - no call.` };

  if (!(await findCallConsent(admin, scope, contact))) {
    if (payload.customerAsked !== true) return { ok: false, message: `${who} hasn't agreed to automated calls, so I can't call. Want me to text them?` };
    const focus = payload.focus ? ` about "${payload.focus}"` : "";
    await recordCallConsent(admin, {
      scope,
      contactId: contact.id,
      phone: contact.phone,
      source: "owner_attested",
      evidence: `The owner (${payload.ownerPhone ?? decision.decidedBy}) confirmed with a code that ${who} asked to be called${focus}.`,
      sourceRef: approval.id,
    });
  }

  const settings = await loadSalesCallSettings(admin, scope);
  const runAtMs = nextCallableAt(Math.max(nowMs, payload.runAtMs ?? nowMs), scope.timeZone);
  const row = await scheduleSalesCall(admin, {
    scope,
    contactId: contact.id,
    reason: "owner_request",
    runAtMs,
    maxAttempts: settings.maxAttempts,
    note: payload.focus ?? null,
    requestedByPhone: payload.ownerPhone && /^\+[0-9]{8,15}$/.test(payload.ownerPhone) ? payload.ownerPhone : null,
  });
  if (row === "already_open") return { ok: false, message: `A call to ${who} is already lined up.` };
  if (runAtMs <= nowMs) {
    const placed = await placeSalesCall(admin, row, { nowMs, claimedBy: "owner_channel" });
    return { ok: placed.status === "placed" || placed.status === "deferred", message: placed.message, detail: { salesCallId: row.id, status: placed.status } };
  }
  const when = shortWhen(new Date(runAtMs).toISOString(), scope.timeZone);
  return { ok: true, message: `OK - I'll call ${who} ${when}${/[.!?]$/.test(when) ? "" : "."} Say "cancel the sales call to ${who.split(" ")[0]}" to stop it.`, detail: { salesCallId: row.id, status: "scheduled" } };
}
