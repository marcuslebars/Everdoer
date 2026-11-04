/**
 * The self-serve Phone step (components/onboarding/PhoneModeStep.tsx): one number for everything.
 * Before: one "Get my number" button (no either/or choice). After: the number, who answers it,
 * and the forwarding steps for the owner's kind of phone.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  status: null as unknown,
  setUp: vi.fn(),
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  getBusinessNumber: async () => api.status,
  setUpBusinessNumber: (...args: unknown[]) => api.setUp(...args),
  getForwardingVerification: async () => ({ verified: false, verifiedAt: null, latest: null, canTest: true, businessLinePretty: "(705) 555-0111" }),
}));
vi.mock("@/lib/api-hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-hooks")>()),
  useDashboardActivity: () => ({ data: [] }),
}));

import { PhoneModeStep } from "@/components/onboarding/PhoneModeStep";

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}
const ORG = "org-1";
const CO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  api.setUp.mockReset();
});

describe("PhoneModeStep (one number)", () => {
  it("no number yet: one button, no 'AI receptionist vs catcher' choice; it sends the typed area code", async () => {
    api.status = { configured: true, number: null, answering: "voicemail", receptionistIncluded: false, dedicatedLine: false, dedicatedLineAllowed: false, textsOn: false, forwardingVerifiedAt: null };
    api.setUp.mockResolvedValue({ phoneNumber: "+17055550199", phoneNumberPretty: "(705) 555-0199", purchased: true, answering: "message", receptionist: "not_included", answeringTurnedOn: true });
    wrap(<PhoneModeStep orgId={ORG} companyId={CO} stepData={{}} onDone={() => {}} aiStep={<p>dedicated line setup</p>} />);
    const button = await screen.findByRole("button", { name: /get my number/i });
    expect(screen.queryByText(/missed-call catcher \(no ai\)/i)).toBeNull();
    expect(screen.queryByText(/separate AI phone line/i)).toBeNull(); // not Front Desk, no dedicated line
    fireEvent.change(screen.getByPlaceholderText(/same as your business phone/i), { target: { value: "416" } });
    fireEvent.click(button);
    await waitFor(() => expect(api.setUp).toHaveBeenCalledWith(ORG, { companyId: CO, areaCode: 416 }));
  });

  it("with a number: shows it, who answers, and the dial code for a cell; a landline gets the provider steps", async () => {
    api.status = {
      configured: true,
      number: { phoneNumber: "+17055550199", phoneNumberPretty: "(705) 555-0199" },
      answering: "receptionist",
      receptionistIncluded: true,
      dedicatedLine: false,
      dedicatedLineAllowed: true,
      textsOn: true,
      forwardingVerifiedAt: null,
    };
    wrap(<PhoneModeStep orgId={ORG} companyId={CO} stepData={{}} onDone={() => {}} aiStep={<p>dedicated line setup</p>} />);
    expect(await screen.findByText("(705) 555-0199")).toBeInTheDocument();
    expect(screen.getByText(/AI receptionist answers: it quotes/i)).toBeInTheDocument();
    expect(screen.getByText(/your AI replies, and asks you/i)).toBeInTheDocument();
    const code = screen.getByRole("link", { name: "**004*+17055550199#" });
    expect(code).toHaveAttribute("href", "tel:**004*+17055550199%23");
    fireEvent.click(screen.getByRole("button", { name: "A landline" }));
    expect(screen.queryByRole("link", { name: /\*\*004/ })).toBeNull();
    expect(screen.getAllByText(/call forward no answer/i).length).toBeGreaterThan(0);
    // Front Desk: the dedicated-line option is there, tucked under Advanced.
    expect(screen.getByText(/separate AI phone line/i)).toBeInTheDocument();
  });
});
