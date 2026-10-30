/**
 * Speed-to-lead (docs/sales-calls.md): a web lead who ticked "you can call me with your automated
 * assistant" gets a call a few minutes later, when the business has lead calls turned on.
 *
 * Runs from lead intake (lead-intake/intake.ts) after the contact is saved. Records the consent
 * (always, even when lead calls are off, so it's on file for an owner-requested call later) and
 * queues the call. Never throws: a lead is never lost or slowed because a call couldn't be queued.
 */
import type { AdminClient } from "@/server/services/front-desk/contracts";
import type { LeadEnvelope } from "@/server/services/lead-intake/envelope";
import { normalizePhoneLast10 } from "@/server/services/lead-intake/matching";

import { recordCallConsent } from "./compliance";
import { scheduleSalesCall } from "./queue";
import { loadSalesCallSettings } from "./settings";

export type SpeedToLeadResult =
  | { scheduled: true; salesCallId: string; runAtMs: number }
  | { scheduled: false; reason: "no_consent" | "unverified" | "no_phone" | "phone_mismatch" | "turned_off" | "already_open" | "error" };

/** What the lead asked about, for the call's prompt (service + a slice of their message). PURE. */
export function leadNote(envelope: Pick<LeadEnvelope, "services" | "message">): string | null {
  const service = envelope.services?.[0]?.trim();
  const message = envelope.message?.replace(/^Service:.*$/m, "").replace(/\s+/g, " ").trim();
  const parts = [service, message ? message.slice(0, 300) : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ").slice(0, 400) : null;
}

export async function maybeScheduleSpeedToLead(
  admin: AdminClient,
  input: {
    organizationId: string;
    companyId: string;
    contactId: string;
    envelope: LeadEnvelope;
    leadId: string;
    /**
     * False when the submission didn't pass the bot check (a web form whose Turnstile wasn't
     * verified). Then a bot could have typed a stranger's number and ticked the box, so neither the
     * consent nor the call is recorded. Signed intake (/api/intake) is verified.
     */
    verified?: boolean;
    nowMs?: number;
  },
): Promise<SpeedToLeadResult> {
  const consent = input.envelope.meta?.callConsent;
  if (consent?.granted !== true) return { scheduled: false, reason: "no_consent" };
  if (input.verified === false) return { scheduled: false, reason: "unverified" };
  const nowMs = input.nowMs ?? Date.now();
  const scope = { organizationId: input.organizationId, companyId: input.companyId };
  try {
    const { data } = await admin
      .from("contacts")
      .select("id, phone")
      .eq("organization_id", scope.organizationId)
      .eq("company_id", scope.companyId)
      .eq("id", input.contactId)
      .maybeSingle();
    const contact = data as { id: string; phone: string | null } | null;
    const submitted = normalizePhoneLast10(input.envelope.contact.phone);
    if (!contact?.phone || !submitted) return { scheduled: false, reason: "no_phone" };
    // Consent is for the number they typed: if the matched contact has a different number, the
    // tick doesn't cover it.
    if (normalizePhoneLast10(contact.phone) !== submitted) return { scheduled: false, reason: "phone_mismatch" };

    await recordCallConsent(admin, {
      scope,
      contactId: contact.id,
      phone: contact.phone,
      source: "form_optin",
      evidence: consent.text ?? "Ticked the automated call-back consent box on the enquiry form.",
      sourceRef: input.leadId,
      capturedAt: consent.capturedAt ?? null,
    });

    const settings = await loadSalesCallSettings(admin, scope);
    if (!settings.enabled) return { scheduled: false, reason: "turned_off" };
    const runAtMs = nowMs + settings.delayMinutes * 60_000;
    const row = await scheduleSalesCall(admin, {
      scope,
      contactId: contact.id,
      reason: "speed_to_lead",
      runAtMs,
      maxAttempts: settings.maxAttempts,
      note: leadNote(input.envelope),
      rawLeadId: input.leadId,
    });
    if (row === "already_open") return { scheduled: false, reason: "already_open" };
    return { scheduled: true, salesCallId: row.id, runAtMs };
  } catch (err) {
    console.error("[speed-to-lead] couldn't queue the call:", err instanceof Error ? err.message : err);
    return { scheduled: false, reason: "error" };
  }
}
