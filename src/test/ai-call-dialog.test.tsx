/**
 * The "Call with Everly" dialog (components/voice/AiCallDialog.tsx): instructions go to the
 * queued AI call, consent must be on file or ticked, an empty box keeps the quick follow-up call,
 * and past calls show their result with a cancel for waiting ones.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ view: null as unknown, request: vi.fn(), plain: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  fetchAiCallView: async () => api.view,
  requestAiCall: (...a: unknown[]) => api.request(...a),
  startContactCall: (...a: unknown[]) => api.plain(...a),
  cancelAiCall: (...a: unknown[]) => api.cancel(...a),
}));

import { AiCallDialog } from "@/components/voice/AiCallDialog";

const contact = { id: "ct-1", name: "Kim Lee", phone: "(705) 555-0177" };
const view = (over: Record<string, unknown> = {}) => ({ availability: "enabled", unavailableReason: null, hasPhone: true, hasConsent: false, doNotCall: false, maxChars: 1000, calls: [], ...over });

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  api.request.mockReset().mockResolvedValue({ status: "placed", message: "Calling Kim now.", salesCallId: "sc-1", runAt: "2026-11-25T15:00:00Z" });
  api.plain.mockReset().mockResolvedValue({ agentCallId: "c1", toNumber: "+17055550177" });
  api.cancel.mockReset().mockResolvedValue({ cancelled: true });
});

describe("AiCallDialog", () => {
  it("sends the instructions once the owner confirms Kim asked to be called", async () => {
    api.view = view();
    const onClose = vi.fn();
    wrap(<AiCallDialog orgId="org-1" contact={contact} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/what should .* do on this call/i), { target: { value: "Ask if she still wants the spring cleanup." } });
    const call = screen.getByRole("button", { name: /call now/i });
    await waitFor(() => expect(screen.getByText(/kim asked us to call them/i)).toBeInTheDocument());
    expect(call).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(call).toBeEnabled();
    fireEvent.click(call);
    await waitFor(() => expect(api.request).toHaveBeenCalledWith("org-1", "ct-1", { instructions: "Ask if she still wants the spring cleanup.", when: "now", customerAsked: true }));
    expect(api.plain).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("with consent on file there's no checkbox; a picked time is sent in local form", async () => {
    api.view = view({ hasConsent: true });
    wrap(<AiCallDialog orgId="org-1" contact={contact} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/what should .* do on this call/i), { target: { value: "Ask about Tuesday" } });
    fireEvent.click(screen.getByRole("radio", { name: /pick a time/i }));
    fireEvent.change(screen.getByLabelText(/call time/i), { target: { value: "2030-04-02T10:30" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /schedule call/i })).toBeEnabled());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /schedule call/i }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith("org-1", "ct-1", { instructions: "Ask about Tuesday", when: "2030-04-02 10:30", customerAsked: false }));
  });

  it("an empty box keeps the one-tap follow-up call", async () => {
    api.view = view();
    wrap(<AiCallDialog orgId="org-1" contact={contact} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /call now/i }));
    await waitFor(() => expect(api.plain).toHaveBeenCalled());
    expect(api.request).not.toHaveBeenCalled();
  });

  it("blocks do-not-call and shows past calls with a cancel for a waiting one", async () => {
    api.view = view({
      doNotCall: true,
      calls: [{ id: "sc-9", status: "scheduled", reason: "owner_request", runAt: "2030-04-02T14:30:00Z", createdAt: "2030-04-01T12:00:00Z", instructions: "Ask about Tuesday", result: null }],
    });
    wrap(<AiCallDialog orgId="org-1" contact={contact} onClose={() => {}} />);
    expect(await screen.findByText(/on your do-not-call list/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /call now/i })).toBeDisabled();
    expect(screen.getByText(/“Ask about Tuesday”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel this call/i }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith("org-1", "ct-1", "sc-9"));
  });
});
