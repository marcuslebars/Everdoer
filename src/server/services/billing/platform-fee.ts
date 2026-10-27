/**
 * Everdoer's platform fee on money a tenant collects through Everdoer (docs/billing.md →
 * "Platform fee"): quote deposits, invoice payments and service-plan payments. All three are
 * DIRECT charges on the tenant's own Standard connected account, so the fee is Stripe's
 * `application_fee_amount` on the PaymentIntent — the customer pays the same total, the tenant
 * receives it minus Stripe's processing fee minus this fee, and the fee lands in the platform
 * balance. The tenant sees it as an "application fee" line in their own Stripe dashboard.
 *
 *   • Rate: PLATFORM_FEE_BPS (basis points; 100 = 1%). Unset / 0 → no fee anywhere. Capped at
 *     MAX_PLATFORM_FEE_BPS so a typo can't take a third of someone's invoice.
 *   • House tenants (plan `internal`: the A1 brands, boatnames, blairspm) are never charged.
 *   • Per-org override: a feature_flags row `platform_fee_bps` (enabled, limit_value = bps) —
 *     0 waives it (a founding customer), any other value replaces the default for that org.
 *
 * It never blocks a payment: a lookup error means no fee on that charge, logged.
 */
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Feature key an operator sets per org (feature_flags.limit_value = basis points). */
export const PLATFORM_FEE_FEATURE = "platform_fee_bps";
/** Never more than 5% of a charge, whatever the env or a flag says. */
export const MAX_PLATFORM_FEE_BPS = 500;
const EXEMPT_PLANS = new Set(["internal"]);

function clampBps(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_PLATFORM_FEE_BPS);
}

/** The deployment's default rate in basis points (PLATFORM_FEE_BPS), 0 when unset. PURE given env. */
export function defaultPlatformFeeBps(): number {
  const raw = process.env.PLATFORM_FEE_BPS?.trim();
  if (!raw) return 0;
  return clampBps(Number(raw));
}

/** The fee on `amountCents` at `bps`, rounded down to the cent. PURE. */
export function platformFeeCents(amountCents: number, bps: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const fee = Math.floor((amountCents * clampBps(bps)) / 10_000);
  return fee > 0 && fee < amountCents ? fee : 0;
}

/** The rate that applies to this organization (0 = no fee). */
export async function platformFeeBpsFor(admin: AdminClient, organizationId: string): Promise<number> {
  const fallback = defaultPlatformFeeBps();
  const { data: org, error: orgError } = await admin.from("organizations").select("plan").eq("id", organizationId).maybeSingle();
  if (orgError) throw orgError;
  const plan = (org as { plan?: string | null } | null)?.plan ?? null;
  if (plan && EXEMPT_PLANS.has(plan)) return 0;

  const { data: flag, error: flagError } = await admin
    .from("feature_flags")
    .select("enabled, limit_value")
    .eq("organization_id", organizationId)
    .eq("feature", PLATFORM_FEE_FEATURE)
    .maybeSingle();
  if (flagError) throw flagError;
  const override = flag as { enabled: boolean | null; limit_value: number | null } | null;
  if (override?.enabled && typeof override.limit_value === "number") return clampBps(override.limit_value);
  return fallback;
}

/**
 * The application fee for one charge, in cents (0 = send no fee). Fails open: if the plan or
 * flag can't be read the charge goes ahead with no fee rather than not at all.
 */
export async function platformFeeFor(admin: AdminClient, organizationId: string, amountCents: number): Promise<number> {
  // The flag is read even when the deployment default is off: a per-org rate must still apply.
  try {
    return platformFeeCents(amountCents, await platformFeeBpsFor(admin, organizationId));
  } catch (err) {
    console.error("[platform-fee] lookup failed; charging no fee:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** The field to spread into a Checkout session's `payment_intent_data` (nothing when no fee). */
export function feeIntentFields(feeCents: number): { application_fee_amount?: number } {
  return feeCents > 0 ? { application_fee_amount: feeCents } : {};
}

/** Suffix for an idempotency key: a changed fee must mint a new session, never replay the old one. */
export function feeKeySuffix(feeCents: number): string {
  return feeCents > 0 ? `-f${feeCents}` : "";
}
