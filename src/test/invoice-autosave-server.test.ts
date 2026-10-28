/** Draft autosave on the server: one "edited" activity entry per editing session, not per save. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

let db: FakeDb;
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => db.client }));

const { updateInvoice, DRAFT_EDIT_COALESCE_MS } = await import("@/server/services/invoices/service");

const ORG = "org-1";
const CO = "co-1";
const NOW = Date.parse("2026-10-28T14:00:00Z");

function invoice(status: string) {
  return {
    id: "inv-1",
    organization_id: ORG,
    company_id: CO,
    contact_id: null,
    customer_account_id: null,
    invoice_number: status === "draft" ? null : "A1C-2026-0009",
    public_token: "t".repeat(32),
    status,
    currency: "CAD",
    title: null,
    line_items: [],
    subtotal_cents: 0,
    tax_rate_bps: 1300,
    tax_cents: 0,
    total_cents: 0,
    credit_cents: 0,
    amount_paid_cents: 0,
    pending_payment_cents: 0,
    balance_due_cents: 0,
    issue_date: status === "draft" ? null : "2026-10-06",
    due_date: null,
    payment_terms_days: 0,
    bill_to: {},
    stripe_checkout_session_id: null,
  };
}

function ctx(actor = "owner-1") {
  return { organizationId: ORG, actorProfileId: actor, supabase: db.client } as Parameters<typeof updateInvoice>[0];
}

function seed(status = "draft") {
  db = createFakeDb({
    invoices: [
      {
        ...invoice(status),
        contact_id: status === "draft" ? null : "c1",
        ...(status === "draft" ? {} : { line_items: [{ label: "Launch", description: null, quantity: 1, unitPriceCents: 50000, amountCents: 50000 }], subtotal_cents: 50000, total_cents: 56500, tax_cents: 6500, balance_due_cents: 56500 }),
      },
    ],
    companies: [{ id: CO, organization_id: ORG, name: "A1 Marine Care", invoice_settings: {} }],
    contacts: [{ id: "c1", organization_id: ORG, first_name: "Pat", email: "pat@example.com", phone: null }],
    invoice_events: [],
  });
}

const edits = () => (db.tables.invoice_events ?? []).filter((e) => e.event_type === "edited");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  seed();
});

describe("draft autosave → activity", () => {
  it("many saves of a draft by the same person record one 'edited' entry", async () => {
    await updateInvoice(ctx(), "inv-1", { title: "Shrink" });
    db.tables.invoice_events[0].created_at = new Date(NOW).toISOString();
    vi.setSystemTime(NOW + 5_000);
    await updateInvoice(ctx(), "inv-1", { title: "Shrink wrap" });
    vi.setSystemTime(NOW + 10_000);
    await updateInvoice(ctx(), "inv-1", { title: "Shrink wrap 24 ft" });
    expect(edits()).toHaveLength(1);
    expect(db.tables.invoices[0].title).toBe("Shrink wrap 24 ft");
  });

  it("a new session (after the window) or another person gets its own entry", async () => {
    db.tables.invoice_events.push({ id: "e0", organization_id: ORG, invoice_id: "inv-1", event_type: "edited", actor_profile_id: "owner-1", created_at: new Date(NOW - DRAFT_EDIT_COALESCE_MS - 1).toISOString() });
    await updateInvoice(ctx(), "inv-1", { title: "Later" });
    expect(edits()).toHaveLength(2);
    db.tables.invoice_events.at(-1)!.created_at = new Date(NOW).toISOString();
    await updateInvoice(ctx("admin-2"), "inv-1", { title: "Someone else" });
    expect(edits()).toHaveLength(3);
  });

  it("a sent invoice still records every edit (each one changes the customer's copy)", async () => {
    seed("sent");
    db.onRpc((name) => (name === "refresh_invoice_balance" ? { data: [db.tables.invoices[0]], error: null } : { data: [], error: null }));
    await updateInvoice(ctx(), "inv-1", { title: "One" });
    db.tables.invoice_events[0].created_at = new Date(NOW).toISOString();
    await updateInvoice(ctx(), "inv-1", { title: "Two" });
    expect(edits()).toHaveLength(2);
  });
});
