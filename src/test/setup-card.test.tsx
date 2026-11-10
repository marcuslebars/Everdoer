/**
 * Self-serve setup, as the owner sees it: four essentials and four extras (src/lib/onboarding-steps.ts),
 * and Home's setup card (src/lib/setup-card.ts + OnboardingChecklistCard) saying what is and isn't
 * working instead of counting wizard steps.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "owner", readiness: null as unknown, setup: null as unknown, progress: null as unknown }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  getYourAiStep: async () => ({ view: { companyId: "co-1", persona: { name: null, tone: null, defaultName: "Everly" }, switches: [] }, readiness: state.readiness }),
}));
vi.mock("@/lib/api-hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-hooks")>()),
  useSetupChecklist: () => ({ data: state.setup, isLoading: false }),
  useOnboardingProgress: () => ({ data: state.progress }),
}));
vi.mock("@/lib/auth-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-context")>()),
  useAuth: () => ({ session: { organizations: [{ id: "org-1", membershipRole: state.role }] } }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseConfigDiagnostic: () => ({ isConfigured: true }), supabase: {} }));

import { OnboardingChecklistCard } from "@/screens/Dashboard";
import { BrandProvider } from "@/lib/brand-context";
import {
  ONBOARDING_STEP_KEYS,
  isStepDone,
  isStepSkipped,
  resolveWizardStep,
  setupSummary,
  showsTestCallStep,
  wizardGroups,
  type StepState,
} from "@/lib/onboarding-steps";
import { setupCardView } from "@/lib/setup-card";

const READY = { ownerCellConfirmed: true, hasNumber: true, forwardingVerified: true, textsOn: true, callsOn: true, textsOffByChoice: false, callsOffByChoice: false, dedicatedLine: false, pricedServices: 3, unpricedServices: 0 };

const done = (step: string, data: Record<string, unknown> = {}): StepState => ({ step, status: "complete", data });
const skipped = (step: string): StepState => done(step, { skipped: true });
const catcher = done("phone", { mode: "missed_call_catcher" });
/** The live tenant this was written against: 6 of 9 "done", two of them only skipped, forwarding untested. */
const SIX_OF_NINE: StepState[] = [done("business"), done("services"), catcher, done("ai"), skipped("payments"), done("website")];

describe("wizard steps (pure)", () => {
  it("four essentials and four extras; every stored step is in exactly one place", () => {
    const one = wizardGroups("missed_call_catcher");
    expect(one.essentials).toEqual(["business", "services", "phone", "ai"]);
    expect(one.extras).toEqual(["payments", "website", "team", "recipes"]);
    const line = wizardGroups("ai_receptionist");
    expect([...line.essentials, ...line.extras].sort()).toEqual([...ONBOARDING_STEP_KEYS].sort());
  });

  it("'Test call' is its own step only on a dedicated AI line", () => {
    expect(showsTestCallStep("missed_call_catcher")).toBe(false);
    expect(showsTestCallStep(null)).toBe(false);
    expect(showsTestCallStep("ai_receptionist")).toBe(true);
    // A texted link to the test still lands somewhere useful: the Phone step holds the forwarding test.
    expect(resolveWizardStep("test_call", "missed_call_catcher")).toBe("phone");
    expect(resolveWizardStep("test_call", "ai_receptionist")).toBe("test_call");
    expect(resolveWizardStep("resume", null)).toBeNull();
  });

  it("skipped is not done", () => {
    expect(isStepDone(skipped("payments"))).toBe(false);
    expect(isStepSkipped(skipped("payments"))).toBe(true);
    expect(isStepDone(done("payments"))).toBe(true);
    expect(isStepDone({ step: "payments", status: "in_progress" })).toBe(false);
    expect(isStepDone(undefined)).toBe(false);
  });

  it("summarises essentials and what's left of the extras", () => {
    const s = setupSummary([done("business"), done("services"), skipped("payments")]);
    expect(s.essentialsDone).toBe(false);
    expect(s.nextEssential).toBe("phone");
    expect(s.extrasLeft).toEqual(["payments", "website", "team", "recipes"]);
    expect(setupSummary(SIX_OF_NINE).essentialsDone).toBe(true);
  });
});

describe("setupCardView (pure)", () => {
  const base = { readiness: READY, canFix: true, extrasHidden: false };

  it("essentials first: names the next one, counts only essentials", () => {
    expect(setupCardView({ ...base, steps: [done("business")] })).toEqual({ kind: "essentials", done: 1, total: 4, nextStep: "services", nextAction: "add your services and prices" });
    // Named the account, never saved the Business step.
    expect(setupCardView({ ...base, steps: null })).toMatchObject({ kind: "essentials", done: 0, nextStep: "business" });
  });

  it("the '6 of 9' tenant is told calls aren't reaching the AI, not that it's two-thirds done", () => {
    const view = setupCardView({ ...base, steps: SIX_OF_NINE, readiness: { ...READY, forwardingVerified: false } });
    expect(view).toMatchObject({ kind: "gaps" });
    expect(view && view.kind === "gaps" && view.gaps[0]).toMatchObject({ key: "forwarding", href: "/onboarding?step=phone" });
  });

  it("all working: a quiet list of extras never done (skipped ones included), which can be hidden", () => {
    const view = setupCardView({ ...base, steps: SIX_OF_NINE });
    expect(view).toEqual({
      kind: "extras",
      extras: [
        { step: "payments", label: "Take card payments" },
        { step: "team", label: "Invite your team" },
        { step: "recipes", label: "Review your automations" },
      ],
    });
    expect(setupCardView({ ...base, steps: SIX_OF_NINE, extrasHidden: true })).toBeNull();
  });

  it("hiding the extras never hides a real gap; members aren't shown gaps they can't fix", () => {
    const broken = { ...READY, forwardingVerified: false };
    expect(setupCardView({ ...base, steps: SIX_OF_NINE, readiness: broken, extrasHidden: true })).toMatchObject({ kind: "gaps" });
    expect(setupCardView({ ...base, steps: SIX_OF_NINE, readiness: broken, canFix: false, extrasHidden: true })).toBeNull();
  });

  it("gone once every stored step is complete (AiReadinessCard reports gaps from then on)", () => {
    const all = ONBOARDING_STEP_KEYS.map((step) => done(step, step === "phone" ? { mode: "missed_call_catcher" } : {}));
    expect(setupCardView({ ...base, steps: all, readiness: { ...READY, forwardingVerified: false } })).toBeNull();
  });
});

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BrandProvider>{node}</BrandProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OnboardingChecklistCard", () => {
  beforeEach(() => {
    state.role = "owner";
    state.readiness = READY;
    state.setup = null;
    state.progress = { company: { id: "co-1", name: "Test Plumbing Co" }, steps: SIX_OF_NINE, nextStep: "test_call" };
    window.localStorage.clear();
  });

  it("says what isn't working and links to the fix", async () => {
    state.readiness = { ...READY, forwardingVerified: false };
    wrap(<OnboardingChecklistCard orgId="org-1" />);
    expect(await screen.findByText(/isn't fully working yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /turn on call forwarding/i })).toHaveAttribute("href", "/onboarding?step=phone");
    expect(document.body.textContent).not.toMatch(/of 9/);
  });

  it("offers the extras once everything works, and 'Hide' sticks", async () => {
    const { container } = wrap(<OnboardingChecklistCard orgId="org-1" />);
    expect(await screen.findByText(/you're set up/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /take card payments/i })).toHaveAttribute("href", "/onboarding?step=payments");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(container).toBeEmptyDOMElement();
    expect(window.localStorage.getItem("everdoer_setup_extras_hidden:org-1")).toBe("1");
  });

  it("counts essentials, not steps, while they're unfinished", async () => {
    state.progress = { company: { id: "co-1", name: "Test Plumbing Co" }, steps: [done("business"), done("services")], nextStep: "phone" };
    wrap(<OnboardingChecklistCard orgId="org-1" />);
    expect(await screen.findByText("2 of 4 essentials done. Next: get your number.")).toBeInTheDocument();
  });

  it("done-for-you accounts keep their own card", () => {
    state.setup = { isLive: false };
    const { container } = wrap(<OnboardingChecklistCard orgId="org-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
