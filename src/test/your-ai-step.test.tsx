/**
 * The onboarding "Your AI" step (components/onboarding/YourAiStep.tsx): ask-me-first by default,
 * one button turns it on, and what's missing links to the step that fixes it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ step: null as unknown, setUp: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  getYourAiStep: async () => api.step,
  setUpYourAiStep: (...args: unknown[]) => api.setUp(...args),
}));

const cell = vi.hoisted(() => ({ view: null as unknown, send: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/front-desk-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/front-desk-api")>()),
  useOwnerPhone: () => ({ data: cell.view, isLoading: false }),
  useOwnerPhoneActions: () => ({ sendCode: { mutate: cell.send, isPending: false }, verify: { mutate: cell.verify, isPending: false } }),
}));

import { YourAiStep } from "@/components/onboarding/YourAiStep";
import { OwnerCellVerify } from "@/components/onboarding/OwnerCellVerify";

const ORG = "org-1";
const CO = "22222222-2222-4222-8222-222222222222";
const view = (over: Record<string, unknown> = {}) => ({
  companyId: CO,
  persona: { name: null, tone: null, defaultName: "Marina" },
  switches: [{ key: "texts", group: "customers", label: "Answer customer texts", description: "", customize: null, on: false, choice: "standard" }],
  ...over,
});

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => api.setUp.mockReset());

describe("YourAiStep", () => {
  it("defaults to 'Ask me first' and turns it on with the name and tone chosen", async () => {
    api.step = { view: view(), readiness: { ownerCellConfirmed: true, hasNumber: true, pricedServices: 4, unpricedServices: 0 } };
    api.setUp.mockImplementation(async () => ({ ...(api.step as object), blueprint: { applied: true } }));
    const onDone = vi.fn();
    wrap(<YourAiStep orgId={ORG} companyId={CO} onDone={onDone} goTo={() => {}} />);
    expect(await screen.findByText(/everything it needs is in place/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask me first \(recommended\)/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByPlaceholderText("Marina"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Professional" }));
    fireEvent.click(screen.getByRole("button", { name: /turn on my ai/i }));
    await waitFor(() => expect(api.setUp).toHaveBeenCalledWith(ORG, { companyId: CO, name: "Sam", tone: "professional", autonomy: "ask_first" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("lists what's missing, each with a link to the step that fixes it", async () => {
    api.step = { view: view(), readiness: { ownerCellConfirmed: false, hasNumber: false, pricedServices: 0, unpricedServices: 3 } };
    const goTo = vi.fn();
    wrap(<YourAiStep orgId={ORG} companyId={CO} onDone={() => {}} goTo={goTo} />);
    expect(await screen.findByText(/get your number/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm your cell/i)).toBeInTheDocument();
    expect(screen.getByText(/add prices to your services/i)).toBeInTheDocument();
    const fixes = screen.getAllByRole("button", { name: /fix/i });
    fireEvent.click(fixes[0]);
    fireEvent.click(fixes[1]);
    fireEvent.click(fixes[2]);
    expect(goTo.mock.calls.map((c) => c[0])).toEqual(["phone", "business", "services"]);
  });

  it("the Turn on button waits until the current settings have loaded (never overwrites them blind)", async () => {
    api.step = new Promise(() => {}); // never resolves
    wrap(<YourAiStep orgId={ORG} companyId={CO} onDone={() => {}} goTo={() => {}} />);
    expect(screen.getByRole("button", { name: /turn on my ai/i })).toBeDisabled();
  });

  it("an owner who already chose 'On its own' sees it selected", async () => {
    api.step = {
      view: view({ persona: { name: "Sam", tone: "casual", defaultName: "Marina" }, switches: [{ key: "texts", group: "customers", label: "", description: "", customize: null, on: true, choice: "standard" }] }),
      readiness: { ownerCellConfirmed: true, hasNumber: true, pricedServices: 1, unpricedServices: 0 },
    };
    wrap(<YourAiStep orgId={ORG} companyId={CO} onDone={() => {}} goTo={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /on its own/i })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByDisplayValue("Sam")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Casual" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("OwnerCellVerify", () => {
  beforeEach(() => {
    cell.send.mockReset();
    cell.verify.mockReset();
  });

  it("a code still pending for an OLD number isn't offered: it texts the saved cell instead", () => {
    cell.view = { phone: "+17055550222", verified: false, verifiedAt: null, pendingPhone: "+17055550111", pendingExpiresAt: "2099-01-01T00:00:00Z", canManage: true };
    wrap(<OwnerCellVerify orgId={ORG} companyId={CO} onConfirmed={() => {}} onSkip={() => {}} />);
    expect(screen.queryByLabelText("Code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /text a code to \(705\) 555-0222/i }));
    expect(cell.send.mock.calls[0][0]).toBe("+17055550222");
  });

  it("a code pending for the saved cell → enter it and confirm", () => {
    cell.view = { phone: "+17055550222", verified: false, verifiedAt: null, pendingPhone: "+17055550222", pendingExpiresAt: "2099-01-01T00:00:00Z", canManage: true };
    wrap(<OwnerCellVerify orgId={ORG} companyId={CO} onConfirmed={() => {}} onSkip={() => {}} />);
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(cell.verify.mock.calls[0][0]).toBe("123456");
  });
});
