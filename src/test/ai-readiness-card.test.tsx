/**
 * "Your AI isn't fully working yet" (components/front-desk/AiReadinessCard.tsx): what's missing,
 * with links — hidden when nothing is, and while a setup card already covers it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "owner",
  readiness: null as unknown,
  setup: null as unknown,
  progress: null as unknown,
}));
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

import { AiReadinessCard } from "@/components/front-desk/AiReadinessCard";
import { ONBOARDING_STEP_KEYS } from "@/lib/onboarding-steps";

const READY = { ownerCellConfirmed: true, hasNumber: true, forwardingVerified: true, textsOn: true, callsOn: true, textsOffByChoice: false, callsOffByChoice: false, dedicatedLine: false, pricedServices: 3, unpricedServices: 0 };
const finished = { company: { id: "co-1", name: "Northshore" }, steps: ONBOARDING_STEP_KEYS.map((step) => ({ step, status: "complete", data: {} })), nextStep: "recipes" };

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.role = "owner";
  state.readiness = READY;
  state.setup = null;
  state.progress = finished;
});

describe("AiReadinessCard", () => {
  it("lists what's missing, each linking to where it's fixed", async () => {
    state.readiness = { ...READY, forwardingVerified: false, ownerCellConfirmed: false, textsOn: false };
    wrap(<AiReadinessCard orgId="org-1" companyId="co-1" />);
    expect(await screen.findByText(/isn't fully working yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /turn on call forwarding/i })).toHaveAttribute("href", "/onboarding?step=phone");
    expect(screen.getByRole("link", { name: /confirm your cell/i })).toHaveAttribute("href", "/settings?section=front-desk&focus=owner-phone");
    expect(screen.getByRole("link", { name: /isn't answering customer texts/i })).toHaveAttribute("href", "/ai");
  });

  it("members don't see it (every fix is an owner/admin change)", async () => {
    state.role = "member";
    state.readiness = { ...READY, ownerCellConfirmed: false };
    const { container } = wrap(<AiReadinessCard orgId="org-1" companyId="co-1" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("for a company the wizard isn't set up on, the Phone-step links are left out (they'd fix the other one)", async () => {
    state.readiness = { ...READY, forwardingVerified: false, ownerCellConfirmed: false };
    wrap(<AiReadinessCard orgId="org-1" companyId="co-2" />);
    expect(await screen.findByText(/confirm your cell/i)).toBeInTheDocument();
    expect(screen.queryByText(/turn on call forwarding/i)).toBeNull();
  });

  it("nothing missing → nothing shown", async () => {
    const { container } = wrap(<AiReadinessCard orgId="org-1" companyId="co-1" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("hidden while onboarding or done-for-you setup is still running (their own card covers it)", async () => {
    state.readiness = { ...READY, hasNumber: false };
    state.progress = { ...finished, steps: finished.steps.slice(0, 3) };
    const a = wrap(<AiReadinessCard orgId="org-1" companyId="co-1" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();

    state.progress = finished;
    state.setup = { isLive: false };
    const b = wrap(<AiReadinessCard orgId="org-1" companyId="co-1" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(b.container).toBeEmptyDOMElement();
    b.unmount();

    // On Your AI it always shows, minus the switches that page already has.
    state.readiness = { ...READY, hasNumber: false, textsOn: false };
    wrap(<AiReadinessCard orgId="org-1" companyId="co-1" hideDuringSetup={false} omit={["texts", "calls"]} />);
    expect(await screen.findByText(/get your number/i)).toBeInTheDocument();
    expect(screen.queryByText(/isn't answering customer texts/i)).toBeNull();
  });
});
