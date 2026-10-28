/**
 * my_invoices / send_invoice_link on a CALL — "what do I owe?", "can you send me my invoice?".
 *
 * Who the customer is comes from caller ID matched to a contact, never from what they say. Caller
 * ID can be spoofed, so the phone agent never reads amounts aloud: it says how many invoices are
 * open and texts them to the number ON FILE (a spoofer doesn't receive that text).
 *
 * Phone only: by text, invoices are the Bookkeeper's (staff/bookkeeper/agent-tools.ts — its own
 * my_invoices with promise-to-pay and payment plans, on only when the owner turns it on).
 */
import { invoicePublicUrl } from "@/server/services/invoices/common";
import type { Tables } from "@/server/db/database.types";
import { deliverMessage, type ConsentContact } from "@/server/services/workflow-engine/messaging";

import { str, type Skill, type SkillContext } from "./types";

const OPEN_STATUSES = ["sent", "viewed", "partially_paid"];

export interface OpenInvoice {
  id: string;
  invoice_number: string | null;
  title: string | null;
  total_cents: number;
  balance_due_cents: number;
  due_date: string | null;
  status: string;
  public_token: string;
}

/** The caller's open invoices with a balance, oldest first. */
export async function openInvoicesFor(ctx: SkillContext): Promise<OpenInvoice[]> {
  if (!ctx.caller.contactId) return [];
  const { data, error } = await ctx.admin
    .from("invoices")
    .select("id, invoice_number, title, total_cents, balance_due_cents, due_date, status, public_token, issue_date")
    .eq("organization_id", ctx.scope.organizationId)
    .eq("company_id", ctx.scope.companyId)
    .eq("contact_id", ctx.caller.contactId)
    .in("status", OPEN_STATUSES)
    .gt("balance_due_cents", 0)
    .order("issue_date", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as OpenInvoice[];
}

type ContactRow = Pick<Tables<"contacts">, "id" | "phone" | "sms_opt_out_at" | "email_opt_out_at" | "sms_consent_at" | "consent_source">;

/** The phone ON FILE for the matched contact (never a number the caller gives). */
async function contactOnFile(ctx: SkillContext): Promise<ContactRow | null> {
  if (!ctx.caller.contactId) return null;
  const { data } = await ctx.admin
    .from("contacts")
    .select("id, phone, sms_opt_out_at, email_opt_out_at, sms_consent_at, consent_source")
    .eq("organization_id", ctx.scope.organizationId)
    .eq("company_id", ctx.scope.companyId)
    .eq("id", ctx.caller.contactId)
    .maybeSingle();
  return (data ?? null) as ContactRow | null;
}

async function payLink(ctx: SkillContext, invoice: OpenInvoice): Promise<string> {
  const [{ data: company }, { data: org }] = await Promise.all([
    ctx.admin.from("companies").select("quote_public_base_url").eq("organization_id", ctx.scope.organizationId).eq("id", ctx.scope.companyId).maybeSingle(),
    ctx.admin.from("organizations").select("platform_brand").eq("id", ctx.scope.organizationId).maybeSingle(),
  ]);
  // platform_brand picks the done-for-you host when the company has no domain of its own.
  const base = {
    quote_public_base_url: (company as { quote_public_base_url: string | null } | null)?.quote_public_base_url ?? null,
    platform_brand: (org as { platform_brand: string | null } | null)?.platform_brand ?? null,
  };
  return invoicePublicUrl(base, invoice.public_token);
}

const NOT_ON_FILE = "I don't see an account under the number you're calling from. I'll have the team look into it and get back to you.";

export const myInvoices: Skill = {
  name: "my_invoices",
  description:
    "The caller's open (unpaid) invoices with this business — for \"what do I owe?\" or \"did you get my payment?\". Matched by the number they're calling from. Don't read amounts aloud: offer to text the invoice (send_invoice_link).",
  parameters: { type: "object", properties: {} },
  channels: ["voice"],
  voice: { timeoutMs: 8_000 },
  async run(ctx) {
    if (!ctx.caller.contactId) return { ok: false, reason: "unknown_caller", say: NOT_ON_FILE };
    const open = await openInvoicesFor(ctx);
    if (open.length === 0) return { ok: true, open_invoices: 0, say: "You're all paid up — there's nothing outstanding on your account." };
    const n = open.length;
    return {
      ok: true,
      open_invoices: n,
      invoices: open.map((i) => ({ invoice_number: i.invoice_number, title: i.title })),
      say: `I see ${n === 1 ? "one open invoice" : `${n} open invoices`} on your account. I can text ${n === 1 ? "it" : "them"} to the number we have on file so you can see the details and pay online — would that help?`,
    };
  },
};

export const sendInvoiceLink: Skill = {
  name: "send_invoice_link",
  description:
    "Text the caller the link to view and pay an open invoice, to the number on file. Give invoice_number when they have more than one open invoice and said which; otherwise leave it out.",
  parameters: {
    type: "object",
    properties: { invoice_number: { type: "string", description: "The invoice number, if they have several and said which one." } },
  },
  channels: ["voice"],
  voice: { speakDuring: "Say you're sending it now.", timeoutMs: 10_000 },
  async run(ctx, input) {
    if (!ctx.caller.contactId) return { ok: false, reason: "unknown_caller", say: NOT_ON_FILE };
    const open = await openInvoicesFor(ctx);
    if (open.length === 0) return { ok: true, sent: false, say: "There's nothing outstanding on your account right now." };
    const wanted = str(input.invoice_number, 40)?.replace(/^#/, "").toLowerCase() ?? null;
    const pick = wanted ? open.filter((i) => (i.invoice_number ?? "").toLowerCase().endsWith(wanted)) : open;
    if (pick.length !== 1) {
      return {
        ok: false,
        reason: "which_invoice",
        invoices: open.map((i) => ({ invoice_number: i.invoice_number, title: i.title })),
        say: `You have ${open.length} open invoices — which one would you like? Or I can send them all.`,
      };
    }
    const invoice = pick[0];
    const link = await payLink(ctx, invoice);

    const contact = await contactOnFile(ctx);
    if (!contact?.phone) return { ok: false, reason: "no_phone", say: "I don't have a mobile number on file to text it to — I'll have the team email it to you." };
    if (contact.sms_opt_out_at) return { ok: false, reason: "opted_out", say: "Your number is opted out of texts, so I'll have the team send it another way." };
    const consent: ConsentContact = {
      sms_opt_out_at: contact.sms_opt_out_at,
      email_opt_out_at: contact.email_opt_out_at,
      sms_consent_at: contact.sms_consent_at,
      consent_source: contact.consent_source,
    };
    const label = invoice.invoice_number ? `invoice ${invoice.invoice_number}` : "your invoice";
    const result = await deliverMessage({
      context: { organizationId: ctx.scope.organizationId, actorProfileId: null, supabase: ctx.admin },
      channel: "sms",
      to: contact.phone,
      body: `Here's ${label}${invoice.title ? ` (${invoice.title})` : ""}. View and pay online: ${link}`,
      companyId: ctx.scope.companyId,
      contactId: ctx.caller.contactId,
      consentContact: consent,
    });
    if (result.status !== "sent") return { ok: false, reason: result.reason ?? result.status, say: "I couldn't send that text just now — I'll have the team send it to you." };
    return { ok: true, sent: true, invoice_number: invoice.invoice_number, say: `Done — I've texted ${label} to the number we have on file.` };
  },
};
