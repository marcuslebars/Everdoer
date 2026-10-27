/**
 * Which AI staff come switched on with which done-for-you tier (docs/ai-staff.md → "Tiers").
 *
 * Before this, every role defaulted ON for every done-for-you org, so a Catch buyer got the
 * Recruiter, Fleet, Purchasing and Tax Clerk for the same price as Front Desk. With
 * STAFF_TIER_GATING=1 a role's DEFAULT is on only from its tier up, and the roles nobody asked
 * for start off on every tier. An explicit owner choice in Settings still wins either way (this
 * decides defaults, not a lock), and house / standard orgs are unchanged (still default off).
 *
 * Off by default: until the flag is set, and for any done-for-you org with no recorded tier
 * (bought before tiers existed), every role defaults on exactly as before, so merging this
 * changes nobody's staff.
 *
 * Every role reader takes a StaffOrg — `tier` is required, so the compiler finds any caller that
 * forgot it.
 */
import { isDoneForYouTier, type PlanTier } from "@/server/services/done-for-you/config";

/** What a role reader needs to know about the organization. */
export interface StaffOrg {
  /** Done-for-you product line (organizations.platform_brand). */
  doneForYou: boolean;
  /** organizations.crankleads_tier ('catch' | 'close' | 'front_desk'); null for house/standard orgs. */
  tier: string | null;
}

/** A role, or one switch inside a role that defaults separately. */
export type StaffFeature =
  | "office_manager"
  | "importer"
  | "estimator"
  | "estimator.follow_ups"
  | "bookkeeper"
  | "customer_care"
  | "marketer.review_replies"
  | "marketer.win_back"
  | "marketer.google_posts"
  | "dispatcher"
  | "tax_clerk"
  | "porting"
  | "recruiter"
  | "service_plans"
  | "compliance"
  | "purchasing"
  | "email_clerk"
  | "profit_advisor"
  | "fleet";

const RANK: Record<PlanTier, number> = { catch: 1, close: 2, front_desk: 3 };

/** The lowest tier a feature is on by default in; null = off by default on every tier. */
export const STAFF_DEFAULT_TIER: Record<StaffFeature, PlanTier | null> = {
  // Catch: the morning briefing and getting their customer list in.
  office_manager: "catch",
  importer: "catch",
  // Close: chasing the money and the quotes, reviews, after-job check-ins.
  estimator: "close",
  "estimator.follow_ups": "close",
  bookkeeper: "close",
  customer_care: "close",
  "marketer.review_replies": "close",
  // Front Desk: the full office.
  dispatcher: "front_desk",
  tax_clerk: "front_desk",
  // Off until the owner asks (Settings → AI front desk): outbound campaigns, and roles that are
  // either niche or need operator setup.
  "marketer.win_back": null,
  "marketer.google_posts": null,
  porting: null,
  recruiter: null,
  service_plans: null,
  compliance: null,
  purchasing: null,
  email_clerk: null,
  profit_advisor: null,
  fleet: null,
};

/** STAFF_TIER_GATING=1 (or "true") turns the tier table on. Read per call, so tests and ops can flip it. */
export function staffTierGatingOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.STAFF_TIER_GATING?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Is this feature on by default for this org? Done-for-you only. Gating off, or no recorded tier
 * (grandfathered) → on, as before. Otherwise on only from the feature's tier up. PURE apart
 * from the env read.
 */
export function staffDefaultOn(feature: StaffFeature, org: StaffOrg): boolean {
  if (!org.doneForYou) return false;
  if (!staffTierGatingOn() || !isDoneForYouTier(org.tier)) return true;
  const min = STAFF_DEFAULT_TIER[feature];
  return min !== null && RANK[org.tier] >= RANK[min];
}

/** The tier as stored on organizations (anything else → null). PURE. */
export function tierOf(value: unknown): string | null {
  return isDoneForYouTier(value) ? value : null;
}

/** The tier off an organizations row of any shape (null when missing or not a tier). PURE. */
export function orgTier(org: unknown): string | null {
  return org && typeof org === "object" ? tierOf((org as { crankleads_tier?: unknown }).crankleads_tier) : null;
}

/** What the role loaders read off an organizations row (platform_brand + crankleads_tier). */
export const ORG_STAFF_COLUMNS = "platform_brand, crankleads_tier";
