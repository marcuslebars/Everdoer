import { afterEach, describe, expect, it } from "vitest";

import { createFakeDb } from "@/test/helpers/fake-supabase";
import {
  defaultPlatformFeeBps,
  feeIntentFields,
  feeKeySuffix,
  MAX_PLATFORM_FEE_BPS,
  platformFeeBpsFor,
  platformFeeCents,
  platformFeeFor,
} from "@/server/services/billing/platform-fee";

// Everdoer's fee on money a tenant collects (billing/platform-fee.ts): off unless configured,
// never on house tenants, per-org override, capped, and it never blocks a payment.

afterEach(() => {
  delete process.env.PLATFORM_FEE_BPS;
});

const db = (plan: string | null, flag?: { enabled: boolean; limit_value: number | null }) =>
  createFakeDb({
    organizations: [{ id: "org-1", plan }],
    feature_flags: flag ? [{ organization_id: "org-1", feature: "platform_fee_bps", ...flag }] : [],
  }).client;

describe("platformFeeCents / defaultPlatformFeeBps", () => {
  it("rounds down to the cent, 0 for nothing", () => {
    expect(platformFeeCents(169_500, 100)).toBe(1695); // 1% of $1,695.00
    expect(platformFeeCents(9_999, 100)).toBe(99);
    expect(platformFeeCents(50, 100)).toBe(0); // under a cent
    expect(platformFeeCents(0, 100)).toBe(0);
    expect(platformFeeCents(10_000, 0)).toBe(0);
  });

  it("is off by default and capped", () => {
    expect(defaultPlatformFeeBps()).toBe(0);
    process.env.PLATFORM_FEE_BPS = "100";
    expect(defaultPlatformFeeBps()).toBe(100);
    process.env.PLATFORM_FEE_BPS = "3000"; // a typo for 30.00%
    expect(defaultPlatformFeeBps()).toBe(MAX_PLATFORM_FEE_BPS);
    process.env.PLATFORM_FEE_BPS = "nonsense";
    expect(defaultPlatformFeeBps()).toBe(0);
    expect(platformFeeCents(10_000, 9_000)).toBe(500);
  });

  it("feeIntentFields / feeKeySuffix send nothing when there's no fee", () => {
    expect(feeIntentFields(0)).toEqual({});
    expect(feeIntentFields(1695)).toEqual({ application_fee_amount: 1695 });
    expect(feeKeySuffix(0)).toBe("");
    expect(feeKeySuffix(1695)).toBe("-f1695");
  });
});

describe("platformFeeBpsFor / platformFeeFor", () => {
  it("charges a paying tenant the deployment rate", async () => {
    process.env.PLATFORM_FEE_BPS = "100";
    expect(await platformFeeBpsFor(db("operate"), "org-1")).toBe(100);
    expect(await platformFeeFor(db("front_desk"), "org-1", 20_000)).toBe(200);
  });

  it("never charges a house tenant", async () => {
    process.env.PLATFORM_FEE_BPS = "100";
    expect(await platformFeeFor(db("internal"), "org-1", 20_000)).toBe(0);
    expect(await platformFeeFor(db("internal", { enabled: true, limit_value: 200 }), "org-1", 20_000)).toBe(0);
  });

  it("a per-org flag waives it, replaces it, or turns it on with the default off", async () => {
    process.env.PLATFORM_FEE_BPS = "100";
    expect(await platformFeeFor(db("operate", { enabled: true, limit_value: 0 }), "org-1", 20_000)).toBe(0);
    expect(await platformFeeFor(db("operate", { enabled: true, limit_value: 50 }), "org-1", 20_000)).toBe(100);
    expect(await platformFeeFor(db("operate", { enabled: false, limit_value: 0 }), "org-1", 20_000)).toBe(200); // disabled flag ignored
    delete process.env.PLATFORM_FEE_BPS;
    expect(await platformFeeFor(db("operate"), "org-1", 20_000)).toBe(0);
    expect(await platformFeeFor(db("operate", { enabled: true, limit_value: 100 }), "org-1", 20_000)).toBe(200);
  });

  it("a lookup error means no fee, not a failed payment", async () => {
    process.env.PLATFORM_FEE_BPS = "100";
    const fake = createFakeDb({ organizations: [{ id: "org-1", plan: "operate" }], feature_flags: [] });
    fake.failNext("organizations", "select");
    expect(await platformFeeFor(fake.client, "org-1", 20_000)).toBe(0);
  });
});
