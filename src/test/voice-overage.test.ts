import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billableMinutes,
  billsVoiceOverage,
  closedMonth,
  computeVoiceOverages,
  overageAnswerMinutes,
  overageHeadroomMinutes,
  previousMonth,
  processVoiceOverage,
  resetVoiceOverageMemo,
  voiceOverageMode,
} from "@/server/services/billing/voice-overage";
import { decideCallAnswering, type AiAnswerConfig } from "@/server/services/voice/ai-answer";
import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

const FD_ORG = "00000000-0000-4000-8000-00000000f001";
const CLOSE_ORG = "00000000-0000-4000-8000-00000000f002";
const HOUSE_ORG = "00000000-0000-4000-8000-00000000f003";
const NOCUS_ORG = "00000000-0000-4000-8000-00000000f004";
const UNDER_ORG = "00000000-0000-4000-8000-00000000f005";
const FD_CO_1 = "00000000-0000-4000-8000-00000000c001";
const FD_CO_2 = "00000000-0000-4000-8000-00000000c002";
const CLOSE_CO_A = "00000000-0000-4000-8000-00000000c003";
const CLOSE_CO_B = "00000000-0000-4000-8000-00000000c004";
const HOUSE_CO = "00000000-0000-4000-8000-00000000c005";
const NOCUS_CO = "00000000-0000-4000-8000-00000000c006";
const UNDER_CO = "00000000-0000-4000-8000-00000000c007";

const SEPT = "2026-09-01";
/** 07:00 Toronto on Oct 1: September has closed. */
const OCT_1_MORNING = Date.parse("2026-10-01T11:00:00Z");
const PRICE = "price_overage_test";

const CHARGE_ENV = { VOICE_OVERAGE_BILLING: "charge", STRIPE_PRICE_VOICE_OVERAGE: PRICE };
const RECORD_ENV = { VOICE_OVERAGE_BILLING: "record" };

function usage(org: string, company: string | null, quantity: number, month = SEPT) {
  return { organization_id: org, company_id: company, month, kind: "voice_minutes", quantity, cost_cents: 0 };
}

function seed(): FakeDb {
  return createFakeDb(
    {
      organizations: [
        { id: FD_ORG, plan: "front_desk", crankleads_tier: "front_desk", platform_brand: "crankleads", stripe_customer_id: "cus_fd", subscription_status: "active" },
        { id: CLOSE_ORG, plan: "operate", crankleads_tier: "close", platform_brand: "crankleads", stripe_customer_id: "cus_close", subscription_status: "active" },
        { id: HOUSE_ORG, plan: "internal", crankleads_tier: null, platform_brand: "empirevu", stripe_customer_id: null, subscription_status: "active" },
        { id: NOCUS_ORG, plan: "operate", crankleads_tier: "catch", platform_brand: "crankleads", stripe_customer_id: null, subscription_status: "active" },
        { id: UNDER_ORG, plan: "operate", crankleads_tier: "catch", platform_brand: "crankleads", stripe_customer_id: "cus_under", subscription_status: "active" },
      ],
      companies: [
        { id: FD_CO_1, organization_id: FD_ORG, ai_settings: {} },
        { id: FD_CO_2, organization_id: FD_ORG, ai_settings: {} },
        { id: CLOSE_CO_A, organization_id: CLOSE_ORG, ai_settings: {} },
        { id: CLOSE_CO_B, organization_id: CLOSE_ORG, ai_settings: { call_answering: { included_minutes: 50 } } },
        { id: HOUSE_CO, organization_id: HOUSE_ORG, ai_settings: {} },
        { id: NOCUS_CO, organization_id: NOCUS_ORG, ai_settings: {} },
        { id: UNDER_CO, organization_id: UNDER_ORG, ai_settings: {} },
      ],
      feature_flags: [],
      usage_monthly_v: [
        // Front Desk: 500 org-wide; 300 + 230.4 → 30.4 over → 31 billed.
        usage(FD_ORG, FD_CO_1, 300),
        usage(FD_ORG, FD_CO_2, 230.4),
        // Close: per company. A 120 of 100 (20 over); B 40 of 50 (under) → 20.
        usage(CLOSE_ORG, CLOSE_CO_A, 120),
        usage(CLOSE_ORG, CLOSE_CO_B, 40),
        // A house plan is never billed.
        usage(HOUSE_ORG, HOUSE_CO, 900),
        // Over, but no Stripe customer.
        usage(NOCUS_ORG, NOCUS_CO, 150),
        usage(UNDER_ORG, UNDER_CO, 90),
        // Another month doesn't count.
        usage(UNDER_ORG, UNDER_CO, 500, "2026-08-01"),
      ],
      voice_overage_charges: [],
    },
    { voice_overage_charges: [["organization_id", "month"]] },
  );
}

type CreateItem = (params: unknown, options: unknown) => Promise<{ id: string }>;

function fakeStripe(impl?: () => Promise<{ id: string }>) {
  let n = 0;
  const create = vi.fn<CreateItem>(impl ?? (async () => ({ id: `ii_${++n}` })));
  return { stripe: { invoiceItems: { create } } as never, create };
}

beforeEach(() => resetVoiceOverageMemo());
afterEach(() => vi.unstubAllEnvs());

describe("config", () => {
  it("modes: off by default; record; charge needs the price id (else record)", () => {
    expect(voiceOverageMode({})).toBe("off");
    expect(voiceOverageMode({ VOICE_OVERAGE_BILLING: "nonsense" })).toBe("off");
    expect(voiceOverageMode(RECORD_ENV)).toBe("record");
    expect(voiceOverageMode({ VOICE_OVERAGE_BILLING: "charge" })).toBe("record");
    expect(voiceOverageMode(CHARGE_ENV)).toBe("charge");
  });

  it("answering headroom only for an org that will be billed, capped", () => {
    expect(overageAnswerMinutes({})).toBe(0);
    expect(overageAnswerMinutes({ VOICE_OVERAGE_ANSWER_MINUTES: "60" })).toBe(60);
    expect(overageAnswerMinutes({ VOICE_OVERAGE_ANSWER_MINUTES: "99999" })).toBe(2000);
    expect(overageAnswerMinutes({ VOICE_OVERAGE_ANSWER_MINUTES: "-5" })).toBe(0);
    const env = { ...CHARGE_ENV, VOICE_OVERAGE_ANSWER_MINUTES: "60" };
    expect(overageHeadroomMinutes({ plan: "operate", stripe_customer_id: "cus_1" }, env)).toBe(60);
    expect(overageHeadroomMinutes({ plan: "operate", stripe_customer_id: null }, env)).toBe(0);
    expect(overageHeadroomMinutes({ plan: "internal", stripe_customer_id: "cus_1" }, env)).toBe(0);
    expect(overageHeadroomMinutes({ plan: "operate", stripe_customer_id: "cus_1" }, { ...RECORD_ENV, VOICE_OVERAGE_ANSWER_MINUTES: "60" })).toBe(0);
    expect(billsVoiceOverage({ plan: "front_desk", stripe_customer_id: " " }, CHARGE_ENV)).toBe(false);
  });

  it("months: the previous month, closed from 06:00 Toronto on the 1st", () => {
    expect(previousMonth("2026-10-01")).toBe("2026-09-01");
    expect(previousMonth("2026-01-01")).toBe("2025-12-01");
    expect(closedMonth(Date.parse("2026-10-01T09:00:00Z"))).toBe("2026-08-01"); // 05:00 Toronto: September still settling
    expect(closedMonth(OCT_1_MORNING)).toBe(SEPT);
    expect(closedMonth(Date.parse("2026-10-20T15:00:00Z"))).toBe(SEPT);
  });

  it("whole minutes, rounded up", () => {
    expect(billableMinutes(0.1)).toBe(1);
    expect(billableMinutes(2.5)).toBe(3);
    expect(billableMinutes(2.0000001)).toBe(2);
    expect(billableMinutes(0)).toBe(0);
    expect(billableMinutes(-4)).toBe(0);
  });
});

describe("computeVoiceOverages", () => {
  it("Front Desk org-wide, Catch / Close per company; house plans and orgs under the allowance are left out", async () => {
    const db = seed();
    const out = await computeVoiceOverages(db.client, SEPT);
    const byOrg = new Map(out.map((o) => [o.organizationId, o]));
    expect([...byOrg.keys()].sort()).toEqual([CLOSE_ORG, FD_ORG, NOCUS_ORG].sort());
    expect(byOrg.get(FD_ORG)).toMatchObject({ scope: "organization", includedMinutes: 500, usedMinutes: 530.4, overageMinutes: 31, stripeCustomerId: "cus_fd" });
    expect(byOrg.get(CLOSE_ORG)).toMatchObject({ scope: "company", includedMinutes: 150, usedMinutes: 160, overageMinutes: 20 });
    expect(byOrg.get(CLOSE_ORG)?.detail).toEqual([{ company_id: CLOSE_CO_A, included_minutes: 100, used_minutes: 120, overage_minutes: 20 }]);
    expect(byOrg.get(NOCUS_ORG)).toMatchObject({ overageMinutes: 50, stripeCustomerId: null });
  });
});

describe("processVoiceOverage", () => {
  it("off: nothing is read or written", async () => {
    const db = seed();
    const { stripe, create } = fakeStripe();
    const r = await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: {} });
    expect(r).toMatchObject({ mode: "off", over: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(db.tables.voice_overage_charges).toHaveLength(0);
  });

  it("charge: one invoice item per org over (price × minutes, idempotency key), a skipped row without a customer", async () => {
    const db = seed();
    const { stripe, create } = fakeStripe();
    const r = await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: CHARGE_ENV });
    expect(r).toMatchObject({ month: SEPT, mode: "charge", over: 3, charged: 2, skipped: 1, failed: 0 });
    expect(create).toHaveBeenCalledTimes(2);
    const fd = create.mock.calls.find((c) => (c[0] as { customer: string }).customer === "cus_fd");
    expect(fd?.[0]).toMatchObject({ customer: "cus_fd", pricing: { price: PRICE }, quantity: 31, metadata: { kind: "voice_overage", organization_id: FD_ORG, month: SEPT } });
    expect((fd?.[0] as { description: string }).description).toContain("September 2026");
    expect(fd?.[1]).toEqual({ idempotencyKey: `voice-overage-${FD_ORG}-${SEPT}-31` });
    const rows = db.tables.voice_overage_charges;
    expect(rows.find((x) => x.organization_id === FD_ORG)).toMatchObject({ status: "charged", overage_minutes: 31, attempts: 1, stripe_price_id: PRICE, stripe_customer_id: "cus_fd" });
    expect(rows.find((x) => x.organization_id === FD_ORG)?.stripe_invoice_item_id).toMatch(/^ii_/);
    expect(rows.find((x) => x.organization_id === NOCUS_ORG)).toMatchObject({ status: "skipped", last_error: "no Stripe customer" });
  });

  it("idempotent: a second pass (even after a restart) charges nobody twice", async () => {
    const db = seed();
    const { stripe, create } = fakeStripe();
    await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: CHARGE_ENV });
    resetVoiceOverageMemo();
    const again = await processVoiceOverage(db.client, OCT_1_MORNING + 3_600_000, { stripe, env: CHARGE_ENV });
    expect(again).toMatchObject({ charged: 0, skipped: 0, failed: 0 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(db.tables.voice_overage_charges).toHaveLength(3);
  });

  it("a Stripe failure is recorded and retried on a later pass, up to 3 tries", async () => {
    const db = seed();
    const { stripe, create } = fakeStripe(async () => {
      throw new Error("card_declined");
    });
    const first = await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: CHARGE_ENV });
    expect(first).toMatchObject({ charged: 0, failed: 2 });
    const fdRow = () => db.tables.voice_overage_charges.find((x) => x.organization_id === FD_ORG);
    expect(fdRow()).toMatchObject({ status: "failed", attempts: 1, last_error: "card_declined" });
    await processVoiceOverage(db.client, OCT_1_MORNING + 3_600_000, { stripe, env: CHARGE_ENV });
    await processVoiceOverage(db.client, OCT_1_MORNING + 7_200_000, { stripe, env: CHARGE_ENV });
    expect(fdRow()).toMatchObject({ status: "failed", attempts: 3 });
    const calls = create.mock.calls.length;
    await processVoiceOverage(db.client, OCT_1_MORNING + 10_800_000, { stripe, env: CHARGE_ENV });
    expect(create.mock.calls.length).toBe(calls); // no fourth try
  });

  it("a retry that works marks the row charged", async () => {
    const db = seed();
    let fail = true;
    const { stripe } = fakeStripe(async () => {
      if (fail) throw new Error("timeout");
      return { id: "ii_ok" };
    });
    await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: CHARGE_ENV });
    fail = false;
    await processVoiceOverage(db.client, OCT_1_MORNING + 3_600_000, { stripe, env: CHARGE_ENV });
    expect(db.tables.voice_overage_charges.find((x) => x.organization_id === CLOSE_ORG)).toMatchObject({ status: "charged", attempts: 2, stripe_invoice_item_id: "ii_ok", last_error: null });
  });

  it("record: rows only, never charged later — even when charging is switched on afterwards", async () => {
    const db = seed();
    const { stripe, create } = fakeStripe();
    const r = await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: RECORD_ENV });
    expect(r).toMatchObject({ mode: "record", recorded: 3 });
    expect(db.tables.voice_overage_charges.every((x) => x.status === "recorded")).toBe(true);
    await processVoiceOverage(db.client, OCT_1_MORNING + 3_600_000, { stripe, env: CHARGE_ENV });
    expect(create).not.toHaveBeenCalled();
  });

  it("a crashed pass's 'charging' row is taken over after 15 minutes (same idempotency key)", async () => {
    const db = seed();
    db.tables.voice_overage_charges.push({
      id: "row-stale", organization_id: FD_ORG, month: SEPT, scope: "organization", included_minutes: 500, used_minutes: 530.4, overage_minutes: 31,
      detail: [], status: "charging", attempts: 1, updated_at: new Date(OCT_1_MORNING - 20 * 60_000).toISOString(),
    });
    const { stripe, create } = fakeStripe();
    await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: CHARGE_ENV });
    expect(create.mock.calls.some((c) => (c[1] as { idempotencyKey: string }).idempotencyKey === `voice-overage-${FD_ORG}-${SEPT}-31`)).toBe(true);
    expect(db.tables.voice_overage_charges.find((x) => x.id === "row-stale")).toMatchObject({ status: "charged", attempts: 2 });
  });

  it("a fresh 'charging' row (another worker on it) is left alone", async () => {
    const db = seed();
    db.tables.voice_overage_charges.push({
      id: "row-live", organization_id: FD_ORG, month: SEPT, scope: "organization", included_minutes: 500, used_minutes: 530.4, overage_minutes: 31,
      detail: [], status: "charging", attempts: 1, updated_at: new Date(OCT_1_MORNING - 60_000).toISOString(),
    });
    const { stripe, create } = fakeStripe();
    await processVoiceOverage(db.client, OCT_1_MORNING, { stripe, env: CHARGE_ENV });
    expect(create.mock.calls.some((c) => (c[0] as { customer: string }).customer === "cus_fd")).toBe(false);
  });
});

describe("answering past the allowance (VOICE_OVERAGE_ANSWER_MINUTES)", () => {
  const CO = "00000000-0000-4000-8000-00000000c101";
  const ORG = "00000000-0000-4000-8000-00000000f101";
  const NOW = new Date("2026-10-15T15:00:00Z");
  const config: AiAnswerConfig = {
    enabled: true, apiKey: "key", messageAgentId: "agent_msg", tokenSecret: "secret", sipDomain: "sip.test",
    ringTimeoutSeconds: 12, registerTimeoutMs: 2000, watchdogMinutes: 30,
  };
  const db = (stripeCustomer: string | null) =>
    createFakeDb({
      organizations: [{ id: ORG, plan: "operate", crankleads_tier: "close", platform_brand: "crankleads", stripe_customer_id: stripeCustomer }],
      companies: [{ id: CO, organization_id: ORG, name: "Northshore", ai_settings: {}, timezone: "America/Toronto" }],
      usage_monthly_v: [usage(ORG, CO, 100, "2026-10-01")],
      missed_calls: [],
      voice_numbers: [],
      feature_flags: [],
    });
  const decide = (d: FakeDb) => decideCallAnswering(d.client, { organizationId: ORG, companyId: CO, companyName: "Northshore" }, { config, now: NOW, billingHealthy: async () => true });

  it("allowance spent, no headroom → voicemail, as before", async () => {
    vi.stubEnv("VOICE_OVERAGE_BILLING", "charge");
    vi.stubEnv("STRIPE_PRICE_VOICE_OVERAGE", PRICE);
    expect(await decide(db("cus_1"))).toMatchObject({ kind: "voicemail", reason: "minutes_exhausted" });
  });

  it("charge mode + headroom + a Stripe customer → the AI keeps answering", async () => {
    vi.stubEnv("VOICE_OVERAGE_BILLING", "charge");
    vi.stubEnv("STRIPE_PRICE_VOICE_OVERAGE", PRICE);
    vi.stubEnv("VOICE_OVERAGE_ANSWER_MINUTES", "60");
    expect(await decide(db("cus_1"))).toMatchObject({ kind: "ai", agentId: "agent_msg", timeLimitSeconds: 900 });
  });

  it("headroom is never given to an org that wouldn't be billed (no customer, or not charging)", async () => {
    vi.stubEnv("VOICE_OVERAGE_ANSWER_MINUTES", "60");
    vi.stubEnv("VOICE_OVERAGE_BILLING", "charge");
    vi.stubEnv("STRIPE_PRICE_VOICE_OVERAGE", PRICE);
    expect(await decide(db(null))).toMatchObject({ kind: "voicemail", reason: "minutes_exhausted" });
    vi.stubEnv("VOICE_OVERAGE_BILLING", "record");
    expect(await decide(db("cus_1"))).toMatchObject({ kind: "voicemail", reason: "minutes_exhausted" });
  });
});
