/**
 * The billing page's plan cards, as each kind of business sees them.
 *
 * A new sign-up is on a free trial the app runs itself: no Stripe subscription exists yet, so the
 * only way to start paying is a Subscribe button on a plan card. (Before this test existed a
 * trialing business got "Current plan" and "Change in portal", and the portal answered "Choose a
 * plan first": there was no way to subscribe.) A business with a Stripe subscription — paid, or
 * on the everdoer.com card-on-file trial — manages it in the portal instead.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  billing: null as unknown,
  plans: [] as unknown[],
  checkoutMutate: vi.fn(),
  portalMutate: vi.fn(),
}));
vi.mock("@/lib/api-hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-hooks")>()),
  useBilling: () => ({ data: state.billing, isLoading: false }),
  useBillingPlans: () => ({ data: state.plans, isLoading: false }),
  useCreateCheckout: () => ({ mutate: state.checkoutMutate, isPending: false }),
  useCreateBillingPortal: () => ({ mutate: state.portalMutate, isPending: false }),
  useMonthlyUsage: () => ({ data: null, isLoading: true }),
}));
vi.mock("@/lib/org-context", () => ({ useOrg: () => ({ organizationId: "org-1" }) }));
vi.mock("@/lib/auth-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-context")>()),
  useAuth: () => ({ session: { organizations: [{ id: "org-1", membershipRole: "owner" }] } }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseConfigDiagnostic: () => ({ isConfigured: true }), supabase: {} }));

import { BillingSettings } from "@/components/settings/BillingSettings";
import { BrandProvider } from "@/lib/brand-context";

const FEATURES = { lead_intake: true, bookings: true, tasks: true, workflows: true, sms_sequences: true, marina_reception: false };
const card = (plan: string, amountCents: number) => ({
  amountCents,
  available: true,
  currency: "cad",
  features: { ...FEATURES, marina_reception: plan === "front_desk" },
  interval: "month",
  plan,
  priceId: `price_${plan}`,
  setupFeeCents: null,
});
const OFFERED = [card("operate", 29900), card("front_desk", 49900)];

const billing = (organization: Record<string, unknown>, subscription: Record<string, unknown> | null) => ({
  gating: {},
  organization: { id: "org-1", name: "Northshore Roofing", stripe_customer_id: null, trial_ends_at: null, crankleads_tier: null, ...organization },
  subscription,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <BrandProvider>
        <BillingSettings />
      </BrandProvider>
    </MemoryRouter>,
  );
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

beforeEach(() => {
  state.plans = OFFERED;
  state.checkoutMutate.mockReset();
  state.portalMutate.mockReset();
});

describe("billing page plan cards", () => {
  it("a free-trial sign-up can subscribe to either plan, including the one it is trying", () => {
    state.billing = billing({ plan: "operate", subscription_status: "trialing", trial_ends_at: inDays(9) }, null);
    renderPage();

    expect(screen.getByText(/You're trying the/)).toBeInTheDocument();
    expect(screen.getByText(/Trial ends/)).toBeInTheDocument();
    expect(screen.getByText("On trial")).toBeInTheDocument();
    const subscribe = screen.getAllByRole("button", { name: "Subscribe" });
    expect(subscribe).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Current plan" })).toBeNull();
    expect(screen.queryByText(/Email us to switch/)).toBeNull();
    // No Stripe customer yet, so no portal button either.
    expect(screen.queryByText("Manage subscription")).toBeNull();

    fireEvent.click(subscribe[0]);
    expect(state.checkoutMutate).toHaveBeenCalledWith("operate", expect.anything());
    fireEvent.click(subscribe[1]);
    expect(state.checkoutMutate).toHaveBeenLastCalledWith("front_desk", expect.anything());
  });

  it("says so when the free trial has run out, and still lets the business subscribe", () => {
    state.billing = billing({ plan: "operate", subscription_status: "trialing", trial_ends_at: inDays(-2) }, null);
    renderPage();
    expect(screen.getByText(/free trial of the/)).toBeInTheDocument();
    expect(screen.getByText(/has ended/)).toBeInTheDocument();
    expect(screen.getByText(/Trial ended/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Subscribe" })).toHaveLength(2);
  });

  it("a trial that started with a card at checkout (a Stripe subscription) is managed like a paid plan", () => {
    state.billing = billing(
      { plan: "operate", subscription_status: "trialing", stripe_customer_id: "cus_1", crankleads_tier: "close" },
      { id: "sub-1", status: "trialing", current_period_end: inDays(14) },
    );
    renderPage();
    expect(screen.getByText(/You're on the/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    expect(screen.getByText("Manage subscription")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).toBeNull();
  });

  it("a paying business: its plan is current, the other plan goes to a person (plan switching isn't in the portal)", () => {
    state.billing = billing(
      { plan: "operate", subscription_status: "active", stripe_customer_id: "cus_1" },
      { id: "sub-1", status: "active", current_period_end: inDays(20) },
    );
    renderPage();
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    const link = screen.getByRole("link", { name: /Email us to switch/ });
    expect(link.getAttribute("href")).toBe("mailto:hello@everdoer.com?subject=Switch%20to%20the%20Front%20Desk%20plan");
    expect(screen.queryByRole("button", { name: "Subscribe" })).toBeNull();
    expect(screen.queryByText(/Change in portal/)).toBeNull();
  });

  it("no subscription (cancelled or never started): Subscribe on every card", () => {
    state.billing = billing({ plan: "operate", subscription_status: "canceled", stripe_customer_id: "cus_1" }, { id: "sub-1", status: "canceled", current_period_end: inDays(-3) });
    renderPage();
    expect(screen.getByText(/No active subscription/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Subscribe" })).toHaveLength(2);
  });

  it("shows only the plans the server offers: no Launch card, and two columns for two plans", () => {
    state.billing = billing({ plan: "operate", subscription_status: "trialing", trial_ends_at: inDays(9) }, null);
    const { container } = renderPage();
    expect(screen.queryByText("Launch")).toBeNull();
    expect(screen.getByRole("heading", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Front Desk" })).toBeInTheDocument();
    expect(container.querySelector(".md\\:grid-cols-2")).not.toBeNull();
    expect(container.querySelector(".md\\:grid-cols-3")).toBeNull();
  });
});
