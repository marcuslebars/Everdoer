/** The invoice editor saves drafts by itself and keeps a copy on this device (docs/invoicing.md → "Autosave"). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const ApiErrorMock = vi.hoisted(
  () =>
    class ApiError extends Error {
      constructor(
        public readonly status: number,
        message: string,
      ) {
        super(message);
      }
    },
);
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  apiAuthHeaders: () => ({}),
  resolveApiUrl: (p: string) => p,
  ApiError: ApiErrorMock,
}));
vi.mock("@/lib/org-context", () => ({ useOrg: () => ({ organizationId: "org-1", companyId: "co-1" }) }));
vi.mock("@/lib/api-hooks", () => ({
  useCompanies: () => ({ data: [{ id: "co-1", name: "A1 Marine Care" }] }),
  useCRMContacts: () => ({ data: { rows: { items: [] } }, isFetching: false }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast }));

import { InvoiceEditorDialog } from "@/components/invoices/InvoiceEditorDialog";
import type { Invoice } from "@/lib/invoices-api";

const BASE = "/api/organizations/org-1/invoices";

function invoiceRow(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    organization_id: "org-1",
    company_id: "co-1",
    contact_id: null,
    customer_account_id: null,
    invoice_number: null,
    status: "draft",
    title: null,
    line_items: [],
    tax_rate_bps: 1300,
    credit_cents: 0,
    payment_terms_days: 0,
    due_date: null,
    issue_date: null,
    notes: null,
    internal_notes: null,
    bill_to: { name: "", address: null },
    updated_at: "2026-10-28T12:00:00Z",
    ...over,
  } as Invoice;
}

type Call = { path: string; method: string; body: Record<string, unknown> | null };
const calls = (): Call[] =>
  apiFetch.mock.calls.map(([path, init]) => ({ path: String(path), method: (init as RequestInit | undefined)?.method ?? "GET", body: (init as RequestInit | undefined)?.body ? JSON.parse(String((init as RequestInit).body)) : null }));
const writes = () => calls().filter((c) => c.method !== "GET");

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  apiFetch.mockReset();
  for (const fn of Object.values(toast)) fn.mockReset();
  apiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return Promise.resolve([]);
    if (init.method === "POST" && path === BASE) return Promise.resolve(invoiceRow({ id: "inv-new" }));
    return Promise.resolve(invoiceRow({ id: path.split("/").pop() }));
  });
});
afterEach(() => vi.useRealTimers());

describe("invoice editor autosave", () => {
  it("a new invoice: nothing is saved until it has content; then it becomes a draft and later changes update it", async () => {
    wrap(<InvoiceEditorDialog onClose={vi.fn()} onSaved={vi.fn()} autosaveDelayMs={30} />);
    await new Promise((r) => setTimeout(r, 120));
    expect(writes()).toEqual([]);

    fireEvent.change(screen.getByPlaceholderText("e.g., Winter storage 2026/27"), { target: { value: "Winter storage" } });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ path: BASE, method: "POST", body: { companyId: "co-1", title: "Winter storage", lines: [] } });
    await waitFor(() => expect(screen.getByTestId("autosave-status")).toHaveTextContent(/Draft saved/));

    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "Shrink wrap — 24 ft" } });
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toMatchObject({ path: `${BASE}/inv-new`, method: "PATCH" });
    expect((writes()[1].body?.lines as Array<{ label: string }>)[0].label).toBe("Shrink wrap — 24 ft");
  });

  it("closing (Escape / click outside / Close) saves the last change first, then says where the draft went", async () => {
    const onClose = vi.fn();
    wrap(<InvoiceEditorDialog onClose={onClose} onSaved={vi.fn()} autosaveDelayMs={60_000} />);
    fireEvent.change(screen.getByPlaceholderText("e.g., Winter storage 2026/27"), { target: { value: "Gelcoat repair" } });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ method: "POST", body: { title: "Gelcoat repair" } });
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Draft saved/));
  });

  it("editing a draft autosaves to it; the explicit Save goes to the same invoice (never a second draft)", async () => {
    const onSaved = vi.fn();
    wrap(<InvoiceEditorDialog invoice={invoiceRow({ title: "Old" })} onClose={vi.fn()} onSaved={onSaved} autosaveDelayMs={30} />);
    fireEvent.change(screen.getByDisplayValue("Old"), { target: { value: "New title" } });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ path: `${BASE}/inv-1`, method: "PATCH", body: { title: "New title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(writes().every((w) => w.method === "PATCH" && w.path === `${BASE}/inv-1`)).toBe(true);
  });

  it("server unreachable: says so, keeps a copy on this device, and offers it back next time", async () => {
    apiFetch.mockImplementation((_path: string, init?: RequestInit) => (init?.method && init.method !== "GET" ? Promise.reject(new Error("Failed to fetch")) : Promise.resolve([])));
    const old = invoiceRow({ title: "Old", updated_at: "2026-01-01T00:00:00Z" });
    const view = wrap(<InvoiceEditorDialog invoice={old} onClose={vi.fn()} onSaved={vi.fn()} autosaveDelayMs={30} />);
    fireEvent.change(screen.getByDisplayValue("Old"), { target: { value: "Typed while offline" } });
    await waitFor(() => expect(screen.getByTestId("autosave-status")).toHaveTextContent(/Couldn.t reach the server/));
    await waitFor(() => expect(window.localStorage.getItem("everdoer_invoice_draft:org-1:inv-1")).toContain("Typed while offline"));
    view.unmount();

    apiFetch.mockImplementation(() => Promise.resolve([]));
    wrap(<InvoiceEditorDialog invoice={old} onClose={vi.fn()} onSaved={vi.fn()} autosaveDelayMs={60_000} />);
    expect(screen.getByText(/Unsaved changes from .* were found on this device/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByDisplayValue("Typed while offline")).toBeInTheDocument();
  });

  it("the server refusing a draft (4xx) shows its reason and isn't retried until the next change", async () => {
    apiFetch.mockImplementation((_path: string, init?: RequestInit) =>
      init?.method && init.method !== "GET" ? Promise.reject(new ApiErrorMock(400, "The invoice total can't be negative.")) : Promise.resolve([]),
    );
    wrap(<InvoiceEditorDialog invoice={invoiceRow({ title: "Old" })} onClose={vi.fn()} onSaved={vi.fn()} autosaveDelayMs={30} />);
    fireEvent.change(screen.getByDisplayValue("Old"), { target: { value: "Discount" } });
    await waitFor(() => expect(screen.getByTestId("autosave-status")).toHaveTextContent("Not saved yet: The invoice total can't be negative."));
    const n = writes().length;
    await new Promise((r) => setTimeout(r, 300));
    expect(writes()).toHaveLength(n);
  });

  it("a sent invoice is never autosaved; its edits are kept on this device until saved", async () => {
    const sent = invoiceRow({ status: "sent", invoice_number: "A1C-2026-0009", contact_id: "c1", title: "Spring launch", bill_to: { name: "Pat", address: null } as Invoice["bill_to"] });
    const view = wrap(<InvoiceEditorDialog invoice={sent} onClose={vi.fn()} onSaved={vi.fn()} autosaveDelayMs={30} />);
    fireEvent.change(screen.getByDisplayValue("Spring launch"), { target: { value: "Spring launch + bottom paint" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(writes()).toEqual([]);
    expect(screen.getByTestId("autosave-status")).toHaveTextContent(/kept on this device/);
    expect(window.localStorage.getItem("everdoer_invoice_draft:org-1:inv-1")).toContain("bottom paint");
    view.unmount();
    expect(writes()).toEqual([]);
  });

  it("an older copy than the server's is not offered", async () => {
    window.localStorage.setItem(
      "everdoer_invoice_draft:org-1:inv-1",
      JSON.stringify({ form: { companyId: "co-1", customerType: "person", contactId: null, contactLabel: "", accountId: "", title: "Stale", lines: [], taxPct: "13", credit: "", terms: "0", dueDate: "", notes: "", internalNotes: "", billToAddress: "" }, savedAt: Date.parse("2026-10-28T11:00:00Z"), invoiceId: null }),
    );
    await act(async () => {
      wrap(<InvoiceEditorDialog invoice={invoiceRow({ title: "Current" })} onClose={vi.fn()} onSaved={vi.fn()} />);
    });
    expect(screen.queryByText(/were found on this device/)).toBeNull();
  });
});
