/**
 * The owner's assistant, beyond one business and one question (docs/owner-line.md):
 *   • the brief — the owner's own notes in every call's prompt, stored with their data;
 *   • switching business — only among the caller's OWN businesses in the same organization;
 *   • the day-to-day tools — new leads, open quotes, money owed, the briefing (read-only, and
 *     only on the owner line, so the owner-by-text agent is unchanged).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  catcherTenant: null as { organizationId: string; companyId: string } | null,
  recordTurn: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/twilio/missed-call", () => ({ resolveCatcherTenant: async () => h.catcherTenant }));
vi.mock("@/server/agent/memory", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/agent/memory")>()), recordTurn: h.recordTurn }));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/server/services/usage", () => ({ recordUsageSafe: vi.fn(), recordAiUsageSafe: vi.fn() }));

import type Anthropic from "@anthropic-ai/sdk";

import type { ModelClient } from "@/server/agent/runtime";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { runOwnerCommandAgent } from "@/server/services/owner-channel/agent";
import { ASSISTANT_TOOL_NAMES, assistantOwnerTools, moneyOwed, newLeads, openQuotes } from "@/server/services/owner-channel/assistant-tools";
import type { OwnerCompany } from "@/server/services/owner-channel/common";
import { OWNER_TOOLS, type ToolRunState } from "@/server/services/owner-channel/tools";
import type { RetellFunctionRequest } from "@/server/services/retell/functions";
import type { BusinessFacts } from "@/server/services/sms-agent/facts";
import { roleOwnerTools } from "@/server/services/staff/registry";
import { buildOwnerAgentTools } from "@/server/services/voice/owner-agent";
import { cleanBrief, loadOwnerBrief, MAX_BRIEF_CHARS, mergeOwnerBrief, readOwnerBrief, saveOwnerBrief } from "@/server/services/voice/owner-brief";
import {
  buildOwnerLineMetadata,
  buildOwnerLinePrompt,
  pickBusiness,
  runOwnerLineTool,
  startOwnerLineFromTwilio,
  switchableCompanies,
  type OwnerLineClaims,
  type OwnerLineConfig,
} from "@/server/services/voice/owner-line";
import { createFakeDb } from "@/test/helpers/fake-supabase";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const CO = "22222222-2222-4222-8222-222222222222";
const CO2 = "33333333-3333-4333-8333-333333333333";
const CO3 = "44444444-4444-4444-8444-444444444444";
const OWNER = "+17055550111";
const NUMBER = "+17055550100";
const SECRET = "token-secret";
const NOW = new Date("2026-11-12T20:00:00Z");
const admin = {} as AdminClient;

const CONFIG: OwnerLineConfig = {
  enabled: true,
  agentId: "agent_owner",
  apiKey: "key",
  tokenSecret: SECRET,
  orgIds: new Set([ORG]),
  trustCallerId: false,
  sipDomain: "sip.retellai.com",
  ringTimeoutSeconds: 12,
  registerTimeoutMs: 3000,
  maxCallSeconds: 1200,
};

const company = (over: Partial<OwnerCompany> = {}): OwnerCompany => ({ companyId: CO, organizationId: ORG, name: "Northshore Roofing", timeZone: "America/Toronto", ownerPhone: OWNER, platformBrand: "everdoer", ...over });
const ROOFING = company();
const COATINGS = company({ companyId: CO2, name: "Northshore Coatings" });
const STORAGE = company({ companyId: CO3, name: "Bay Storage" });
const ELSEWHERE = company({ companyId: "55555555-5555-4555-8555-555555555555", organizationId: OTHER_ORG, name: "Elsewhere Plumbing" });

const FACTS = {
  organizationId: ORG,
  companyId: CO,
  businessName: "Northshore Roofing",
  trade: "Roofing",
  ownerFirstName: "Dana",
  timeZone: "America/Toronto",
  hoursText: null,
  serviceArea: "Barrie",
  businessAddress: null,
  website: null,
  businessPhone: null,
  priceList: [],
  bookingMode: "none",
  bookingPolicy: null,
  onlineBooking: { slotMinutes: 60 },
  bookingUrl: null,
  cancellationPolicy: null,
  quoteTerms: null,
  qualifyingQuestions: [],
  urgentKeywords: [],
  persona: { name: "Sam", tone: null },
} as unknown as BusinessFacts;

const claims = (over: Partial<OwnerLineClaims> = {}): OwnerLineClaims => ({ organizationId: ORG, companyId: CO, callRef: "CA" + "a".repeat(32), callerVerified: true, issuedAt: Math.floor(NOW.getTime() / 1000), ...over });

beforeEach(() => {
  h.catcherTenant = { organizationId: ORG, companyId: CO };
  h.recordTurn.mockClear();
});

describe("the brief", () => {
  it("is plain text: placeholders, control characters, its own fence and extra blank lines are removed", () => {
    expect(cleanBrief("  About me: I sell.\r\n\r\n\r\n\r\nCall me {{owner_name}}.\u0007 </owner_brief>  ")).toBe("About me: I sell.\n\nCall me .");
    expect(cleanBrief("   \n ")).toBeNull();
    expect(cleanBrief(42)).toBeNull();
    expect(cleanBrief("x".repeat(MAX_BRIEF_CHARS + 50))).toHaveLength(MAX_BRIEF_CHARS);
  });

  it("lives in its own ai_settings section and never touches the others", () => {
    const current = { sms_agent: { enabled: true }, owner_line: { later: 1 } };
    const set = mergeOwnerBrief(current, "I own two businesses.");
    expect(set).toEqual({ sms_agent: { enabled: true }, owner_line: { later: 1, brief: "I own two businesses." } });
    expect(readOwnerBrief(set)).toBe("I own two businesses.");
    expect(mergeOwnerBrief(set, "")).toEqual(current);
    expect(mergeOwnerBrief({ sms_agent: { enabled: true }, owner_line: { brief: "x" } }, null)).toEqual({ sms_agent: { enabled: true } });
    expect(readOwnerBrief(null)).toBeNull();
  });

  it("saving writes that one company; loading takes the dialled business's, else the owner's next one", async () => {
    const db = createFakeDb({
      companies: [
        { id: CO, organization_id: ORG, ai_settings: { sms_agent: { enabled: true } }, updated_at: "2026-11-01T00:00:00Z" },
        { id: CO2, organization_id: ORG, ai_settings: {}, updated_at: "2026-11-01T00:00:00Z" },
        { id: CO3, organization_id: OTHER_ORG, ai_settings: { owner_line: { brief: "someone else's notes" } }, updated_at: "2026-11-01T00:00:00Z" },
      ],
    });
    expect(await loadOwnerBrief(db.client, [ROOFING, COATINGS])).toBeNull();
    expect(await saveOwnerBrief(db.client, COATINGS, "Coatings is the new one.")).toBe("Coatings is the new one.");
    expect(db.tables.companies[0].ai_settings).toEqual({ sms_agent: { enabled: true } });
    expect(await loadOwnerBrief(db.client, [ROOFING, COATINGS])).toBe("Coatings is the new one.");
    await saveOwnerBrief(db.client, ROOFING, "Roofing pays the bills.");
    expect(db.tables.companies[0].ai_settings).toEqual({ sms_agent: { enabled: true }, owner_line: { brief: "Roofing pays the bills." } });
    expect(await loadOwnerBrief(db.client, [ROOFING, COATINGS])).toBe("Roofing pays the bills.");
    // A company id under the wrong organization is never read as this owner's.
    expect(await loadOwnerBrief(db.client, [{ organizationId: ORG, companyId: CO3 }])).toBeNull();
    expect(await saveOwnerBrief(db.client, { organizationId: ORG, companyId: "nope" }, "x")).toBeUndefined();
  });

  it("a read error is 'no brief', never a failed call", async () => {
    const db = createFakeDb({ companies: [] });
    db.failNext("companies", "select");
    expect(await loadOwnerBrief(db.client, [ROOFING])).toBeNull();
  });
});

describe("the prompt", () => {
  it("carries the owner's brief, fenced, and names the other businesses the tool can reach", () => {
    const prompt = buildOwnerLinePrompt({ facts: FACTS, now: NOW, callerVerified: true, brief: "Roofing pays the bills. Coatings is new.", otherBusinesses: ["Northshore Coatings", "Bay Storage"] });
    expect(prompt).toContain("who owns Northshore Roofing and 2 other businesses on this account.");
    expect(prompt).toContain("<owner_brief>\nRoofing pays the bills. Coatings is new.\n</owner_brief>");
    expect(prompt).toContain("you can reach: Northshore Coatings and Bay Storage.");
    expect(prompt).toContain("`business_name`");
    expect(prompt).toContain("give one clear recommendation");
    expect(prompt).toContain("Business facts (Northshore Roofing):");
  });

  it("no brief and one business: no empty section, and it says it can't reach other businesses", () => {
    const prompt = buildOwnerLinePrompt({ facts: FACTS, now: NOW, callerVerified: true, brief: "  ", otherBusinesses: [] });
    expect(prompt).not.toContain("owner_brief");
    expect(prompt).not.toContain("business_name");
    expect(prompt).toContain("The business tool works on Northshore Roofing only.");
  });

  it("a call puts the brief and the owner's other businesses (same organization only) in the prompt", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ call_id: "call_abc123" }), { status: 200 });
    };
    const loadBrief = vi.fn(async () => "Roofing pays the bills.");
    const out = await startOwnerLineFromTwilio(
      admin,
      { from: OWNER, to: NUMBER, callSid: "CA" + "a".repeat(32), stirVerstat: "TN-Validation-Passed-A" },
      { config: CONFIG, now: NOW, fetchImpl, findOwnerCompanies: async () => [ELSEWHERE, COATINGS, ROOFING], loadFacts: async () => FACTS, loadBrief },
    );
    expect(out.kind).toBe("owner");
    // The dialled business's brief is asked for first, then the others'; never another organization's.
    expect(loadBrief).toHaveBeenCalledWith(admin, [ROOFING, COATINGS]);
    const prompt = (bodies[0].retell_llm_dynamic_variables as Record<string, string>).system_prompt;
    expect(prompt).toContain("Roofing pays the bills.");
    expect(prompt).toContain("you can reach: Northshore Coatings.");
    expect(prompt).not.toContain("Elsewhere Plumbing");
  });
});

describe("switching business", () => {
  it("only the caller's other businesses in the same organization are switchable", () => {
    expect(switchableCompanies([ROOFING, COATINGS, ELSEWHERE], ROOFING)).toEqual([COATINGS]);
    expect(switchableCompanies([ROOFING], ROOFING)).toEqual([]);
  });

  it("a spoken name: exact first, then a clear partial; none or more than one is for the assistant to ask", () => {
    const mine = [ROOFING, COATINGS, STORAGE];
    expect(pickBusiness(mine, "northshore coatings")).toEqual({ kind: "one", company: COATINGS });
    expect(pickBusiness(mine, "Coatings")).toEqual({ kind: "one", company: COATINGS });
    expect(pickBusiness(mine, "the Bay Storage yard")).toEqual({ kind: "one", company: STORAGE });
    expect(pickBusiness(mine, "Northshore")).toEqual({ kind: "unclear", names: ["Northshore Roofing", "Northshore Coatings"] });
    expect(pickBusiness(mine, "Elsewhere Plumbing")).toEqual({ kind: "none" });
    expect(pickBusiness(mine, "  ")).toEqual({ kind: "none" });
  });

  const agent = () => vi.fn(async () => ({ reply: "Three new leads this week.", confirmationId: null as string | null, actions: [], rounds: 1, memoryActions: [] }));
  const sms = () => vi.fn(async () => ({ status: "sent" as const }));
  function request(args: Record<string, unknown>): RetellFunctionRequest<Record<string, unknown>> {
    const metadata = buildOwnerLineMetadata(claims(), SECRET);
    return { name: "business", args, call: { callId: "call_abc123", fromNumber: OWNER, toNumber: NUMBER, agentId: "agent_owner", direction: "inbound" }, raw: { name: "business", args, call: { metadata } } };
  }
  const deps = (over: Record<string, unknown> = {}) => ({ config: CONFIG, nowMs: NOW.getTime(), findOwnerCompanies: async () => [ROOFING, COATINGS, ELSEWHERE], runAgent: agent(), sendSms: sms(), consume: vi.fn(async () => true), ...over });

  it("no name: the dialled business, as the owner's assistant (the day-to-day tools on)", async () => {
    const runAgent = agent();
    const out = await runOwnerLineTool(admin, request({ request: "any new leads?" }), deps({ runAgent }));
    expect(out).toEqual({ ok: true, say: "Three new leads this week." });
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ assistant: true, scope: expect.objectContaining({ companyId: CO, companyName: "Northshore Roofing" }) }));
  });

  it("naming another of their businesses runs there, and remembers it there", async () => {
    const runAgent = agent();
    const out = await runOwnerLineTool(admin, request({ request: "any new leads?", business_name: "Northshore Coatings" }), deps({ runAgent }));
    expect(out.ok).toBe(true);
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ scope: { organizationId: ORG, companyId: CO2, companyName: "Northshore Coatings", timeZone: "America/Toronto" } }));
    expect(h.recordTurn).toHaveBeenCalledWith(admin, expect.objectContaining({ organizationId: ORG, companyId: CO2, threadKey: OWNER }));
  });

  it("a change in another business is still confirmed by a code texted to the owner, for that business", async () => {
    const sendSms = sms();
    const runAgent = vi.fn(async () => ({ reply: "Move Lee to Fri 10am? Reply 7731 to confirm, or N to leave it.", confirmationId: "appr-9", actions: [], rounds: 1, memoryActions: [] }));
    const out = await runOwnerLineTool(admin, request({ request: "move Lee to Friday at 10", business_name: "Coatings" }), deps({ runAgent, sendSms }));
    expect(out.say).not.toContain("7731");
    expect(sendSms).toHaveBeenCalledWith(admin, expect.objectContaining({ to: OWNER, companyId: CO2, body: expect.stringContaining("Reply 7731") }));
  });

  it("a business in another organization, or one that isn't theirs, is never reached: nothing runs", async () => {
    const runAgent = agent();
    const out = await runOwnerLineTool(admin, request({ request: "who owes me?", business_name: "Elsewhere Plumbing" }), deps({ runAgent }));
    expect(out).toMatchObject({ ok: false, reason: "unknown_business" });
    expect(out.say).toContain("Northshore Roofing and Northshore Coatings");
    expect(out.say).not.toContain("Elsewhere");
    expect(runAgent).not.toHaveBeenCalled();
    // No longer the verified owner of the named business → it has dropped out of the list.
    const gone = await runOwnerLineTool(admin, request({ request: "who owes me?", business_name: "Northshore Coatings" }), deps({ runAgent, findOwnerCompanies: async () => [ROOFING] }));
    expect(gone).toMatchObject({ ok: false, reason: "unknown_business" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("an unclear name asks which one instead of guessing", async () => {
    const runAgent = agent();
    const out = await runOwnerLineTool(admin, request({ request: "who owes me?", business_name: "Northshore" }), deps({ runAgent }));
    expect(out).toMatchObject({ ok: false, reason: "unknown_business", say: "Which one do you mean: Northshore Roofing or Northshore Coatings?" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("the shared agent's business tool takes the optional business_name", () => {
    const business = buildOwnerAgentTools({ baseUrl: "https://app.test", functionSecret: "s" }).find((t) => t.name === "business") as { parameters: { properties: Record<string, unknown>; required: string[] } };
    expect(Object.keys(business.parameters.properties)).toEqual(["request", "business_name", "unlock_code"]);
    expect(business.parameters.required).toEqual(["request"]);
  });
});

describe("the day-to-day tools", () => {
  const nowMs = NOW.getTime();
  const day = (n: number) => new Date(nowMs - n * 86_400_000).toISOString();
  function seed() {
    return createFakeDb({
      contacts: [
        { id: "c1", organization_id: ORG, company_id: CO, first_name: "Dana", last_name: "Jones", phone: "+17055550123", stage: "lead", created_at: day(1) },
        { id: "c2", organization_id: ORG, company_id: CO, first_name: "Lee", last_name: "Park", phone: "+17055550124", stage: "lead", created_at: day(20) },
        { id: "c3", organization_id: ORG, company_id: CO, first_name: "Pat", last_name: "Old", phone: null, stage: "active", created_at: day(2) },
        { id: "c4", organization_id: ORG, company_id: CO2, first_name: "Other", last_name: "Business", phone: null, stage: "lead", created_at: day(1) },
      ],
      quotes: [
        { id: "q1", organization_id: ORG, company_id: CO, quote_number: "Q-0012", title: "Reshingle garage", status: "viewed", total_cents: 480000, contact_id: "c1", sent_at: day(3), first_viewed_at: day(2), approved_at: null, valid_until: "2026-12-01", superseded_by: null, created_at: day(3) },
        { id: "q2", organization_id: ORG, company_id: CO, quote_number: "Q-0011", title: "Eavestrough", status: "approved", total_cents: 120000, contact_id: "c2", sent_at: day(9), first_viewed_at: day(8), approved_at: day(7), valid_until: null, superseded_by: null, created_at: day(9) },
        { id: "q3", organization_id: ORG, company_id: CO, quote_number: "Q-0010", title: "Old version", status: "sent", total_cents: 99900, contact_id: "c1", sent_at: day(12), first_viewed_at: null, approved_at: null, valid_until: null, superseded_by: "q1", created_at: day(12) },
        { id: "q4", organization_id: ORG, company_id: CO, quote_number: null, title: "Draft", status: "draft", total_cents: 5000, contact_id: null, sent_at: null, first_viewed_at: null, approved_at: null, valid_until: null, superseded_by: null, created_at: day(1) },
        { id: "q5", organization_id: ORG, company_id: CO, quote_number: "Q-0009", title: "Done", status: "completed", total_cents: 700000, contact_id: "c3", sent_at: day(40), first_viewed_at: null, approved_at: null, valid_until: null, superseded_by: null, created_at: day(40) },
        { id: "q6", organization_id: ORG, company_id: CO2, quote_number: "Q-9", title: "Other business", status: "sent", total_cents: 1, contact_id: "c4", sent_at: day(1), first_viewed_at: null, approved_at: null, valid_until: null, superseded_by: null, created_at: day(1) },
      ],
      invoices: [
        { id: "i1", organization_id: ORG, company_id: CO, contact_id: "c3", invoice_number: "INV-0007", status: "sent", balance_due_cents: 180000, pending_payment_cents: 0, due_date: "2026-10-20", bill_to: {}, total_cents: 180000 },
        { id: "i2", organization_id: ORG, company_id: CO, contact_id: "c1", invoice_number: "INV-0008", status: "viewed", balance_due_cents: 60000, pending_payment_cents: 0, due_date: "2026-11-30", bill_to: {}, total_cents: 60000 },
        { id: "i3", organization_id: ORG, company_id: CO, contact_id: "c1", invoice_number: "INV-0006", status: "paid", balance_due_cents: 0, pending_payment_cents: 0, due_date: "2026-10-01", bill_to: {}, total_cents: 50000 },
        { id: "i4", organization_id: ORG, company_id: CO2, contact_id: "c4", invoice_number: "INV-9", status: "sent", balance_due_cents: 999900, pending_payment_cents: 0, due_date: "2026-10-01", bill_to: {}, total_cents: 999900 },
      ],
    });
  }
  const stateFor = (db: ReturnType<typeof seed>): ToolRunState => ({ admin: db.client, scope: { organizationId: ORG, companyId: CO, companyName: "Northshore Roofing", timeZone: "America/Toronto" }, ownerPhone: OWNER, nowMs, confirmation: null, actions: [] });

  it("new_leads: people still marked a lead who came in within the window, this business only", async () => {
    const db = seed();
    const out = await newLeads(stateFor(db), {});
    expect(out).toMatchObject({ days: 14, new_leads: 1 });
    expect(out.newest).toEqual([expect.objectContaining({ contact_id: "c1", name: "Dana Jones", phone: "705-555-0123" })]);
    expect((await newLeads(stateFor(db), { days: 30 })).new_leads).toBe(2);
    expect((await newLeads(stateFor(db), { days: 9999 })).days).toBe(90);
    const read = db.queries.filter((q) => q.table === "contacts");
    expect(read.every((q) => q.filters.some((f) => f.column === "organization_id" && f.value === ORG) && q.filters.some((f) => f.column === "company_id" && f.value === CO))).toBe(true);
  });

  it("open_quotes: waiting on the customer, approved without a deposit, drafts; replaced and finished ones don't count", async () => {
    const out = await openQuotes(stateFor(seed()));
    expect(out).toMatchObject({
      waiting_on_customer: { quotes: 1, total: "$4,800" },
      approved_waiting_on_deposit: { quotes: 1, total: "$1,200" },
      drafts_not_sent: 1,
    });
    expect(out.quotes).toEqual([
      expect.objectContaining({ quote: "Q-0012", customer: "Dana Jones", job: "Reshingle garage", total: "$4,800", status: "opened, no answer yet", good_until: "Dec 1" }),
      expect.objectContaining({ quote: "Q-0011", customer: "Lee Park", status: "approved, deposit not paid" }),
    ]);
  });

  it("money_owed: outstanding, overdue and who owes the most, this business only", async () => {
    const out = await moneyOwed(stateFor(seed()));
    expect(out).toMatchObject({ outstanding: "$2,400", open_invoices: 2, overdue: "$1,800", overdue_invoices: 1 });
    expect((out.top_owing as Array<Record<string, unknown>>)[0]).toMatchObject({ customer: "Pat Old", invoice: "INV-0007", owing: "$1,800", days_late: 23 });
  });

  it("a failed read is something to say, never a thrown error", async () => {
    const db = seed();
    db.failNext("quotes", "select");
    const tool = assistantOwnerTools([]).find((t) => t.tool.name === "open_quotes");
    expect(await tool?.run(stateFor(db), {})).toEqual({ error: "That didn't work on our side." });
  });

  it("an AI staff role's own tool wins: no second tool for the same question", () => {
    expect(assistantOwnerTools([]).map((t) => t.tool.name)).toEqual([...ASSISTANT_TOOL_NAMES]);
    const active = roleOwnerTools().filter((t) => t.tool.name === "who_owes_me" || t.tool.name === "briefing_now");
    expect(assistantOwnerTools(active).map((t) => t.tool.name)).toEqual(["new_leads", "open_quotes"]);
  });

  it("the new names don't collide with the owner's core tools or any role's (the briefing is the role's own tool)", () => {
    const taken = new Set([...OWNER_TOOLS.map((t) => t.name), ...roleOwnerTools().map((t) => t.tool.name)]);
    expect(["new_leads", "open_quotes", "money_owed"].filter((n) => taken.has(n))).toEqual([]);
    expect(taken.has("briefing_now")).toBe(true);
  });

  it("are offered on the owner line only: the owner-by-text agent's tools are exactly as before", async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      const seen: Array<{ tools: string[]; system: string }> = [];
      const client: ModelClient = {
        createMessage: async (params) => {
          seen.push({ tools: (params.tools ?? []).map((t) => t.name), system: JSON.stringify(params.system) });
          return { id: "msg_1", model: "m", role: "assistant", type: "message", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: "Nothing new.", citations: null }], usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;
        },
      };
      // A house organization: no AI staff role is on by default.
      const db = createFakeDb({
        companies: [{ id: CO, organization_id: ORG, name: "Northshore Roofing", timezone: "America/Toronto", ai_settings: {}, stage: "active" }],
        organizations: [{ id: ORG, platform_brand: "empirevu", crankleads_tier: null }],
      });
      const input = { admin: db.client, scope: { organizationId: ORG, companyId: CO, companyName: "Northshore Roofing", timeZone: "America/Toronto" }, ownerPhone: OWNER, body: "any new leads?", nowMs, client };
      await runOwnerCommandAgent(input);
      await runOwnerCommandAgent({ ...input, assistant: true });
      const [byText, onTheLine] = seen;
      expect(byText.tools.filter((n) => (ASSISTANT_TOOL_NAMES as readonly string[]).includes(n))).toEqual([]);
      expect(byText.system).not.toContain("new_leads");
      expect(onTheLine.tools).toEqual([...byText.tools, ...ASSISTANT_TOOL_NAMES]);
      expect(onTheLine.system).toContain("new_leads, open_quotes, money_owed");
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
    }
  });
});
