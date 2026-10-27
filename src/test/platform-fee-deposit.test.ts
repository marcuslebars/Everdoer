import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

// The quote deposit checkout carries Everdoer's platform fee as the PaymentIntent's
// application_fee_amount, on the tenant's own connected account, with a fee-specific
// idempotency key (billing/platform-fee.ts).
const h = vi.hoisted(() => ({ db: null as FakeDb | null, createSession: vi.fn(), createCustomer: vi.fn() }));

vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => h.db?.client }));
vi.mock("@/server/services/quotes/company-stripe", () => ({
  getPlatformStripe: () => ({
    checkout: { sessions: { create: (...a: unknown[]) => h.createSession(...a), retrieve: vi.fn() } },
    customers: { create: (...a: unknown[]) => h.createCustomer(...a) },
  }),
  onAccount: () => ({ stripeAccount: "acct_tenant" }),
  requireChargeableCompany: async () => ({ accountId: "acct_tenant", name: "Northshore Lawn", statementDescriptorSuffix: null }),
}));

const { createDepositCheckoutSession } = await import("@/server/services/quotes/checkout");

const TOKEN = "t".repeat(32);

function seed(plan: string) {
  h.db = createFakeDb({
    organizations: [{ id: "org-1", plan }],
    feature_flags: [],
    quotes: [
      {
        id: "q1",
        organization_id: "org-1",
        company_id: "co-1",
        contact_id: null,
        public_token: TOKEN,
        title: "Spring cleanup",
        quote_number: "Q-1",
        currency: "CAD",
        approved_at: "2026-10-20T12:00:00Z",
        approved_deposit_cents: 45_000,
        deposit_paid_at: null,
        deposit_rate_bps: 2500,
        stripe_checkout_session_id: null,
      },
    ],
    quote_events: [],
  });
}

beforeEach(() => {
  h.createSession.mockReset();
  h.createSession.mockResolvedValue({ id: "cs_1", status: "open", url: "https://checkout.stripe.test/cs_1" });
  h.createCustomer.mockReset();
  h.createCustomer.mockResolvedValue({ id: "cus_1" });
});

afterEach(() => {
  delete process.env.PLATFORM_FEE_BPS;
});

describe("quote deposit checkout — platform fee", () => {
  it("1% on a paying tenant's deposit, as a direct charge with a fee-specific key", async () => {
    process.env.PLATFORM_FEE_BPS = "100";
    seed("operate");
    await createDepositCheckoutSession(TOKEN, { baseUrl: "https://app.test" });
    const [params, opts] = h.createSession.mock.calls[0] as [{ payment_intent_data: Record<string, unknown> }, { stripeAccount: string; idempotencyKey: string }];
    expect(params.payment_intent_data.application_fee_amount).toBe(450);
    expect(opts).toMatchObject({ stripeAccount: "acct_tenant", idempotencyKey: "quote-deposit-q1-45000-f450" });
  });

  it("no fee configured, or a house tenant → the request is exactly as before", async () => {
    seed("operate");
    await createDepositCheckoutSession(TOKEN, { baseUrl: "https://app.test" });
    let [params, opts] = h.createSession.mock.calls[0] as [{ payment_intent_data: Record<string, unknown> }, { idempotencyKey: string }];
    expect(params.payment_intent_data).not.toHaveProperty("application_fee_amount");
    expect(opts.idempotencyKey).toBe("quote-deposit-q1-45000");

    process.env.PLATFORM_FEE_BPS = "100";
    seed("internal");
    h.createSession.mockClear();
    await createDepositCheckoutSession(TOKEN, { baseUrl: "https://app.test" });
    [params, opts] = h.createSession.mock.calls[0] as [{ payment_intent_data: Record<string, unknown> }, { idempotencyKey: string }];
    expect(params.payment_intent_data).not.toHaveProperty("application_fee_amount");
    expect(opts.idempotencyKey).toBe("quote-deposit-q1-45000");
  });
});
