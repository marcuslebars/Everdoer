/**
 * PURE: which lifecycle messages are due for one account (docs/lifecycle-emails.md). No I/O, no
 * clock — `nowMs` is passed in. Golden-tested in src/test/lifecycle-rules.test.ts.
 *
 * Customer emails ("Marcus at Everdoer"), for everdoer.com purchases only:
 *   trial_results  trialing, live, ≥ 5 days since purchase, ≥ 3 days before the trial ends
 *   trial_ending   trialing, from 4 days to 6 hours before the trial ends
 *   paid_welcome   active again after a trial we emailed about (trial_ending was sent)
 *   cancelled      canceled within the last 14 days
 * At most ONE customer email per pass; a later stage supersedes an earlier one that is no longer
 * useful (never "your trial ends soon" after it ended).
 *
 * Operator texts (to EVERDOER_OPERATOR_PHONE), for every non-internal account:
 *   op_signup      any new account (purchase or app sign-up)
 *   op_live        the purchase went live
 *   op_converted   same moment as paid_welcome
 *   op_cancelled   same moment as cancelled
 *
 * Nothing goes to accounts created before LIFECYCLE_START (so turning this on never mails or
 * texts about old accounts), and nothing to `internal` (house) accounts.
 */

export const LIFECYCLE_CUSTOMER_KEYS = ["trial_results", "trial_ending", "paid_welcome", "cancelled"] as const;
export const LIFECYCLE_OPERATOR_KEYS = ["op_signup", "op_live", "op_converted", "op_cancelled"] as const;
export type LifecycleCustomerKey = (typeof LIFECYCLE_CUSTOMER_KEYS)[number];
export type LifecycleOperatorKey = (typeof LIFECYCLE_OPERATOR_KEYS)[number];
export type LifecycleKey = LifecycleCustomerKey | LifecycleOperatorKey;

/** Accounts created before this are never messaged (the day this shipped, Toronto midnight). */
export const LIFECYCLE_START_MS = Date.parse("2026-11-19T05:00:00Z");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const TRIAL_RESULTS_AFTER_PURCHASE_MS = 5 * DAY;
export const TRIAL_RESULTS_LAST_BEFORE_END_MS = 3 * DAY;
export const TRIAL_ENDING_FROM_MS = 4 * DAY;
export const TRIAL_ENDING_UNTIL_MS = 6 * HOUR;
export const CANCELLED_RECENT_MS = 14 * DAY;
export const SIGNUP_SETTLE_MS = 2 * 60_000;

/** Customer emails go out 08:00–20:00 in the company's timezone, any day. */
export const CUSTOMER_WINDOW = { startHour: 8, endHour: 20 } as const;
/** Operator texts go out 07:00–22:00 Toronto, any day (a 3 a.m. signup waits until morning). */
export const OPERATOR_WINDOW = { startHour: 7, endHour: 22 } as const;

export interface LifecycleFacts {
  createdAtMs: number;
  /** organizations.plan — "internal" accounts are never messaged. */
  plan: string | null;
  /** organizations.subscription_status. */
  status: string | null;
  /** When the trial ends (the trialing subscription's period end, else organizations.trial_ends_at). */
  trialEndsAtMs: number | null;
  /** When the subscription last changed (subscriptions.updated_at), for "cancelled recently". */
  subscriptionUpdatedAtMs: number | null;
  /** The everdoer.com purchase behind the account, if any. */
  purchase: { createdAtMs: number; liveAtMs: number | null; hasOwnerEmail: boolean } | null;
  sent: ReadonlySet<LifecycleKey>;
}

export interface LifecycleDue {
  customer: LifecycleCustomerKey | null;
  operator: LifecycleOperatorKey[];
}

function eligible(f: LifecycleFacts): boolean {
  return f.createdAtMs >= LIFECYCLE_START_MS && f.plan !== "internal";
}

function cancelledRecently(f: LifecycleFacts, nowMs: number): boolean {
  if (f.status !== "canceled") return false;
  const changed = f.subscriptionUpdatedAtMs ?? f.createdAtMs;
  return nowMs - changed <= CANCELLED_RECENT_MS;
}

function converted(f: LifecycleFacts): boolean {
  return f.status === "active" && f.sent.has("trial_ending");
}

/** The one customer email due now, if any (ignores the time-of-day window). */
export function customerEmailDue(f: LifecycleFacts, nowMs: number): LifecycleCustomerKey | null {
  if (!eligible(f) || !f.purchase || !f.purchase.hasOwnerEmail) return null;
  // Latest stage first: each one makes the earlier ones moot.
  if (cancelledRecently(f, nowMs)) return f.sent.has("cancelled") ? null : "cancelled";
  if (f.status === "canceled") return null;
  if (converted(f)) return f.sent.has("paid_welcome") ? null : "paid_welcome";
  if (f.status !== "trialing" || f.trialEndsAtMs === null) return null;
  const untilEnd = f.trialEndsAtMs - nowMs;
  if (untilEnd <= TRIAL_ENDING_FROM_MS) {
    return untilEnd > TRIAL_ENDING_UNTIL_MS && !f.sent.has("trial_ending") ? "trial_ending" : null;
  }
  const liveAt = f.purchase.liveAtMs;
  if (
    liveAt !== null &&
    nowMs - f.purchase.createdAtMs >= TRIAL_RESULTS_AFTER_PURCHASE_MS &&
    untilEnd > TRIAL_RESULTS_LAST_BEFORE_END_MS &&
    !f.sent.has("trial_results")
  ) {
    return "trial_results";
  }
  return null;
}

/** Operator texts due now, oldest event first (ignores the time-of-day window). */
export function operatorTextsDue(f: LifecycleFacts, nowMs: number): LifecycleOperatorKey[] {
  if (!eligible(f)) return [];
  const due: LifecycleOperatorKey[] = [];
  // Wait a moment after the account appears, so provisioning has linked the purchase (the text
  // then names the plan rather than reading as an app sign-up).
  if (!f.sent.has("op_signup") && nowMs - f.createdAtMs >= SIGNUP_SETTLE_MS) due.push("op_signup");
  if (f.purchase?.liveAtMs != null && !f.sent.has("op_live")) due.push("op_live");
  if (converted(f) && !f.sent.has("op_converted")) due.push("op_converted");
  if (cancelledRecently(f, nowMs) && !f.sent.has("op_cancelled")) due.push("op_cancelled");
  return due;
}

/** Hour of `ms` in `timeZone` (0–23); an invalid zone reads as Toronto. */
export function localHour(timeZone: string, ms: number): number {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(new Date(ms));
  let text: string;
  try {
    text = fmt(timeZone);
  } catch {
    text = fmt("America/Toronto");
  }
  return Number(text) % 24;
}

export function inWindow(window: { startHour: number; endHour: number }, timeZone: string, nowMs: number): boolean {
  const hour = localHour(timeZone, nowMs);
  return hour >= window.startHour && hour < window.endHour;
}

/** Everything due now, with the time-of-day windows applied. */
export function lifecycleDue(f: LifecycleFacts, nowMs: number, timeZone: string): LifecycleDue {
  return {
    customer: inWindow(CUSTOMER_WINDOW, timeZone, nowMs) ? customerEmailDue(f, nowMs) : null,
    operator: inWindow(OPERATOR_WINDOW, "America/Toronto", nowMs) ? operatorTextsDue(f, nowMs) : [],
  };
}
