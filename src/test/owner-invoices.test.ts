/**
 * Invoices by voice (owner-channel/invoice-tools.ts, docs/owner-line.md → "Invoices"):
 * drafts and new customers are made straight away (internal, nobody is told); sending is a
 * code-confirmed owner command, re-checked when the code comes back. Everything is scoped to
 * the run's own business, and the real invoice service does the money.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  createInvoiceFromBooking: vi.fn(),
  createInvoiceFromQuote: vi.fn(),
  sendInvoice: vi.fn(),
  createContact: vi.fn(),
  loadBusinessFacts: vi.fn(),
}));
vi.mock("@/server/services/invoices/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/invoices/service")>()),
  createInvoice: h.createInvoice,
  updateInvoice: h.updateInvoice,
  createInvoiceFromBooking: h.createInvoiceFromBooking,
  createInvoiceFromQuote: h.createInvoiceFromQuote,
  sendInvoice: h.sendInvoice,
}));
vi.mock("@/server/services/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/contacts")>()),
  createContact: h.createContact,
}));
vi.mock("@/server/services/sms-agent/facts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/sms-agent/facts")>()),
  loadBusinessFacts: h.loadBusinessFacts,
}));
vi.mock("@/server/services/usage", () => ({ recordUsageSafe: vi.fn(), recordAiUsageSafe: vi.fn() }));

import type { ModelClient } from "@/server/agent/runtime";
import { runOwnerCommandAgent } from "@/server/services/owner-channel/agent";
import {
  addCustomer,
  draftInvoice,
  draftInvoices,
  INVOICE_TOOL_NAMES,
  money,
  priceList,
  readLines,
  sendChannels,
  sendInvoiceTool,
  toCents,
} from "@/server/services/owner-channel/invoice-tools";
import { executeOwnerCommand, OWNER_COMMAND_KIND } from "@/server/services/owner-channel/owner-commands";
import { proposalTarget, type ToolRunState } from "@/server/services/owner-channel/tools";
import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const CO = "22222222-2222-4222-8222-222222222222";
const OTHER_CO = "33333333-3333-4333-8333-333333333333";
const DAVE = "44444444-4444-4444-8444-444444444444";
const NOEMAIL = "55555555-5555-4555-8555-555555555555";
const STRANGER = "66666666-6666-4666-8666-666666666666";
const INV = "77777777-7777-4777-8777-777777777777";
const SENT_INV = "88888888-8888-4888-8888-888888888888";
const OTHER_INV = "99999999-1111-4111-8111-999999999999";
const PAT_INV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VOID_INV = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NO_LINES_INV = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const BOOKING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "+17055296157";
const NOW = Date.parse("2026-11-15T15:00:00Z");

function invoiceRow(over: Record<string, unknown> = {}) {
  return {
    id: INV,
    organization_id: ORG,
    company_id: CO,
    contact_id: DAVE,
    customer_account_id: null,
    invoice_number: null,
    status: "draft",
    line_items: [
      { label: "Shrink wrap, 24 ft Sea Ray", description: null, quantity: 1, unitPriceCents: 75000, amountCents: 75000 },
      { label: "Mast support", description: null, quantity: 1, unitPriceCents: 12000, amountCents: 12000 },
    ],
    subtotal_cents: 87000,
    tax_rate_bps: 1300,
    tax_cents: 11310,
    total_cents: 98310,
    credit_cents: 20000,
    balance_due_cents: 78310,
    bill_to: {},
    created_at: "2026-11-15T14:00:00Z",
    ...over,
  };
}

let db: FakeDb;
function seed() {
  db = createFakeDb({
    contacts: [
      { id: DAVE, organization_id: ORG, company_id: CO, first_name: "Dave", last_name: "Miller", phone: "+17055550123", phone_last10: "7055550123", email: "dave@example.com" },
      { id: NOEMAIL, organization_id: ORG, company_id: CO, first_name: "Pat", last_name: "Old", phone: "+17055550124", phone_last10: "7055550124", email: null },
      { id: STRANGER, organization_id: ORG, company_id: OTHER_CO, first_name: "Other", last_name: "Business", phone: null, phone_last10: null, email: null },
    ],
    invoices: [
      invoiceRow(),
      invoiceRow({ id: SENT_INV, status: "sent", invoice_number: "INV-0041", created_at: "2026-11-01T00:00:00Z" }),
      invoiceRow({ id: OTHER_INV, company_id: OTHER_CO }),
    ],
    bookings: [{ id: BOOKING, organization_id: ORG, company_id: CO, contact_id: DAVE, status: "completed", scheduled_for: "2026-11-10T14:00:00Z", title: "Shrink wrap" }],
    quotes: [{ id: QUOTE, organization_id: ORG, company_id: CO, status: "approved" }],
    companies: [{ id: CO, organization_id: ORG, name: "A1 Marine Care", timezone: "America/Toronto" }],
    owner_approvals: [],
  });
}
const state = (): ToolRunState => ({ admin: db.client as never, scope: { organizationId: ORG, companyId: CO, companyName: "A1 Marine Care", timeZone: "America/Toronto" }, ownerPhone: OWNER, nowMs: NOW, confirmation: null, actions: [] });

beforeEach(() => {
  seed();
  for (const fn of Object.values(h)) fn.mockReset();
  h.createInvoice.mockImplementation(async (_ctx, input) => invoiceRow({ id: "new-inv", contact_id: input.contactId }));
  h.updateInvoice.mockImplementation(async (_ctx, id) => invoiceRow({ id, credit_cents: 0, balance_due_cents: 98310 }));
  h.createInvoiceFromBooking.mockResolvedValue(invoiceRow({ id: "from-booking", booking_id: BOOKING }));
  h.createInvoiceFromQuote.mockResolvedValue(invoiceRow({ id: "from-quote", quote_id: QUOTE }));
  h.createContact.mockImplementation(async (_ctx, input) => ({ id: "new-contact", first_name: input.firstName, last_name: input.lastName, phone: input.phone, email: input.email }));
  h.loadBusinessFacts.mockResolvedValue({
    priceList: [
      { key: "wrap", label: "Shrink wrap", description: "Per foot, includes vents", pricingType: "per_unit", unitLabel: "foot", rateCents: 2500, minimumCents: 50000, priceText: "$25 per foot", needsMeasure: true, choices: [] },
      { key: "detail", label: "Full detail", description: null, pricingType: "flat", unitLabel: null, rateCents: 45000, minimumCents: 0, priceText: "$450", needsMeasure: false, choices: [] },
    ],
  });
});

describe("pure helpers", () => {
  it("money and cents", () => {
    expect(money(78310)).toBe("$783.10");
    expect(money(75000)).toBe("$750");
    expect(money(123456789)).toBe("$1,234,567.89");
    expect(toCents("$1,234.50")).toBe(123450);
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0)).toBe(0);
    expect(toCents(-5)).toBeNull();
    expect(toCents("abc")).toBeNull();
    expect(toCents(5_000_000)).toBeNull();
  });

  it("lines: description and price required, quantity defaults to 1, problems are said plainly", () => {
    expect(readLines([{ description: "Shrink wrap", unit_price: 750 }, { description: "Wrap per foot", quantity: 24, unit_price: 25 }])).toEqual({
      lines: [
        { label: "Shrink wrap", description: null, quantity: 1, unitPriceCents: 75000 },
        { label: "Wrap per foot", description: null, quantity: 24, unitPriceCents: 2500 },
      ],
    });
    expect(readLines([])).toEqual({ problem: expect.stringContaining("at least one item") });
    expect(readLines([{ description: "Mast support" }])).toEqual({ problem: 'What\'s the price for "Mast support"?' });
    expect(readLines([{ unit_price: 5 }])).toEqual({ problem: "Line 1 needs a description." });
    expect(readLines([{ description: "x", quantity: -1, unit_price: 5 }])).toEqual({ problem: 'How many for "x"?' });
  });

  it("how to send: email first, text if that's all there is, and a plain answer when it can't", () => {
    expect(sendChannels(undefined, { email: "a@b.co", phone: "+1" })).toEqual({ email: true, sms: false });
    expect(sendChannels(undefined, { email: null, phone: "+1" })).toEqual({ email: false, sms: true });
    expect(sendChannels("both", { email: "a@b.co", phone: "+1" })).toEqual({ email: true, sms: true });
    expect(sendChannels("email", { email: null, phone: "+1" })).toEqual({ problem: expect.stringContaining("no email") });
    expect(sendChannels(undefined, { email: null, phone: null })).toEqual({ problem: expect.stringContaining("no email or phone") });
  });
});

describe("draft_invoice", () => {
  it("makes a draft for a customer of this business with the real invoice service, and reads back every line", async () => {
    const s = state();
    const out = await draftInvoice(s, { contact_id: DAVE, lines: [{ description: "Shrink wrap, 24 ft Sea Ray", unit_price: 750 }, { description: "Mast support", unit_price: "120" }], deposit_paid: 200 });
    expect(h.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      expect.objectContaining({
        companyId: CO,
        contactId: DAVE,
        creditCents: 20000,
        lines: [
          { label: "Shrink wrap, 24 ft Sea Ray", description: null, quantity: 1, unitPriceCents: 75000 },
          { label: "Mast support", description: null, quantity: 1, unitPriceCents: 12000 },
        ],
      }),
    );
    expect(out).toMatchObject({ customer: "Dave Miller", status: "draft", subtotal: "$870", tax: "$113.10 (13%)", total: "$983.10", deposit_or_credit: "$200", balance_owing: "$783.10", ready_to_send: true });
    expect(out.lines).toEqual([
      { item: "Shrink wrap, 24 ft Sea Ray", quantity: 1, each: "$750", amount: "$750" },
      { item: "Mast support", quantity: 1, each: "$120", amount: "$120" },
    ]);
    expect(s.actions).toEqual([{ tool: "draft_invoice", ok: true, detail: { invoiceId: "new-inv" } }]);
    expect(s.confirmation).toBeNull();
  });

  it("refuses a missing price, a missing customer, or another business's customer: nothing is made", async () => {
    expect(await draftInvoice(state(), { contact_id: DAVE, lines: [{ description: "Mast support" }] })).toEqual({ error: 'What\'s the price for "Mast support"?' });
    expect((await draftInvoice(state(), { lines: [{ description: "x", unit_price: 1 }] })).error).toContain("Who's the invoice for?");
    expect((await draftInvoice(state(), { contact_id: STRANGER, lines: [{ description: "x", unit_price: 1 }] })).error).toContain("can't find that customer");
    expect((await draftInvoice(state(), { contact_id: DAVE, lines: [{ description: "x", unit_price: 1 }], deposit_paid: "lots" })).error).toBe("How much was the deposit?");
    expect(h.createInvoice).not.toHaveBeenCalled();
  });

  it("revises only a draft of this business; a sent invoice or another business's is left alone", async () => {
    const out = await draftInvoice(state(), { invoice_id: INV, lines: [{ description: "Shrink wrap", unit_price: 800 }], deposit_paid: 0 });
    expect(h.updateInvoice).toHaveBeenCalledWith(expect.anything(), INV, { lines: [{ label: "Shrink wrap", description: null, quantity: 1, unitPriceCents: 80000 }], creditCents: 0 });
    expect(out.invoice_id).toBe(INV);
    expect((await draftInvoice(state(), { invoice_id: SENT_INV, deposit_paid: 0 })).error).toContain("already sent (INV-0041)");
    expect((await draftInvoice(state(), { invoice_id: OTHER_INV, deposit_paid: 0 })).error).toContain("can't find that invoice");
    expect(h.updateInvoice).toHaveBeenCalledTimes(1);
  });

  it("from a job or an approved quote of this business, with a deposit added after", async () => {
    await draftInvoice(state(), { from_booking_id: BOOKING, deposit_paid: 100 });
    expect(h.createInvoiceFromBooking).toHaveBeenCalledWith(expect.anything(), BOOKING);
    expect(h.updateInvoice).toHaveBeenCalledWith(expect.anything(), "from-booking", { creditCents: 10000 });
    await draftInvoice(state(), { from_quote_id: QUOTE });
    expect(h.createInvoiceFromQuote).toHaveBeenCalledWith(expect.anything(), QUOTE);
    expect((await draftInvoice(state(), { from_booking_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })).error).toContain("can't find that job");
  });

  it("the invoice service's own message comes through (e.g. already invoiced); anything else is a plain failure", async () => {
    const { InvoiceConflictError } = await import("@/server/services/invoices/errors");
    h.createInvoiceFromBooking.mockRejectedValueOnce(new InvoiceConflictError("This booking is already invoiced."));
    const { INVOICE_TOOLS } = await import("@/server/services/owner-channel/invoice-tools");
    const tool = INVOICE_TOOLS.find((t) => t.tool.name === "draft_invoice");
    expect(await tool?.run(state(), { from_booking_id: BOOKING })).toEqual({ error: "This booking is already invoiced." });
    h.createInvoice.mockRejectedValueOnce(new Error("connection reset"));
    expect(await tool?.run(state(), { contact_id: DAVE, lines: [{ description: "x", unit_price: 1 }] })).toEqual({ error: "That didn't work on our side. Nothing was sent." });
  });
});

describe("add_customer, price_list, draft_invoices", () => {
  it("adds a new customer without any automation, and never duplicates someone already here", async () => {
    const out = await addCustomer(state(), { first_name: "Jen", last_name: "Park", phone: "705 555 0199", email: "jen at example dot com" });
    expect(h.createContact).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      expect.objectContaining({ companyId: CO, firstName: "Jen", lastName: "Park", phone: "+17055550199", email: "jen@example.com", stage: "active" }),
      { dispatchWorkflow: false },
    );
    expect(out).toMatchObject({ contact_id: "new-contact", added: true });
    expect(await addCustomer(state(), { first_name: "David", phone: "(705) 555-0123" })).toMatchObject({ contact_id: DAVE, already_a_customer: true });
    expect(await addCustomer(state(), { first_name: "Dave", email: "DAVE@example.com" })).toMatchObject({ contact_id: DAVE, already_a_customer: true });
    expect((await addCustomer(state(), { first_name: "Jen", phone: "555" })).error).toContain("phone number doesn't look right");
    expect(h.createContact).toHaveBeenCalledTimes(1);
  });

  it("price list: matches by words, prices before tax", async () => {
    const out = await priceList(state(), { query: "shrink wrap" });
    expect(out.items).toEqual([{ item: "Shrink wrap", price: "$25 per foot", rate: "$25", per: "foot", minimum: "$500", needs_a_measurement: true }]);
    expect(((await priceList(state(), {})).items as unknown[]).length).toBe(2);
  });

  it("draft_invoices lists this business's drafts only", async () => {
    const out = await draftInvoices(state());
    expect(out.drafts).toEqual([{ invoice_id: INV, customer: "Dave Miller", total: "$983.10", balance_owing: "$783.10", items: ["Shrink wrap, 24 ft Sea Ray", "Mast support"] }]);
  });
});

describe("send_invoice", () => {
  it("proposes; nothing is sent until the code; the summary says who, what, how much and how", async () => {
    const s = state();
    const out = await sendInvoiceTool(s, { invoice_id: INV });
    expect(out).toMatchObject({ proposed: true, how: "by email to dave@example.com", balance_owing: "$783.10" });
    expect(h.sendInvoice).not.toHaveBeenCalled();
    expect(s.confirmation).toMatchObject({ kind: OWNER_COMMAND_KIND, contact_id: DAVE });
    expect(s.confirmation?.summary).toBe("Send Dave Miller's invoice (Shrink wrap, 24 ft Sea Ray, Mast support; total $983.10, $783.10 owing) by email to dave@example.com?");
    expect(s.confirmation?.payload).toMatchObject({ action: "send_invoice", invoiceId: INV, email: true, sms: false, totalCents: 98310 });
    expect(s.confirmationCode).toMatch(/^\d{4}$/);
  });

  it("text when there's no email, both when asked; a channel that isn't on file is said plainly", async () => {
    const draftForPat = invoiceRow({ id: PAT_INV, contact_id: NOEMAIL });
    db.tables.invoices.push(draftForPat);
    expect((await sendInvoiceTool(state(), { invoice_id: PAT_INV })).error).toBeUndefined();
    expect((await sendInvoiceTool(state(), { invoice_id: PAT_INV })).how).toBe("by text to +17055550124");
    expect((await sendInvoiceTool(state(), { invoice_id: PAT_INV, by: "email" })).error).toContain("no email on file");
    expect((await sendInvoiceTool(state(), { invoice_id: INV, by: "both" })).how).toBe("by email to dave@example.com and by text to +17055550123");
  });

  it("refuses another business's invoice, a void or paid one, and one that isn't ready", async () => {
    expect((await sendInvoiceTool(state(), { invoice_id: OTHER_INV })).error).toContain("can't find that invoice");
    db.tables.invoices.push(invoiceRow({ id: VOID_INV, status: "void" }), invoiceRow({ id: NO_LINES_INV, line_items: [], total_cents: 0 }));
    expect((await sendInvoiceTool(state(), { invoice_id: VOID_INV })).error).toBe("That invoice is void.");
    expect((await sendInvoiceTool(state(), { invoice_id: NO_LINES_INV })).error).toContain("add at least one line");
  });

  it("asking again for the same invoice replaces the earlier code", () => {
    expect(proposalTarget({ action: "send_invoice", invoiceId: INV })).toBe(`invoice:${INV}`);
  });
});

describe("the confirmed send (owner-commands.ts)", () => {
  const approval = (payload: Record<string, unknown>, over: Record<string, unknown> = {}) =>
    ({ id: "appr-1", organization_id: ORG, company_id: CO, kind: OWNER_COMMAND_KIND, payload: { action: "send_invoice", invoiceId: INV, email: true, sms: false, who: "Dave Miller", totalCents: 98310, balanceCents: 78310, ...payload }, ...over }) as never;

  it("sends exactly what was confirmed, through the invoice service", async () => {
    h.sendInvoice.mockResolvedValue({ invoice: invoiceRow({ status: "sent", invoice_number: "INV-0042" }), email: { delivered: true, reason: null }, sms: null, copy: null, publicUrl: "https://x/i/t" });
    const out = await executeOwnerCommand(db.client as never, approval({}), { approved: true } as never);
    expect(h.sendInvoice).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG }), INV, { email: true, sms: false });
    expect(out).toEqual({ ok: true, message: "Sent INV-0042 to Dave Miller by email.", detail: { invoiceId: INV, invoiceNumber: "INV-0042" } });
  });

  it("an invoice changed after confirming, void, paid, gone or in another business: nothing is sent", async () => {
    const run = (payload: Record<string, unknown>, over: Record<string, unknown> = {}) => executeOwnerCommand(db.client as never, approval(payload, over), { approved: true } as never);
    expect((await run({ totalCents: 50000 })).message).toContain("changed after you confirmed");
    db.tables.invoices.push(invoiceRow({ id: "void-inv", status: "void" }), invoiceRow({ id: "paid-inv", status: "paid" }));
    expect((await run({ invoiceId: "void-inv" })).message).toContain("voided");
    expect((await run({ invoiceId: "paid-inv" })).message).toContain("already paid");
    expect((await run({ invoiceId: OTHER_INV })).message).toContain("couldn't find");
    expect((await run({}, { organization_id: OTHER_ORG })).ok).toBe(false);
    expect(h.sendInvoice).not.toHaveBeenCalled();
  });

  it("declined: nothing sent", async () => {
    expect(await executeOwnerCommand(db.client as never, approval({}), { approved: false } as never)).toEqual({ ok: true, message: "OK, left it as is." });
    expect(h.sendInvoice).not.toHaveBeenCalled();
  });

  it("issued but the delivery failed: says so, and how to fix it", async () => {
    h.sendInvoice.mockResolvedValue({ invoice: invoiceRow({ status: "sent", invoice_number: "INV-0042" }), email: { delivered: false, reason: "bounced" }, sms: null, copy: null, publicUrl: "https://x/i/t" });
    const out = await executeOwnerCommand(db.client as never, approval({}), { approved: true } as never);
    expect(out).toMatchObject({ ok: false, message: "INV-0042 is issued to Dave Miller, but the email didn't go through. Resend it from the app." });
  });
});

describe("on the owner line only", () => {
  it("the owner agent offers the invoice tools to the assistant, not to the owner-by-text agent", async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      const seen: string[][] = [];
      const client: ModelClient = {
        createMessage: async (params) => {
          seen.push((params.tools ?? []).map((t) => t.name));
          return { id: "m", model: "m", role: "assistant", type: "message", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: "OK.", citations: null }], usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;
        },
      };
      const input = { admin: db.client as never, scope: { organizationId: ORG, companyId: CO, companyName: "A1 Marine Care", timeZone: "America/Toronto" }, ownerPhone: OWNER, body: "invoice Dave", nowMs: NOW, client };
      await runOwnerCommandAgent(input);
      await runOwnerCommandAgent({ ...input, assistant: true });
      expect(seen[0].filter((n) => (INVOICE_TOOL_NAMES as readonly string[]).includes(n))).toEqual([]);
      expect(seen[1]).toEqual(expect.arrayContaining([...INVOICE_TOOL_NAMES]));
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
    }
  });
});
