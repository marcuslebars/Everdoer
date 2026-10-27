/**
 * Voice overage billing (docs/billing.md → "Voice overage").
 *
 * AI call minutes are metered (`voice_minutes` usage events) against an allowance
 * (voice/minutes.ts → loadMinuteAllowance): Front Desk's org-wide plan minutes, or each Catch /
 * Close company's call_answering.included_minutes. Going over used to show only as "N min over
 * cap" in Settings → Billing. This pass bills it:
 *
 *   run daily by the voice-overage cron (railway.voice-overage.json → job:voice-overage --run):
 *   once a Toronto month has closed (from 06:00 on the 1st), for every org that went over,
 *   one `voice_overage_charges` row (the claim; unique per org + month) and — in charge mode —
 *   one Stripe invoice item: STRIPE_PRICE_VOICE_OVERAGE (a per-minute price; the amount lives in
 *   Stripe, never in code) × the minutes over, rounded up. A pending invoice item rides on the
 *   customer's next subscription invoice.
 *
 * VOICE_OVERAGE_BILLING: unset/"off" (default) → nothing; "record" → rows only (a dry run, never
 * charged later); "charge" → rows + Stripe (falls back to "record" without the price id).
 * Internal (house) plans are never billed. An org with no Stripe customer gets a "skipped" row.
 *
 * VOICE_OVERAGE_ANSWER_MINUTES (default 0): in charge mode, how many minutes PAST the allowance
 * the AI keeps answering for an org that will be billed (ai-answer.ts) instead of sending
 * callers to voicemail. 0 keeps today's behaviour (voicemail once the allowance is spent).
 */
import type Stripe from "stripe";

import { getStripeClient } from "@/server/services/billing/stripe";
import { torontoMonthStart } from "@/server/services/usage";
import { readCallAnsweringSettings } from "@/server/services/voice/answering-settings";
import { loadMinuteAllowance, monthName } from "@/server/services/voice/minutes";
import { isDoneForYou } from "@/lib/product-line";
import type { Json, Tables } from "@/server/db/database.types";
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type VoiceOverageMode = "off" | "record" | "charge";
/** The env vars read here (process.env by default; a plain object in tests). */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export const MAX_CHARGE_ATTEMPTS = 3;
/** A "charging" row older than this was left by a crashed pass; the idempotency key makes a retry safe. */
export const STALE_CHARGING_MS = 15 * 60_000;
/** Usage from calls that end just before midnight lands a little later: wait this long into the new month. */
export const MONTH_CLOSE_DELAY_MS = 6 * 60 * 60_000;
export const MAX_ANSWER_OVERAGE_MINUTES = 2_000;

let warnedNoPrice = false;
/** The last month a pass finished with nothing left to do (per mode), so a long-lived caller skips it. */
let settled: { month: string; mode: VoiceOverageMode } | null = null;

/** Tests: forget the settled month. */
export function resetVoiceOverageMemo(): void {
  settled = null;
}

/** STRIPE_PRICE_VOICE_OVERAGE — the per-minute overage Price id, or null. */
export function voiceOveragePriceId(env: EnvLike = process.env): string | null {
  return env.STRIPE_PRICE_VOICE_OVERAGE?.trim() || null;
}

/** VOICE_OVERAGE_BILLING → the mode ("charge" without a price id is "record"). */
export function voiceOverageMode(env: EnvLike = process.env): VoiceOverageMode {
  const raw = env.VOICE_OVERAGE_BILLING?.trim().toLowerCase();
  if (raw === "record") return "record";
  if (raw === "charge") {
    if (voiceOveragePriceId(env)) return "charge";
    if (!warnedNoPrice) {
      warnedNoPrice = true;
      console.warn("[voice-overage] VOICE_OVERAGE_BILLING=charge but STRIPE_PRICE_VOICE_OVERAGE is unset — recording only");
    }
    return "record";
  }
  return "off";
}

/** VOICE_OVERAGE_ANSWER_MINUTES, 0..MAX_ANSWER_OVERAGE_MINUTES (anything else → 0). */
export function overageAnswerMinutes(env: EnvLike = process.env): number {
  const n = Number.parseInt(env.VOICE_OVERAGE_ANSWER_MINUTES ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_ANSWER_OVERAGE_MINUTES, n) : 0;
}

/** Will this org be billed for overage? Charge mode, a Stripe customer, not a house plan. PURE apart from env. */
export function billsVoiceOverage(org: { plan: string | null; stripe_customer_id: string | null }, env: EnvLike = process.env): boolean {
  return voiceOverageMode(env) === "charge" && org.plan !== "internal" && Boolean(org.stripe_customer_id?.trim());
}

/**
 * Minutes the AI may keep answering past the allowance for this org (0 unless it will be
 * billed for them). PURE apart from env.
 */
export function overageHeadroomMinutes(org: { plan: string | null; stripe_customer_id: string | null }, env: EnvLike = process.env): number {
  return billsVoiceOverage(org, env) ? overageAnswerMinutes(env) : 0;
}

/** 'YYYY-MM-01' → the month before. PURE. */
export function previousMonth(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The latest closed Toronto month at `nowMs` (the previous month, from 06:00 on the 1st). PURE. */
export function closedMonth(nowMs: number): string {
  return previousMonth(torontoMonthStart(new Date(nowMs - MONTH_CLOSE_DELAY_MS)));
}

/** Minutes over → whole minutes billed (rounded up; a float hair over a whole minute doesn't round up). PURE. */
export function billableMinutes(overMinutes: number): number {
  if (!Number.isFinite(overMinutes) || overMinutes <= 0) return 0;
  return Math.ceil(overMinutes - 1e-6);
}

export interface OrgOverage {
  organizationId: string;
  scope: "organization" | "company";
  includedMinutes: number;
  usedMinutes: number;
  /** Whole minutes to bill (> 0). */
  overageMinutes: number;
  detail: Array<{ company_id: string; included_minutes: number; used_minutes: number; overage_minutes: number }>;
  plan: string | null;
  stripeCustomerId: string | null;
}

type OrgRow = Pick<Tables<"organizations">, "id" | "plan" | "platform_brand" | "crankleads_tier" | "stripe_customer_id">;
interface UsageRow {
  organization_id: string;
  company_id: string | null;
  quantity: number | null;
}

const PAGE = 1000;

async function voiceUsage(admin: AdminClient, month: string): Promise<UsageRow[]> {
  const out: UsageRow[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await admin
      .from("usage_monthly_v")
      .select("organization_id, company_id, quantity")
      .eq("month", month)
      .eq("kind", "voice_minutes")
      .order("organization_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as UsageRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function inChunks<T>(ids: string[], read: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...(await read(ids.slice(i, i + 200))));
  return out;
}

/**
 * Every org that went over its allowance in `month` (a closed month), with the minutes to bill.
 * The allowance is loadMinuteAllowance's — the same numbers the answering decision uses.
 */
export async function computeVoiceOverages(admin: AdminClient, month: string): Promise<OrgOverage[]> {
  const usage = await voiceUsage(admin, month);
  if (usage.length === 0) return [];
  const orgIds = [...new Set(usage.map((u) => u.organization_id))];
  const orgs = await inChunks(orgIds, async (part) => {
    const { data, error } = await admin.from("organizations").select("id, plan, platform_brand, crankleads_tier, stripe_customer_id").in("id", part);
    if (error) throw error;
    return (data ?? []) as OrgRow[];
  });
  const companyIds = [...new Set(usage.map((u) => u.company_id).filter((id): id is string => Boolean(id)))];
  const companies = await inChunks(companyIds, async (part) => {
    const { data, error } = await admin.from("companies").select("id, organization_id, ai_settings").in("id", part);
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; organization_id: string; ai_settings: Json | null }>;
  });
  const companyById = new Map(companies.map((c) => [c.id, c]));
  // A date inside the month: loadMinuteAllowance works out the month from it.
  const [y, m] = month.split("-").map(Number);
  const inMonth = new Date(Date.UTC(y, m - 1, 15, 12));

  const out: OrgOverage[] = [];
  for (const org of orgs) {
    if (org.plan === "internal") continue; // house plans: unlimited, never billed
    const frontDesk = org.crankleads_tier === "front_desk" || org.plan === "front_desk";
    const base = { organizationId: org.id, plan: org.plan, stripeCustomerId: org.stripe_customer_id?.trim() || null };
    const anyCompany = usage.find((u) => u.organization_id === org.id && u.company_id)?.company_id ?? null;
    if (frontDesk) {
      // Org-wide: the company id isn't used for the Front Desk allowance.
      const a = await loadMinuteAllowance(admin, { organizationId: org.id, companyId: anyCompany ?? "", tier: org.crankleads_tier, plan: org.plan, includedMinutes: 0 }, inMonth);
      if (a.includedMinutes === null || a.remainingMinutes === null) continue;
      const minutes = billableMinutes(-a.remainingMinutes);
      if (minutes > 0) out.push({ ...base, scope: "organization", includedMinutes: a.includedMinutes, usedMinutes: a.usedMinutes, overageMinutes: minutes, detail: [] });
      continue;
    }
    const doneForYou = isDoneForYou(org.platform_brand);
    const ownCompanies = [...new Set(usage.filter((u) => u.organization_id === org.id && u.company_id).map((u) => u.company_id as string))];
    const detail: OrgOverage["detail"] = [];
    let included = 0;
    let used = 0;
    let over = 0;
    for (const companyId of ownCompanies) {
      const company = companyById.get(companyId);
      if (!company || company.organization_id !== org.id) continue;
      const includedMinutes = readCallAnsweringSettings(company.ai_settings, { doneForYou }).includedMinutes;
      const a = await loadMinuteAllowance(admin, { organizationId: org.id, companyId, tier: org.crankleads_tier, plan: org.plan, includedMinutes }, inMonth);
      included += includedMinutes;
      used += a.usedMinutes;
      const companyOver = Math.max(0, -(a.remainingMinutes ?? 0));
      if (companyOver > 0) {
        over += companyOver;
        detail.push({ company_id: companyId, included_minutes: includedMinutes, used_minutes: a.usedMinutes, overage_minutes: Math.round(companyOver * 10) / 10 });
      }
    }
    const minutes = billableMinutes(over);
    if (minutes > 0) out.push({ ...base, scope: "company", includedMinutes: included, usedMinutes: Math.round(used * 10) / 10, overageMinutes: minutes, detail });
  }
  return out;
}

export interface VoiceOverageDeps {
  stripe?: Pick<Stripe, "invoiceItems">;
  env?: EnvLike;
}

export interface VoiceOverageResult {
  month: string;
  mode: VoiceOverageMode;
  over: number;
  recorded: number;
  skipped: number;
  charged: number;
  failed: number;
}

type ChargeRow = Tables<"voice_overage_charges">;

function rowFor(o: OrgOverage, month: string, status: ChargeRow["status"], extra: Partial<ChargeRow> = {}) {
  return {
    organization_id: o.organizationId,
    month,
    scope: o.scope,
    included_minutes: o.includedMinutes,
    used_minutes: o.usedMinutes,
    overage_minutes: o.overageMinutes,
    detail: o.detail,
    status,
    stripe_customer_id: o.stripeCustomerId,
    ...extra,
  };
}

/**
 * Claim this org's month for charging. Insert "charging"; on a duplicate, take it over only
 * when it failed with tries left or a crashed pass left it "charging". The row's attempts after
 * the claim, or null when someone else has it / it's finished.
 */
async function claim(admin: AdminClient, o: OrgOverage, month: string, priceId: string, nowMs: number): Promise<number | null> {
  const { error } = await admin.from("voice_overage_charges").insert(rowFor(o, month, "charging", { attempts: 1, stripe_price_id: priceId }));
  if (!error) return 1;
  if ((error as { code?: string }).code !== "23505") throw error;
  const { data: existing, error: readError } = await admin
    .from("voice_overage_charges")
    .select("status, attempts, updated_at")
    .eq("organization_id", o.organizationId)
    .eq("month", month)
    .maybeSingle();
  if (readError) throw readError;
  const row = existing as Pick<ChargeRow, "status" | "attempts" | "updated_at"> | null;
  if (!row) return null;
  const retry = row.status === "failed" && row.attempts < MAX_CHARGE_ATTEMPTS;
  const stale = row.status === "charging" && Date.parse(row.updated_at) < nowMs - STALE_CHARGING_MS;
  if (!retry && !stale) return null;
  const attempts = row.attempts + 1;
  const { data: taken, error: takeError } = await admin
    .from("voice_overage_charges")
    .update({ status: "charging", attempts, stripe_price_id: priceId, last_error: null })
    .eq("organization_id", o.organizationId)
    .eq("month", month)
    .eq("status", row.status)
    .eq("attempts", row.attempts)
    .select("organization_id");
  if (takeError) throw takeError;
  return ((taken ?? []) as unknown[]).length > 0 ? attempts : null;
}

/**
 * The monthly pass. Idempotent: one row per org per month, and the Stripe invoice item is
 * created with an idempotency key on (org, month, minutes). Never throws per org — a failure is
 * recorded on the row and retried on a later pass (up to MAX_CHARGE_ATTEMPTS).
 */
export async function processVoiceOverage(admin: AdminClient, nowMs: number, deps: VoiceOverageDeps = {}): Promise<VoiceOverageResult> {
  const env = deps.env ?? process.env;
  const mode = voiceOverageMode(env);
  const month = closedMonth(nowMs);
  const result: VoiceOverageResult = { month, mode, over: 0, recorded: 0, skipped: 0, charged: 0, failed: 0 };
  if (mode === "off") return result;
  if (settled && settled.month === month && settled.mode === mode) return result;

  const overages = await computeVoiceOverages(admin, month);
  result.over = overages.length;
  const priceId = voiceOveragePriceId(env);
  const label = `${monthName(month)} ${month.slice(0, 4)}`;

  for (const o of overages) {
    try {
      if (mode === "record" || !priceId) {
        const { error } = await admin.from("voice_overage_charges").insert(rowFor(o, month, "recorded"));
        if (!error) result.recorded += 1;
        else if ((error as { code?: string }).code !== "23505") throw error;
        continue;
      }
      if (!o.stripeCustomerId) {
        const { error } = await admin.from("voice_overage_charges").insert(rowFor(o, month, "skipped", { last_error: "no Stripe customer" }));
        if (!error) result.skipped += 1;
        else if ((error as { code?: string }).code !== "23505") throw error;
        continue;
      }
      const attempts = await claim(admin, o, month, priceId, nowMs);
      if (attempts === null) continue;
      try {
        const stripe = deps.stripe ?? getStripeClient();
        const item = await stripe.invoiceItems.create(
          {
            customer: o.stripeCustomerId,
            pricing: { price: priceId },
            quantity: o.overageMinutes,
            description: `AI call minutes over your plan's allowance, ${label} (${o.overageMinutes} min)`,
            metadata: { kind: "voice_overage", organization_id: o.organizationId, month },
          },
          { idempotencyKey: `voice-overage-${o.organizationId}-${month}-${o.overageMinutes}` },
        );
        const { error } = await admin
          .from("voice_overage_charges")
          .update({ status: "charged", stripe_invoice_item_id: item.id, charged_at: new Date(nowMs).toISOString(), last_error: null })
          .eq("organization_id", o.organizationId)
          .eq("month", month);
        if (error) throw error;
        result.charged += 1;
      } catch (err) {
        result.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error("[voice-overage] charge failed", { organizationId: o.organizationId, month, attempts, error: message });
        await admin
          .from("voice_overage_charges")
          .update({ status: "failed", last_error: message.slice(0, 500) })
          .eq("organization_id", o.organizationId)
          .eq("month", month);
      }
    } catch (err) {
      result.failed += 1;
      console.error("[voice-overage] org failed", { organizationId: o.organizationId, month, error: err instanceof Error ? err.message : err });
    }
  }
  if (result.failed === 0) settled = { month, mode };
  return result;
}
