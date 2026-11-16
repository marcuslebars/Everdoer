/**
 * The OPERATOR copy of a new lead, via Resend. Never throws — the caller treats it as best-effort.
 *
 * Privacy: this mailbox (LEAD_NOTIFY_EMAIL / OWNER_EMAIL) belongs to the platform operator. Only
 * HOUSE orgs (Everdoer-branded tenants such as A1, and leads we couldn't route to any org) may
 * be copied here. A done-for-you org's leads never are — its owner is alerted by the org's own
 * new-lead automation (new-lead-owner-alert). The caller decides with `leadNotifyAudience`.
 * The sender name is the company's own brand, never "EmpireVu".
 */

import { isDoneForYou } from "@/lib/product-line";
import type { LeadLineItem } from "./envelope";

export interface ReturningInfo {
  priorCount: number;
  priorSummaries: string[];
}

export interface NotifyLead {
  leadId: string;
  source: string | null;
  sourceSite: string | null;
  formType: string | null;
  schemaValid: boolean;
  companyName: string | null;
  contact: { name?: string; email?: string; phone?: string };
  message: string | null;
  lineItems: LeadLineItem[] | null;
  returning: ReturningInfo | null;
  /** Other A1 brands where this same person already exists (cross-brand overlap). */
  crossBrandBrands: string[];
  /** Phone-lead urgency (Retell post-call analysis): escalates subject + adds a callback line. */
  urgent?: boolean;
}

function buildText(lead: NotifyLead): string {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const parts: Array<string | null> = [
    `Lead ID: ${lead.leadId}`,
    `Source: ${lead.source ?? "?"} (brand: ${lead.sourceSite ?? "?"})`,
    `Type: ${lead.formType ?? "?"}`,
    lead.companyName ? `Company: ${lead.companyName}` : null,
    "",
    `Name:  ${lead.contact.name ?? "—"}`,
    `Email: ${lead.contact.email ?? "—"}`,
    `Phone: ${lead.contact.phone ?? "—"}`,
    lead.message ? `\nMessage:\n${lead.message}` : null,
  ];
  if (lead.lineItems?.length) {
    parts.push("", "Line items:");
    for (const li of lead.lineItems) {
      parts.push(`  - ${li.quantity} × ${li.description} @ ${money(li.unitPriceCents)}`);
    }
  }
  if (lead.returning && lead.returning.priorCount > 0) {
    parts.push("", `↩ RETURNING CONTACT — ${lead.returning.priorCount} prior ${lead.sourceSite ?? "brand"} lead(s)`);
    for (const s of lead.returning.priorSummaries) parts.push(`  - ${s}`);
  }
  if (lead.crossBrandBrands.length) {
    parts.push("", `⚑ ALSO A CUSTOMER OF: ${lead.crossBrandBrands.join(", ")} — cross-brand, handle as a warm lead`);
  }
  if (lead.urgent) {
    parts.push("", "🚨 URGENT — the caller flagged this as time-sensitive. Call them back ASAP.");
  }
  if (!lead.schemaValid) {
    parts.push("", "⚠ NEEDS ATTENTION — this payload did not match the lead schema and was stored raw. Review it in raw_leads.");
  }
  return parts.filter((p) => p !== null).join("\n");
}

export type LeadNotifyAudience = "operator" | "none";

/**
 * Who may get the operator copy: house orgs (platform_brand not 'crankleads', no done-for-you
 * tier) and unrouted leads → "operator"; any done-for-you org → "none". PURE.
 */
export function leadNotifyAudience(org: { platform_brand: string | null; crankleads_tier: string | null } | null, routed: boolean): LeadNotifyAudience {
  if (!routed) return "operator";
  if (!org) return "none"; // unknown org → fail closed (never leak a tenant's lead)
  if (isDoneForYou(org.platform_brand) || org.crankleads_tier) return "none";
  return "operator";
}

/** "Name <addr>" | "addr" → "addr". */
function emailAddressOf(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim() || null;
}

/** The sender: the company's brand as the display name (never EmpireVu), on our lead address. */
export function leadFromHeader(companyName: string | null, env: NodeJS.ProcessEnv = process.env): string {
  const address = emailAddressOf(env.LEAD_FROM_EMAIL) ?? emailAddressOf(env.OUTBOUND_FROM_EMAIL) ?? "leads@a1marinecare.ca";
  const name = (companyName?.trim() || "New lead").replace(/[<>"\r\n]/g, "").slice(0, 60);
  return `${name} leads <${address}>`;
}

/**
 * The `sourceSite` tags of the platform's own marketing site, everdoer.com. Its question form
 * still sends the old wire name "crankleads"; "everdoer" is what it becomes.
 */
const PLATFORM_SITE_SOURCE_SITES = new Set(["crankleads", "everdoer"]);

/** Is this lead an enquiry about Everdoer itself (from everdoer.com), not a house business's customer? PURE. */
export function isPlatformSiteLead(sourceSite: string | null | undefined): boolean {
  return Boolean(sourceSite && PLATFORM_SITE_SOURCE_SITES.has(sourceSite.trim().toLowerCase()));
}

/**
 * Who gets the operator copy of a lead. PURE.
 *  - An enquiry from everdoer.com → the platform inbox (EVERDOER_OPERATOR_EMAIL, else as below).
 *  - Everything else that reaches here (a house business's lead, e.g. A1 Marine Care; a lead we
 *    couldn't route) → LEAD_NOTIFY_EMAIL, else OWNER_EMAIL, exactly as before.
 * Until 16 Nov 2026 both went to the one address, so A1's blocked inbox also swallowed every
 * everdoer.com enquiry.
 */
export function leadNotifyRecipient(sourceSite: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  const platform = env.EVERDOER_OPERATOR_EMAIL?.trim();
  if (platform && isPlatformSiteLead(sourceSite)) return platform;
  return env.LEAD_NOTIFY_EMAIL ?? env.OWNER_EMAIL ?? null;
}

export async function sendLeadNotification(lead: NotifyLead): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = leadNotifyRecipient(lead.sourceSite);
  // An everdoer.com enquiry has no company: sign it "Everdoer leads", not "New lead leads".
  const from = leadFromHeader(lead.companyName ?? (isPlatformSiteLead(lead.sourceSite) ? "Everdoer" : null));

  if (!apiKey || !to) {
    console.warn("[intake] RESEND_API_KEY or LEAD_NOTIFY_EMAIL not set — skipping notification email");
    return false;
  }

  const who = lead.contact.name || lead.contact.email || lead.contact.phone || "Unknown";
  const markers = [
    lead.urgent ? "🚨 URGENT" : null,
    !lead.schemaValid ? "⚠ NEEDS ATTENTION" : null,
    lead.crossBrandBrands.length ? "⚑ CROSS-BRAND" : null,
    lead.returning && lead.returning.priorCount > 0 ? "↩ RETURNING" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const subject = `[${lead.sourceSite ?? "lead"}] ${lead.formType ?? "lead"} — ${who}${markers ? ` ${markers}` : ""}`;
  const text = buildText(lead);

  // Retry a couple of times; a failed email never fails the intake.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      if (res.ok) return true;
      console.warn(`[intake] Resend error (attempt ${attempt}): ${res.status} ${await res.text().catch(() => "")}`);
    } catch (err) {
      console.warn(`[intake] Resend request failed (attempt ${attempt}):`, err);
    }
  }
  return false;
}
