/**
 * The self-serve wizard's rail: essentials and "when you're ready", no separate "Test call" on
 * one number, and "Skip for now" recorded as skipped rather than ticked as done.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  upsert: vi.fn(),
  progress: null as unknown,
  idle: () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }),
}));

vi.mock("@/lib/api-hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-hooks")>()),
  useOnboardingProgress: () => ({ data: h.progress, isLoading: false }),
  useUpsertOnboardingStep: () => ({ ...h.idle(), mutate: h.upsert }),
  useConnectAccounts: () => ({ data: [], refetch: vi.fn() }),
  useCreateConnectOnboarding: h.idle,
  useRefreshConnectAccount: h.idle,
}));
vi.mock("@/lib/dfy-api", () => ({ useSetupProgress: () => ({ data: null, isLoading: false, isError: false }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ session: { organizations: [{ id: "org-1", membershipRole: "owner" }] } }) }));
vi.mock("@/lib/org-context", () => ({ useOrg: () => ({ organizationId: "org-1", setOrganizationId: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseConfigDiagnostic: () => ({ isConfigured: true }), supabase: {} }));
vi.mock("@/components/help/HelpPanel", () => ({ HelpButton: () => null }));
vi.mock("@/components/onboarding/PhoneModeStep", () => ({ PhoneModeStep: () => <p>phone step</p> }));
vi.mock("@/components/website-forms/WebsiteFormsPanel", () => ({ WebsiteFormStep: () => <p>website step</p> }));

import OnboardingWizard from "@/screens/onboarding/OnboardingWizard";
import { BrandProvider } from "@/lib/brand-context";

const done = (step: string, data: Record<string, unknown> = {}) => ({ step, status: "complete", data, completed_at: null });

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BrandProvider>
        <OnboardingWizard />
      </BrandProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.upsert.mockReset();
  h.progress = {
    company: { id: "co-1", name: "Test Plumbing Co" },
    steps: [done("business"), done("services"), done("phone", { mode: "missed_call_catcher" }), done("ai"), done("payments", { skipped: true })],
    nextStep: "website",
  };
});

describe("self-serve wizard rail", () => {
  it("groups the steps and shows a skipped step as skipped, not done", async () => {
    renderAt("/onboarding?step=payments");
    const rail = within(await screen.findByRole("navigation", { name: "Setup steps" }));
    expect(rail.getByText("Essentials")).toBeInTheDocument();
    expect(rail.getByText("When you're ready")).toBeInTheDocument();
    // One number: the Phone step holds the forwarding test, so there is no separate "Test call".
    expect(rail.queryByText("Test call")).not.toBeInTheDocument();
    const payments = rail.getByRole("button", { name: /payments/i });
    expect(payments).toHaveTextContent("skipped");
    expect(within(payments).queryByLabelText("Done")).not.toBeInTheDocument();
    expect(within(rail.getByRole("button", { name: /services/i })).getByLabelText("Done")).toBeInTheDocument();
  });

  it("'Skip for now' records the skip and moves to the next extra", async () => {
    renderAt("/onboarding?step=payments");
    fireEvent.click(await screen.findByRole("button", { name: /skip for now/i }));
    expect(h.upsert).toHaveBeenCalledWith({ companyId: "co-1", step: "payments", completed: true, data: { skipped: true } });
    expect(await screen.findByText("website step")).toBeInTheDocument();
  });

  it("a link to the test call opens the Phone step on one number", async () => {
    renderAt("/onboarding?step=test_call");
    const rail = within(await screen.findByRole("navigation", { name: "Setup steps" }));
    expect(rail.getByRole("button", { name: /phone/i })).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("phone step")).toBeInTheDocument();
  });
});
