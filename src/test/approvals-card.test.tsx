/** Dashboard Approvals card: pending with Approve / Skip, recent decisions, hidden when empty. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { ApprovalsCard } from "@/components/approvals/ApprovalsCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const pending = {
  id: "a-1", companyId: "co-1", companyName: "Northshore", contactId: null, kind: "send_quote",
  summary: "Quote for Dana: $650 seasonal contract.", status: "pending", shortCode: 1,
  createdAt: new Date().toISOString(), expiresAt: null, decidedAt: null, decidedVia: null, resultMessage: null,
};

const waiting = {
  approvalId: "a-9", companyId: "co-1", companyName: "Northshore", contactId: "c-9", contactName: "(705) 555-0148", kind: "send_reply",
  summary: 'OK to text them exactly this? "Drain cleaning is $225 + HST."', draftReply: "Drain cleaning is $225 + HST.",
  waitingSince: new Date(Date.now() - 2 * 86_400_000).toISOString(),
};

beforeEach(() => {
  apiFetch.mockReset();
  window.localStorage.clear();
});

describe("ApprovalsCard", () => {
  it("lists pending items and approves through the decide route", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve({ outcome: "done", message: "Sent the $650 quote to Dana." });
      return Promise.resolve({ pending: [pending], recent: [{ ...pending, id: "a-0", status: "rejected", decidedVia: "sms", decidedAt: new Date().toISOString(), summary: "Book Sam." }] });
    });
    wrap(<ApprovalsCard orgId="org-1" />);
    expect(await screen.findByText("Quote for Dana: $650 seasonal contract.")).toBeInTheDocument();
    expect(screen.getByText(/Skipped by text/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(screen.getByText("Sent the $650 quote to Dana.")).toBeInTheDocument());
    expect(apiFetch).toHaveBeenCalledWith("/api/organizations/org-1/approvals/a-1/decide", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approve" }) }));
    expect(document.body.textContent).not.toMatch(/EmpireVu/);
  });

  it("keeps a customer whose request expired unanswered in front of the owner", async () => {
    apiFetch.mockResolvedValue({ pending: [], recent: [{ ...pending, id: "a-9", status: "expired", decidedVia: "expiry", decidedAt: new Date().toISOString() }], waiting: [waiting] });
    wrap(<ApprovalsCard orgId="org-1" />);
    expect(await screen.findByText("(705) 555-0148 is still waiting for an answer")).toBeInTheDocument();
    // The card must not claim the owner is clear while a customer is waiting.
    expect(screen.queryByText("Nothing waiting on you.")).not.toBeInTheDocument();
    // The AI's draft is ready, so the action is to review and send it from their conversation.
    expect(screen.getByRole("link", { name: /review & send/i })).toHaveAttribute("href", "/inbox?contact=c-9");
  });

  it("'Handled' clears a waiting customer on this device (the owner phoned them)", async () => {
    apiFetch.mockResolvedValue({ pending: [], recent: [], waiting: [{ ...waiting, draftReply: null }] });
    const { container } = wrap(<ApprovalsCard orgId="org-1" />);
    expect(await screen.findByRole("link", { name: /^reply$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /handled/i }));
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(JSON.parse(window.localStorage.getItem("everdoer_waiting_handled") ?? "[]")).toEqual(["a-9"]);
  });

  it("an API build without the waiting list still renders", async () => {
    apiFetch.mockResolvedValue({ pending: [pending], recent: [] });
    wrap(<ApprovalsCard orgId="org-1" />);
    expect(await screen.findByText("Quote for Dana: $650 seasonal contract.")).toBeInTheDocument();
  });

  it("renders nothing when there's nothing to show", async () => {
    apiFetch.mockResolvedValue({ pending: [], recent: [] });
    const { container } = wrap(<ApprovalsCard orgId="org-1" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
