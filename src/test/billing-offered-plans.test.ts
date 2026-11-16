/**
 * Which plans a business is offered. Launch stopped being sold on 15 Nov 2026: it is left off the
 * billing page's plan cards and refused at the plan checkout, but stays a valid plan for anything
 * already on it (price mapping, gating, the ops cost report).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pricesRetrieve = vi.fn();
vi.mock("@/server/services/billing/stripe", () => ({
  getStripeClient: () => ({ prices: { retrieve: (...a: unknown[]) => pricesRetrieve(...a) } }),
}));

import { OFFERED_PLANS, PURCHASABLE_PLANS, planChoicesFor, planDefault } from "@/server/services/billing/config";
import { planForStripePriceId } from "@/server/services/billing/env";
import { listPlanPricing } from "@/server/services/billing/plans";

beforeEach(() => {
  process.env.STRIPE_PRICE_LAUNCH = "price_launch";
  process.env.STRIPE_PRICE_OPERATE = "price_operate";
  process.env.STRIPE_PRICE_FRONT_DESK = "price_front_desk";
  pricesRetrieve.mockReset();
  pricesRetrieve.mockImplementation(async (id: string) => ({
    id,
    currency: "cad",
    recurring: { interval: "month" },
    unit_amount: { price_launch: 19900, price_operate: 29900, price_front_desk: 49900 }[id],
  }));
});
afterEach(() => {
  delete process.env.STRIPE_PRICE_LAUNCH;
  delete process.env.STRIPE_PRICE_OPERATE;
  delete process.env.STRIPE_PRICE_FRONT_DESK;
});

describe("offered plans", () => {
  it("offers Operate and Front Desk; Launch is purchasable-but-not-offered", () => {
    expect(OFFERED_PLANS).toEqual(["operate", "front_desk"]);
    expect(PURCHASABLE_PLANS).toContain("launch");
  });

  it("an org sees the offered plans, plus its own plan only when that one is no longer sold", () => {
    expect(planChoicesFor("operate")).toEqual(["operate", "front_desk"]);
    expect(planChoicesFor("front_desk")).toEqual(["operate", "front_desk"]);
    expect(planChoicesFor("launch")).toEqual(["launch", "operate", "front_desk"]);
    for (const other of [null, undefined, "", "internal", "none", "enterprise"]) {
      expect(planChoicesFor(other), String(other)).toEqual(["operate", "front_desk"]);
    }
  });

  it("the billing page prices only the plans it is given; with no argument every purchasable plan (ops cost report)", async () => {
    const cards = await listPlanPricing(planChoicesFor("operate"));
    expect(cards.map((c) => [c.plan, c.amountCents, c.available])).toEqual([
      ["operate", 29900, true],
      ["front_desk", 49900, true],
    ]);
    expect(pricesRetrieve).not.toHaveBeenCalledWith("price_launch");

    const all = await listPlanPricing();
    expect(all.map((c) => c.plan)).toEqual(["launch", "operate", "front_desk"]);
  });

  it("Launch still works for anyone on it: its Stripe price maps to the plan and its features are unchanged", () => {
    expect(planForStripePriceId("price_launch")).toBe("launch");
    expect(planDefault("launch", "lead_intake")).toBe(true);
    expect(planDefault("launch", "workflows")).toBe(false);
  });
});
