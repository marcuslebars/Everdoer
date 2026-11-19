// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): lifecycle emails + operator texts (docs/lifecycle-emails.md).
// Runs inside the workflow-event worker's scheduler pass (runScheduler) with the worker's admin
// client — a scheduler pass has no user session. Cross-tenant by design: it looks at accounts
// created since LIFECYCLE_START, reads each one's OWN purchase / subscription / company rows
// (every query filtered by that organization_id), emails only that account's owner (the purchase's
// owner_email) and texts only the operator (EVERDOER_OPERATOR_PHONE). Writes only lifecycle_sends.
// Listed in docs/EVERDOER_RUNBOOK.md.
// ─────────────────────────────────────────────────────────────────────────────
import { sendEmail as defaultSendEmail, isEmailSendConfigured, type SendEmailInput } from "@/server/outbound/email";
import { platformNumber } from "@/server/outbound/platform-number";
import { sendSms as defaultSendSms, isSmsSendConfigured, type SendSmsInput } from "@/server/outbound/sms";
import { getStripeClient } from "@/server/services/billing/stripe";
import { isDoneForYouTier, PLAN_TIER_LABELS } from "@/server/services/done-for-you/config";
import type { AdminClient } from "@/server/services/done-for-you/purchases";
import { computeScorecardMetrics, fetchScorecardInputs } from "@/server/services/monthly-scorecard/metrics";
import { platformOperatorEmail } from "@/server/services/operator-email";
import { appBaseUrlFor } from "@/server/services/platform-brand";
import { toE164 } from "@/server/services/retell/payload";
import type { TenantServiceContext } from "@/server/services/shared";

import { LIFECYCLE_FROM_NAME, renderLifecycleEmail, renderOperatorText, type LifecycleResults } from "./messages";
import {
  LIFECYCLE_START_MS,
  lifecycleDue,
  type LifecycleCustomerKey,
  type LifecycleFacts,
  type LifecycleKey,
  type LifecycleOperatorKey,
} from "./rules";

/** The scheduler looks every 5 minutes (it ticks every minute). */
export const LIFECYCLE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_TZ = "America/Toronto";

export interface LifecycleConfig {
  enabled: boolean;
  /** EVERDOER_OPERATOR_PHONE (E.164), or null: no operator texts. */
  operatorPhone: string | null;
  /** Where replies to the customer emails go (EVERDOER_OPERATOR_EMAIL). */
  replyTo: string | null;
  /** Stripe Tax is on (STRIPE_AUTOMATIC_TAX). */
  taxed: boolean;
}

const OFF = new Set(["false", "0", "off", "no"]);

export function readLifecycleConfig(env: Record<string, string | undefined> = process.env): LifecycleConfig {
  return {
    enabled: !OFF.has((env.LIFECYCLE_ENABLED ?? "").trim().toLowerCase()),
    operatorPhone: toE164(env.EVERDOER_OPERATOR_PHONE?.trim() || null) ?? null,
    replyTo: platformOperatorEmail(env),
    taxed: ["true", "1", "on", "yes"].includes((env.STRIPE_AUTOMATIC_TAX ?? "").trim().toLowerCase()),
  };
}

export interface LifecycleDeps {
  sendEmail: (input: SendEmailInput) => Promise<unknown>;
  sendSms: (input: SendSmsInput) => Promise<unknown>;
  emailConfigured: () => boolean;
  smsConfigured: () => boolean;
  /** Results since `fromIso` for the company (scorecard metrics); null when they can't be read. */
  loadResults: (ctx: TenantServiceContext, companyId: string, fromIso: string, toIso: string) => Promise<LifecycleResults | null>;
  /** The trialing subscription's first invoice total + monthly price, formatted; nulls when unknown. */
  loadPrices: (stripeSubscriptionId: string) => Promise<{ firstCharge: string | null; monthlyPrice: string | null }>;
}

function formatMoney(cents: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof cents !== "number" || !currency) return null;
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return null;
  }
}

async function defaultLoadResults(ctx: TenantServiceContext, companyId: string, fromIso: string, toIso: string): Promise<LifecycleResults | null> {
  try {
    const range = { from: fromIso, to: toIso };
    const m = computeScorecardMetrics(await fetchScorecardInputs(ctx, companyId, range), range);
    return {
      missedCallsCaught: m.missedCalls.caught,
      callsAnswered: m.receptionist.callsHandled,
      textsSent: m.messages.sms,
      leads: m.leads.total,
      jobsBooked: m.jobsBooked,
    };
  } catch (err) {
    console.error("[lifecycle] results unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function defaultLoadPrices(subscriptionId: string): Promise<{ firstCharge: string | null; monthlyPrice: string | null }> {
  const stripe = getStripeClient();
  let firstCharge: string | null = null;
  let monthlyPrice: string | null = null;
  try {
    const preview = await stripe.invoices.createPreview({ subscription: subscriptionId });
    firstCharge = formatMoney(preview.amount_due, preview.currency);
  } catch (err) {
    console.error("[lifecycle] invoice preview failed:", err instanceof Error ? err.message : err);
  }
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const price = sub.items.data.find((item) => item.price.recurring)?.price;
    monthlyPrice = formatMoney(price?.unit_amount ?? null, price?.currency ?? null);
  } catch (err) {
    console.error("[lifecycle] subscription read failed:", err instanceof Error ? err.message : err);
  }
  return { firstCharge, monthlyPrice };
}

const defaultDeps: LifecycleDeps = {
  sendEmail: defaultSendEmail,
  sendSms: defaultSendSms,
  emailConfigured: isEmailSendConfigured,
  smsConfigured: isSmsSendConfigured,
  loadResults: defaultLoadResults,
  loadPrices: defaultLoadPrices,
};

// ── Loading ──────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  created_at: string;
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  platform_brand: string | null;
  billing_email: string | null;
}
interface PurchaseRow {
  organization_id: string;
  company_id: string | null;
  tier: string | null;
  business_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  created_at: string;
  live_at: string | null;
  stripe_subscription_id: string | null;
}
interface SubscriptionRow {
  organization_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
  updated_at: string | null;
}

export interface LifecycleAccount {
  org: OrgRow;
  purchase: PurchaseRow | null;
  subscription: SubscriptionRow | null;
  timeZone: string;
  sent: Set<LifecycleKey>;
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : null;
};

export function factsFor(account: LifecycleAccount): LifecycleFacts {
  const { org, purchase, subscription } = account;
  const status = org.subscription_status;
  const trialEnd =
    status === "trialing" ? (subscription?.status === "trialing" ? ms(subscription.current_period_end) : null) ?? ms(org.trial_ends_at) : null;
  return {
    createdAtMs: ms(org.created_at) ?? 0,
    plan: org.plan,
    status,
    trialEndsAtMs: trialEnd,
    subscriptionUpdatedAtMs: ms(subscription?.updated_at),
    purchase: purchase
      ? { createdAtMs: ms(purchase.created_at) ?? 0, liveAtMs: ms(purchase.live_at), hasOwnerEmail: Boolean(purchase.owner_email?.trim()) }
      : null,
    sent: account.sent,
  };
}

async function loadAccounts(admin: AdminClient): Promise<LifecycleAccount[]> {
  const db = admin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: orgs, error } = await db
    .from("organizations")
    .select("id, name, created_at, plan, subscription_status, trial_ends_at, platform_brand, billing_email")
    .gte("created_at", new Date(LIFECYCLE_START_MS).toISOString())
    .neq("plan", "internal")
    .limit(500);
  if (error) throw new Error(`lifecycle: organizations read failed: ${error.message}`);
  const orgRows = (orgs ?? []) as OrgRow[];
  if (!orgRows.length) return [];
  const ids = orgRows.map((o) => o.id);

  const [purchases, subs, sends] = await Promise.all([
    db
      .from("crankleads_purchases")
      .select("organization_id, company_id, tier, business_name, owner_name, owner_email, owner_phone, created_at, live_at, stripe_subscription_id")
      .in("organization_id", ids)
      .order("created_at", { ascending: false }),
    db.from("subscriptions").select("organization_id, stripe_subscription_id, status, current_period_end, updated_at").in("organization_id", ids).order("updated_at", { ascending: false }),
    db.from("lifecycle_sends").select("organization_id, key").in("organization_id", ids),
  ]);
  for (const r of [purchases, subs, sends]) if (r.error) throw new Error(`lifecycle: read failed: ${r.error.message}`);

  const firstBy = <T extends { organization_id: string }>(rows: T[]): Map<string, T> => {
    const map = new Map<string, T>();
    for (const row of rows) if (!map.has(row.organization_id)) map.set(row.organization_id, row);
    return map;
  };
  const purchaseBy = firstBy((purchases.data ?? []) as PurchaseRow[]);
  const subBy = firstBy((subs.data ?? []) as SubscriptionRow[]);
  const sentBy = new Map<string, Set<LifecycleKey>>();
  for (const row of (sends.data ?? []) as Array<{ organization_id: string; key: LifecycleKey }>) {
    const set = sentBy.get(row.organization_id) ?? new Set<LifecycleKey>();
    set.add(row.key);
    sentBy.set(row.organization_id, set);
  }

  const companyIds = [...purchaseBy.values()].map((p) => p.company_id).filter((id): id is string => Boolean(id));
  const tzBy = new Map<string, string>();
  if (companyIds.length) {
    const { data: companies } = await db.from("companies").select("id, timezone").in("id", companyIds);
    for (const c of (companies ?? []) as Array<{ id: string; timezone: string | null }>) if (c.timezone) tzBy.set(c.id, c.timezone);
  }

  return orgRows.map((org) => {
    const purchase = purchaseBy.get(org.id) ?? null;
    return {
      org,
      purchase,
      subscription: subBy.get(org.id) ?? null,
      timeZone: (purchase?.company_id && tzBy.get(purchase.company_id)) || DEFAULT_TZ,
      sent: sentBy.get(org.id) ?? new Set<LifecycleKey>(),
    };
  });
}

// ── Claim + send ─────────────────────────────────────────────────────────────

/** Insert the send-log row first; false when another run already claimed this message. */
async function claim(admin: AdminClient, organizationId: string, key: LifecycleKey, channel: "email" | "sms", recipient: string): Promise<boolean> {
  const db = admin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { error } = await db.from("lifecycle_sends").insert({ organization_id: organizationId, key, channel, recipient, status: "claimed" });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`lifecycle: claim failed: ${error.message}`);
}

async function record(admin: AdminClient, organizationId: string, key: LifecycleKey, status: string, error: string | null): Promise<void> {
  const db = admin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { error: writeError } = await db.from("lifecycle_sends").update({ status, error }).eq("organization_id", organizationId).eq("key", key);
  if (writeError) console.error(`[lifecycle] status write failed for ${organizationId}/${key}: ${writeError.message}`);
}

function tierLabel(tier: string | null | undefined): string | null {
  return tier && isDoneForYouTier(tier) ? PLAN_TIER_LABELS[tier] : null;
}

export interface LifecycleOutcome {
  organizationId: string;
  key: LifecycleKey;
  status: "sent" | "failed" | "skipped";
  detail?: string;
}

async function sendCustomerEmail(
  admin: AdminClient,
  account: LifecycleAccount,
  key: LifecycleCustomerKey,
  nowMs: number,
  config: LifecycleConfig,
  deps: LifecycleDeps,
): Promise<LifecycleOutcome> {
  const { org, purchase } = account;
  const to = purchase?.owner_email?.trim();
  if (!purchase || !to) return { organizationId: org.id, key, status: "skipped", detail: "no_owner_email" };
  if (!(await claim(admin, org.id, key, "email", to))) return { organizationId: org.id, key, status: "skipped", detail: "already_claimed" };

  const ctx: TenantServiceContext = { organizationId: org.id, actorProfileId: null, supabase: admin as never };
  const facts = factsFor(account);
  const results =
    key !== "cancelled" && purchase.company_id
      ? await deps.loadResults(ctx, purchase.company_id, purchase.live_at ?? purchase.created_at, new Date(nowMs).toISOString())
      : null;
  const prices =
    key === "trial_ending" && purchase.stripe_subscription_id
      ? await deps.loadPrices(purchase.stripe_subscription_id).catch(() => ({ firstCharge: null, monthlyPrice: null }))
      : { firstCharge: null, monthlyPrice: null };
  const email = renderLifecycleEmail(key, {
    ownerName: purchase.owner_name,
    businessName: purchase.business_name?.trim() || org.name,
    appUrl: appBaseUrlFor(org.platform_brand as never),
    timeZone: account.timeZone,
    results,
    trialEndsAtMs: facts.trialEndsAtMs,
    firstCharge: prices.firstCharge,
    monthlyPrice: prices.monthlyPrice,
    taxed: config.taxed,
  });
  try {
    await deps.sendEmail({
      to,
      subject: email.subject,
      body: email.body,
      html: email.html,
      fromName: LIFECYCLE_FROM_NAME,
      fromAddress: null,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });
    await record(admin, org.id, key, "sent", null);
    return { organizationId: org.id, key, status: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lifecycle] ${key} email to ${org.id} failed: ${message}`);
    await record(admin, org.id, key, "failed", message.slice(0, 500));
    return { organizationId: org.id, key, status: "failed", detail: message };
  }
}

async function sendOperatorText(
  admin: AdminClient,
  account: LifecycleAccount,
  key: LifecycleOperatorKey,
  config: LifecycleConfig,
  deps: LifecycleDeps,
): Promise<LifecycleOutcome> {
  const { org, purchase } = account;
  const to = config.operatorPhone;
  if (!to) return { organizationId: org.id, key, status: "skipped", detail: "no_operator_phone" };
  if (!(await claim(admin, org.id, key, "sms", to))) return { organizationId: org.id, key, status: "skipped", detail: "already_claimed" };
  const body = renderOperatorText(key, {
    businessName: purchase?.business_name?.trim() || org.name,
    tierLabel: tierLabel(purchase?.tier),
    ownerName: purchase?.owner_name ?? null,
    ownerPhone: purchase?.owner_phone ?? null,
    ownerEmail: purchase?.owner_email ?? org.billing_email ?? null,
  });
  try {
    await deps.sendSms({ to, body, from: platformNumber() ?? undefined });
    await record(admin, org.id, key, "sent", null);
    return { organizationId: org.id, key, status: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lifecycle] ${key} text for ${org.id} failed: ${message}`);
    await record(admin, org.id, key, "failed", message.slice(0, 500));
    return { organizationId: org.id, key, status: "failed", detail: message };
  }
}

/** One lifecycle pass over every account created since LIFECYCLE_START. */
export async function runLifecyclePass(
  admin: AdminClient,
  nowMs: number = Date.now(),
  config: LifecycleConfig = readLifecycleConfig(),
  deps: LifecycleDeps = defaultDeps,
): Promise<LifecycleOutcome[]> {
  if (!config.enabled) return [];
  const accounts = await loadAccounts(admin);
  const outcomes: LifecycleOutcome[] = [];
  const canEmail = deps.emailConfigured();
  const canText = Boolean(config.operatorPhone) && deps.smsConfigured();
  for (const account of accounts) {
    try {
      const due = lifecycleDue(factsFor(account), nowMs, account.timeZone);
      if (canText) for (const key of due.operator) outcomes.push(await sendOperatorText(admin, account, key, config, deps));
      if (canEmail && due.customer) outcomes.push(await sendCustomerEmail(admin, account, due.customer, nowMs, config, deps));
    } catch (err) {
      console.error(`[lifecycle] account ${account.org.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return outcomes;
}

let lastRunMs = 0;

/** Scheduler hook: at most every LIFECYCLE_INTERVAL_MS. */
export async function processLifecycle(admin: AdminClient, nowMs: number = Date.now()): Promise<number> {
  if (nowMs - lastRunMs < LIFECYCLE_INTERVAL_MS) return 0;
  lastRunMs = nowMs;
  const outcomes = await runLifecyclePass(admin, nowMs);
  return outcomes.filter((o) => o.status === "sent").length;
}

export function resetLifecycleThrottle(): void {
  lastRunMs = 0;
}
