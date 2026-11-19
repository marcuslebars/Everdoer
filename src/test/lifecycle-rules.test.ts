import { describe, expect, it } from "vitest";

import {
  customerEmailDue,
  lifecycleDue,
  LIFECYCLE_START_MS,
  operatorTextsDue,
  type LifecycleFacts,
  type LifecycleKey,
} from "@/server/services/lifecycle/rules";

const H = 3_600_000;
const D = 24 * H;
const T0 = LIFECYCLE_START_MS + 2 * D; // purchase / account creation

function facts(over: Partial<LifecycleFacts> = {}, sent: LifecycleKey[] = []): LifecycleFacts {
  return {
    createdAtMs: T0,
    plan: "operate",
    status: "trialing",
    trialEndsAtMs: T0 + 14 * D,
    subscriptionUpdatedAtMs: T0,
    purchase: { createdAtMs: T0, liveAtMs: T0 + D, hasOwnerEmail: true },
    sent: new Set(sent),
    ...over,
  };
}

describe("customer emails", () => {
  it("nothing in the first five days", () => {
    expect(customerEmailDue(facts(), T0 + 4 * D)).toBeNull();
  });

  it("trial_results on day 5 when live", () => {
    expect(customerEmailDue(facts(), T0 + 5 * D)).toBe("trial_results");
    expect(customerEmailDue(facts({}, ["trial_results"]), T0 + 5 * D)).toBeNull();
  });

  it("no trial_results when not live (the setup reminders handle that)", () => {
    expect(customerEmailDue(facts({ purchase: { createdAtMs: T0, liveAtMs: null, hasOwnerEmail: true } }), T0 + 6 * D)).toBeNull();
  });

  it("trial_ending from 4 days before the end, never after it", () => {
    expect(customerEmailDue(facts({}, ["trial_results"]), T0 + 10 * D)).toBe("trial_ending");
    // A missed trial_results is superseded, not sent late.
    expect(customerEmailDue(facts(), T0 + 11 * D)).toBe("trial_ending");
    expect(customerEmailDue(facts(), T0 + 14 * D - 5 * H)).toBeNull();
    expect(customerEmailDue(facts({}, ["trial_ending"]), T0 + 12 * D)).toBeNull();
  });

  it("paid_welcome once active after a trial we emailed about", () => {
    expect(customerEmailDue(facts({ status: "active" }, ["trial_ending"]), T0 + 15 * D)).toBe("paid_welcome");
    expect(customerEmailDue(facts({ status: "active" }, ["trial_ending", "paid_welcome"]), T0 + 15 * D)).toBeNull();
    // Active without a trial we tracked: nothing (the welcome email at purchase covers it).
    expect(customerEmailDue(facts({ status: "active" }), T0 + 15 * D)).toBeNull();
  });

  it("cancelled: once, only if recent", () => {
    const now = T0 + 8 * D;
    expect(customerEmailDue(facts({ status: "canceled", subscriptionUpdatedAtMs: now - D }), now)).toBe("cancelled");
    expect(customerEmailDue(facts({ status: "canceled", subscriptionUpdatedAtMs: now - D }, ["cancelled"]), now)).toBeNull();
    expect(customerEmailDue(facts({ status: "canceled", subscriptionUpdatedAtMs: now - 20 * D }), now)).toBeNull();
  });

  it("never for accounts before the start date, internal accounts, or app sign-ups", () => {
    expect(customerEmailDue(facts({ createdAtMs: LIFECYCLE_START_MS - 1 }), T0 + 5 * D)).toBeNull();
    expect(customerEmailDue(facts({ plan: "internal" }), T0 + 5 * D)).toBeNull();
    expect(customerEmailDue(facts({ purchase: null }), T0 + 5 * D)).toBeNull();
    expect(customerEmailDue(facts({ purchase: { createdAtMs: T0, liveAtMs: T0, hasOwnerEmail: false } }), T0 + 5 * D)).toBeNull();
  });
});

describe("operator texts", () => {
  it("signup after a short settle, then live", () => {
    expect(operatorTextsDue(facts({ purchase: { createdAtMs: T0, liveAtMs: null, hasOwnerEmail: true } }), T0 + 30_000)).toEqual([]);
    expect(operatorTextsDue(facts({ purchase: { createdAtMs: T0, liveAtMs: null, hasOwnerEmail: true } }), T0 + 3 * 60_000)).toEqual(["op_signup"]);
    expect(operatorTextsDue(facts({}, ["op_signup"]), T0 + 2 * D)).toEqual(["op_live"]);
  });

  it("an app sign-up (no purchase) gets the signup text only", () => {
    expect(operatorTextsDue(facts({ purchase: null }), T0 + D)).toEqual(["op_signup"]);
  });

  it("converted and cancelled", () => {
    expect(operatorTextsDue(facts({ status: "active" }, ["op_signup", "op_live", "trial_ending"]), T0 + 15 * D)).toEqual(["op_converted"]);
    const now = T0 + 9 * D;
    expect(operatorTextsDue(facts({ status: "canceled", subscriptionUpdatedAtMs: now }, ["op_signup", "op_live"]), now)).toEqual(["op_cancelled"]);
  });

  it("nothing for old or internal accounts", () => {
    expect(operatorTextsDue(facts({ createdAtMs: LIFECYCLE_START_MS - D }), T0)).toEqual([]);
    expect(operatorTextsDue(facts({ plan: "internal" }), T0 + D)).toEqual([]);
  });
});

describe("time windows", () => {
  // 2026-11-25 is a Wednesday; Toronto is UTC-5 in November.
  const at = (hourToronto: number) => Date.parse(`2026-11-25T${String(hourToronto + 5).padStart(2, "0")}:00:00Z`);

  it("customer emails 08:00–20:00 local, operator texts 07:00–22:00 Toronto", () => {
    const f = facts({ trialEndsAtMs: at(10) + 30 * D, purchase: { createdAtMs: at(10) - 6 * D, liveAtMs: at(10) - 5 * D, hasOwnerEmail: true } });
    expect(lifecycleDue(f, at(10), "America/Toronto")).toEqual({ customer: "trial_results", operator: ["op_signup", "op_live"] });
    expect(lifecycleDue(f, at(7), "America/Toronto")).toEqual({ customer: null, operator: ["op_signup", "op_live"] });
    expect(lifecycleDue(f, at(6), "America/Toronto").operator).toEqual([]);
    // A Vancouver company at 07:00 Toronto is 04:00 local: no email yet.
    expect(lifecycleDue(f, at(9), "America/Vancouver").customer).toBeNull();
  });
});
