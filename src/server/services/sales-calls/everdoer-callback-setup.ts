/**
 * Sets up Everdoer's own "Have Everly call me now" line (everdoer-callback.ts,
 * docs/sales-calls.md → Everdoer's own callback): the "Everdoer" company in the internal
 * Everdoer Demo org, its price list (the plans), its notes (the facts Everly may tell callers),
 * lead calls on, a form key for everdoer.com, and its own Retell number (which is also the
 * inbound sales line). Run by job:everdoer-callback-setup.
 *
 * Idempotent: every step looks for what's already there first, so re-running only fills gaps
 * (a plan price that changed is updated; notes are matched by their exact text). The number
 * is bought only with `apply` AND when the company has no active Retell number yet.
 *
 * Plans and notes mirror everdoer.com (crankleads-system src/config.ts, docs/claims-ledger.md):
 * change them there first, then here — or edit them in the app (price list, Notes) afterwards.
 */
import { addNote, listNotes } from "@/server/agent/memory";
import type { Json } from "@/server/db/database.types";
import { toJson } from "@/server/db/json";
import { createCompany } from "@/server/services/companies";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { generatePublicFormKey, normalizeAllowedOrigins } from "@/server/services/lead-intake/public-form-keys";
import type { TenantServiceContext } from "@/server/services/shared";

import { saveSalesCallSettings } from "./settings";

/** The internal org the company lives in (Everdoer Demo; plan "internal", never billed). */
export const EVERDOER_CALLBACK_ORG_ID = "0a78234e-5cc4-43a8-849b-b8a5a5b69f8b";
/** The name callers hear AND the name in the call-consent wording (callConsentText). */
export const EVERDOER_CALLBACK_COMPANY_NAME = "Everdoer";
export const EVERDOER_CALLBACK_COMPANY_SLUG = "everdoer";
export const EVERDOER_CALLBACK_FORM_LABEL = "everdoer.com: Have Everly call me";
export const EVERDOER_CALLBACK_ORIGINS = ["https://everdoer.com", "https://www.everdoer.com"];
/** Area codes to try for the new number, in order (Georgian Bay first). */
export const EVERDOER_CALLBACK_AREA_CODES = [249, 705];

export interface EverdoerPlanItem {
  serviceKey: string;
  label: string;
  /** Monthly price in cents, CAD before HST. */
  monthlyCents: number;
  sortOrder: number;
}

export const EVERDOER_PLAN_ITEMS: EverdoerPlanItem[] = [
  { serviceKey: "everdoer_close_plan", label: "Close plan", monthlyCents: 29_900, sortOrder: 1 },
  { serviceKey: "everdoer_front_desk_plan", label: "Front Desk plan", monthlyCents: 49_900, sortOrder: 2 },
];

/** Each ≤ 500 chars (agent_notes cap). Only claims everdoer.com already makes. */
export const EVERDOER_CALLBACK_NOTES: string[] = [
  "Prices are in Canadian dollars, before HST, month to month with no contract. Every plan starts with a 14-day free trial: the card is taken at checkout and the monthly price starts when the trial ends.",
  "Setup is $499. It's waived for founding businesses while the founding spots last (25 in total), and founding businesses keep today's monthly price for as long as they stay subscribed, in exchange for a short case study once their numbers are in.",
  "The Close plan: set up for you, a web page built for the business, missed-call text-back in seconds, customer texts answered in the business's name, quote follow-up (a text at 2 days, an email at 5, then a reminder to call), online quotes with card deposits paid to the business's own Stripe account, and an online booking link with reminder texts.",
  "The Close plan also has review requests after finished jobs, a rebooking text after a no-show, a reminder when a lead goes quiet for 3 days, every lead in one inbox, new-lead alerts by email, and a monthly results scorecard.",
  "The Front Desk plan is everything in Close plus an AI receptionist that answers calls in the business's name, quotes from the business's own price list and books the job, and texts the owner during the call when it's urgent. 500 AI call minutes a month are included.",
  "Guarantee: live in 5 business days or the first month is free. Setup is three quick questions by text and one link to turn on call forwarding. If setup isn't finished after 24 hours, a real person calls and finishes it with them.",
  "Everdoer is built for trades: property maintenance and snow removal, landscaping, roofing, HVAC and plumbing, contracting and renovation, marine, auto detailing and cleaning. It's made by Everdoer Technologies Inc., a Canadian company in Ontario.",
  "To sign up, they go to everdoer.com, pick a plan and check out. For a walkthrough or questions you can't answer, Marcus, the founder, follows up personally.",
];

export const EVERDOER_CALLBACK_PERSONA = { name: "Everly", tone: "friendly" } as const;

export const EVERDOER_CALLBACK_SALES_SETTINGS = {
  enabled: true,
  delayMinutes: 1,
  maxAttempts: 2,
  retryMinutes: 30,
  dailyCap: 60,
  voicemail: "leave_message" as const,
};

export interface SetupDeps {
  /** Buys the Retell number + inbound agent (onboarding-provision.provisionPhoneForCompany). */
  provisionPhone: (context: TenantServiceContext, input: { companyId: string; areaCode: number }) => Promise<{ phoneNumber: string; agentId: string }>;
}

export interface SetupReport {
  apply: boolean;
  companyId: string | null;
  formKey: string | null;
  phoneNumber: string | null;
  steps: string[];
}

type Row = Record<string, unknown>;

async function rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw error instanceof Error ? error : new Error(String((error as { message?: unknown }).message ?? error));
  return (data ?? []) as Row[];
}

/**
 * Run (apply=true) or describe (apply=false) every step. Never buys a number in a dry run.
 * Throws when the org isn't the internal one it should be (never sets this up on a billed org).
 */
export async function runEverdoerCallbackSetup(admin: AdminClient, options: { apply: boolean; orgId?: string }, deps: SetupDeps): Promise<SetupReport> {
  const apply = options.apply;
  const orgId = options.orgId ?? EVERDOER_CALLBACK_ORG_ID;
  const report: SetupReport = { apply, companyId: null, formKey: null, phoneNumber: null, steps: [] };
  const step = (text: string): void => {
    report.steps.push(apply ? text : `(dry run) ${text}`);
  };

  const [org] = await rows(admin.from("organizations").select("id, name, plan").eq("id", orgId).limit(1));
  if (!org) throw new Error(`organization ${orgId} not found`);
  if (org.plan !== "internal") throw new Error(`organization ${orgId} is on plan "${String(org.plan)}", not "internal" — mark it internal first so it's never billed`);

  const [owner] = await rows(admin.from("organization_memberships").select("profile_id").eq("organization_id", orgId).eq("role", "owner").limit(1));
  const context: TenantServiceContext = { supabase: admin as TenantServiceContext["supabase"], organizationId: orgId, actorProfileId: (owner?.profile_id as string | undefined) ?? null };

  // 1. The company.
  const companies = await rows(admin.from("companies").select("id, name, slug, owner_phone_e164, timezone").eq("organization_id", orgId));
  let company = companies.find((c) => c.slug === EVERDOER_CALLBACK_COMPANY_SLUG) ?? null;
  const ownerPhone = (company?.owner_phone_e164 as string | null | undefined) ?? (companies.find((c) => typeof c.owner_phone_e164 === "string" && c.owner_phone_e164)?.owner_phone_e164 as string | undefined) ?? null;
  if (!company) {
    step(`create company "${EVERDOER_CALLBACK_COMPANY_NAME}" (slug ${EVERDOER_CALLBACK_COMPANY_SLUG})`);
    if (!apply) return report;
    const created = await createCompany(context, { name: EVERDOER_CALLBACK_COMPANY_NAME, slug: EVERDOER_CALLBACK_COMPANY_SLUG, website: "https://everdoer.com" });
    company = created as unknown as Row;
  } else {
    step(`company "${String(company.name)}" exists (${String(company.id)})`);
  }
  const companyId = String(company.id);
  report.companyId = companyId;
  const scope = { organizationId: orgId, companyId };

  // 2. Name, owner line, time zone, Everly.
  const profile = { name: EVERDOER_CALLBACK_COMPANY_NAME, timezone: "America/Toronto", owner_phone_e164: ownerPhone, agent_persona: toJson(EVERDOER_CALLBACK_PERSONA) as Json, service_area: "Canada" };
  step(`set name, time zone America/Toronto, Everly (friendly), owner phone ${ownerPhone ? "copied from the org" : "MISSING — set it in the app"}`);
  if (apply) {
    const { error } = await admin.from("companies").update(profile).eq("organization_id", orgId).eq("id", companyId);
    if (error) throw error;
  }

  // 3. The price list: the plans.
  const items = await rows(admin.from("service_catalog_items").select("id, service_key, rate_cents, label, unit_label, pricing_type").eq("organization_id", orgId).eq("company_id", companyId));
  for (const plan of EVERDOER_PLAN_ITEMS) {
    const fields = { label: plan.label, pricing_type: "per_unit", rate_cents: plan.monthlyCents, minimum_cents: 0, unit_label: "month", sort_order: plan.sortOrder, active: true };
    const existing = items.find((i) => i.service_key === plan.serviceKey);
    if (!existing) {
      step(`add "${plan.label}" at $${plan.monthlyCents / 100} per month`);
      if (apply) {
        const { error } = await admin.from("service_catalog_items").insert({ organization_id: orgId, company_id: companyId, service_key: plan.serviceKey, ...fields });
        if (error) throw error;
      }
    } else if (existing.rate_cents !== plan.monthlyCents || existing.label !== plan.label || existing.unit_label !== "month" || existing.pricing_type !== "per_unit") {
      step(`update "${plan.label}" to $${plan.monthlyCents / 100} per month`);
      if (apply) {
        const { error } = await admin.from("service_catalog_items").update(fields).eq("id", existing.id as string);
        if (error) throw error;
      }
    }
  }

  // 4. The notes Everly may tell callers (exact-text match, so edits in the app aren't duplicated).
  const have = new Set((await listNotes(admin, scope, { limit: 300 })).map((n) => n.body.trim()));
  const missing = EVERDOER_CALLBACK_NOTES.filter((n) => !have.has(n));
  if (missing.length > 0) step(`add ${missing.length} note${missing.length === 1 ? "" : "s"} about Everdoer`);
  if (apply) {
    for (const body of missing) {
      const added = await addNote(admin, scope, { contactId: null, body, source: "system" });
      if (!added.ok) throw new Error(`note not saved: ${added.reason}`);
    }
  }

  // 5. Lead calls on, one-minute delay (the callback dials straight from intake anyway).
  step("turn lead calls on (1-minute delay, 2 attempts 30 minutes apart, voicemail message)");
  if (apply) await saveSalesCallSettings(admin, scope, EVERDOER_CALLBACK_SALES_SETTINGS);

  // 6. The form key everdoer.com posts to (only from everdoer.com).
  const keys = await rows(admin.from("public_form_keys").select("public_key, label, active").eq("organization_id", orgId).eq("company_id", companyId).eq("active", true));
  const key = keys.find((k) => k.label === EVERDOER_CALLBACK_FORM_LABEL);
  if (key) {
    report.formKey = String(key.public_key);
    step(`form key exists: ${report.formKey}`);
  } else {
    step(`create a form key for ${EVERDOER_CALLBACK_ORIGINS.join(", ")}`);
    if (apply) {
      const publicKey = generatePublicFormKey();
      const { error } = await admin.from("public_form_keys").insert({
        organization_id: orgId,
        company_id: companyId,
        public_key: publicKey,
        label: EVERDOER_CALLBACK_FORM_LABEL,
        form_type: "contact",
        allowed_origins: normalizeAllowedOrigins(EVERDOER_CALLBACK_ORIGINS),
        created_by: context.actorProfileId,
        active: true,
      });
      if (error) throw error;
      report.formKey = publicKey;
    }
  }

  // 7. The number (caller ID for the callback + the inbound sales line). Bought last: everything
  //    above is in the receptionist's prompt, so it's built with the plans and Everly's name.
  const [number] = await rows(admin.from("voice_numbers").select("phone_e164").eq("organization_id", orgId).eq("company_id", companyId).eq("provider", "retell").eq("active", true).limit(1));
  if (number) {
    report.phoneNumber = String(number.phone_e164);
    step(`Retell number exists: ${report.phoneNumber}`);
  } else {
    step(`buy a Retell number (area code ${EVERDOER_CALLBACK_AREA_CODES.join(", then ")}) with Everly answering as Everdoer`);
    if (apply) {
      let lastError: unknown = null;
      for (const areaCode of EVERDOER_CALLBACK_AREA_CODES) {
        try {
          const result = await deps.provisionPhone(context, { companyId, areaCode });
          report.phoneNumber = result.phoneNumber;
          break;
        } catch (err) {
          lastError = err;
          report.steps.push(`area code ${areaCode} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!report.phoneNumber) throw lastError instanceof Error ? lastError : new Error("couldn't buy a number");
      step(`bought ${report.phoneNumber}`);
    }
  }
  return report;
}
