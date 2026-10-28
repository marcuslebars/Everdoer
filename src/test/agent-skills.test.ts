/**
 * Shared skills (src/server/agent/skills): the registry, each skill, the phone route's tenant +
 * caller resolution (retell/call-skills.ts), the receptionist's tool wiring, and the texting
 * agent's adapter (sms-agent/skill-tools.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deliverMessage = vi.fn();
const resolveOwnerContacts = vi.fn();
vi.mock("@/server/services/workflow-engine/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/workflow-engine/messaging")>()),
  deliverMessage: (...a: unknown[]) => deliverMessage(...a),
  resolveOwnerContacts: (...a: unknown[]) => resolveOwnerContacts(...a),
}));

import { runSkill, SAY_SKILL_FAILED, skillsFor, SKILLS } from "@/server/agent/skills/registry";
import { bestServices, terms } from "@/server/agent/skills/services";
import { MAX_OWNER_MESSAGES_PER_CALL, ownerMessageBody } from "@/server/agent/skills/owner";
import type { SkillContext } from "@/server/agent/skills/types";
import type { BusinessFacts, PriceListItem } from "@/server/services/sms-agent/facts";
import { callerFor, runVoiceSkill, type VoiceSkillDeps } from "@/server/services/retell/call-skills";
import type { RetellFunctionRequest } from "@/server/services/retell/functions";
import type { RetellTenant } from "@/server/services/retell/tenant";
import { amountsInResult, applySkillResult, skillAgentTools, smsSkillContext } from "@/server/services/sms-agent/skill-tools";
import { allAgentTools, newTurnEffects, type TurnState } from "@/server/services/sms-agent/tools";
import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

const ORG = "org-1";
const CO = "co-1";
const scope = { organizationId: ORG, companyId: CO };

function item(key: string, label: string, priceText: string | null, description: string | null = null): PriceListItem {
  return { key, label, description, pricingType: "flat", unitLabel: null, rateCents: 0, minimumCents: 0, priceText, needsMeasure: false, choices: [] };
}

const PRICE_LIST = [
  item("gutter_cleaning", "Gutter cleaning", "$180", "Clear and flush eavestroughs"),
  item("furnace_tune_up", "Furnace tune-up", "$149", "Annual furnace maintenance and safety check"),
  item("window_washing", "Window washing", null),
];

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    organizationId: ORG,
    companyId: CO,
    businessName: "Northshore Home",
    trade: null,
    ownerFirstName: "Dana",
    timeZone: "America/Toronto",
    hoursText: null,
    serviceArea: null,
    businessAddress: null,
    website: null,
    businessPhone: null,
    priceList: PRICE_LIST,
    bookingMode: "none",
    bookingPolicy: null,
    onlineBooking: { enabled: false } as BusinessFacts["onlineBooking"],
    bookingUrl: null,
    cancellationPolicy: null,
    quoteTerms: null,
    qualifyingQuestions: [],
    urgentKeywords: [],
    ...over,
  };
}

function seed(): FakeDb {
  return createFakeDb({
    companies: [{ id: CO, organization_id: ORG, name: "Northshore Home", owner_email: "dana@northshore.test", owner_phone_e164: "+17055550100", quote_public_base_url: null }],
    organizations: [{ id: ORG, platform_brand: null }],
    contacts: [
      { id: "ct-1", organization_id: ORG, company_id: CO, first_name: "Sam", last_name: "Lee", phone: "+17055550123", phone_last10: "7055550123", sms_opt_out_at: null, email_opt_out_at: null, sms_consent_at: null, consent_source: null, updated_at: "2026-10-01T00:00:00Z" },
      { id: "ct-out", organization_id: ORG, company_id: CO, first_name: "Opt", last_name: "Out", phone: "+17055550199", phone_last10: "7055550199", sms_opt_out_at: "2026-01-01T00:00:00Z", email_opt_out_at: null, sms_consent_at: null, consent_source: null, updated_at: "2026-10-01T00:00:00Z" },
      // Another company's contact with the same number: never matched.
      { id: "ct-other", organization_id: "org-2", company_id: "co-2", first_name: "Not", last_name: "Them", phone: "+17055550123", phone_last10: "7055550123", updated_at: "2026-10-02T00:00:00Z" },
    ],
    invoices: [
      { id: "inv-1", organization_id: ORG, company_id: CO, contact_id: "ct-1", invoice_number: "INV-0007", title: "Fall cleanup", total_cents: 45000, balance_due_cents: 45000, due_date: "2026-10-15", status: "sent", public_token: "tok-1", issue_date: "2026-10-01" },
      { id: "inv-paid", organization_id: ORG, company_id: CO, contact_id: "ct-1", invoice_number: "INV-0005", title: "Spring", total_cents: 10000, balance_due_cents: 0, due_date: null, status: "paid", public_token: "tok-p", issue_date: "2026-05-01" },
      { id: "inv-out", organization_id: ORG, company_id: CO, contact_id: "ct-out", invoice_number: "INV-0009", title: null, total_cents: 9000, balance_due_cents: 9000, due_date: null, status: "viewed", public_token: "tok-o", issue_date: "2026-10-02" },
    ],
    agent_notes: [
      { id: "n-1", organization_id: ORG, company_id: CO, contact_id: null, body: "Closed Dec 24 to Jan 2.", archived_at: null, created_at: "2026-10-20T00:00:00Z" },
      { id: "n-2", organization_id: ORG, company_id: CO, contact_id: "ct-1", body: "Private note about Sam.", archived_at: null, created_at: "2026-10-21T00:00:00Z" },
    ],
  });
}

let db: FakeDb;

function ctx(over: Partial<SkillContext> = {}): SkillContext {
  return {
    admin: db.client,
    channel: "voice",
    scope,
    caller: { contactId: "ct-1", phone: "+17055550123", name: "Sam Lee" },
    nowMs: Date.parse("2026-10-28T15:00:00Z"),
    callId: "call-1",
    facts: facts(),
    ...over,
  };
}

beforeEach(() => {
  db = seed();
  deliverMessage.mockReset().mockResolvedValue({ status: "sent" });
  resolveOwnerContacts.mockReset().mockResolvedValue({ phone: "+17055550100", email: "dana@northshore.test" });
});

describe("registry", () => {
  it("names are unique and every skill declares a channel", () => {
    const names = SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SKILLS) expect(s.channels.length).toBeGreaterThan(0);
    expect(skillsFor("voice").map((s) => s.name)).toEqual(["find_services", "my_invoices", "send_invoice_link", "message_owner", "alert_owner", "business_notes"]);
    expect(skillsFor("customer_sms").map((s) => s.name)).toEqual(["find_services"]);
  });

  it("an unknown skill, or one not on this channel, fails with something to say", async () => {
    expect(await runSkill(ctx(), "nope", {})).toEqual({ ok: false, reason: "unknown_skill", say: SAY_SKILL_FAILED });
    expect((await runSkill(ctx({ channel: "customer_sms" }), "message_owner", { message: "hi" })).reason).toBe("unknown_skill");
  });

  it("a skill that throws becomes a failure with something to say", async () => {
    db.failNext("invoices", "select", { message: "db down" });
    const r = await runSkill(ctx(), "my_invoices", {});
    expect(r).toEqual({ ok: false, reason: "error", say: SAY_SKILL_FAILED });
  });
});

describe("find_services", () => {
  it("matches the customer's words to the price list, with the listed price wording", () => {
    expect(terms("Do you clean gutters?")).toEqual(["clean", "gutter"]);
    const m = bestServices(PRICE_LIST, "my gutters are overflowing, can you clean them");
    expect(m?.[0]).toEqual({ service_key: "gutter_cleaning", name: "Gutter cleaning", price: "$180 + HST", details: "Clear and flush eavestroughs" });
    expect(bestServices(PRICE_LIST, "windows")?.[0].price).toBe("no set price — the team quotes it");
    expect(bestServices(PRICE_LIST, "roof shingles")).toBeNull();
  });

  it("returns what IS offered when nothing matches, and asks when there's no need given", async () => {
    const none = await runSkill(ctx(), "find_services", { need: "roof shingles" });
    expect(none).toMatchObject({ ok: true, matches: [], offered: ["Gutter cleaning", "Furnace tune-up", "Window washing"] });
    expect((await runSkill(ctx(), "find_services", {})).reason).toBe("missing_need");
    const hit = await runSkill(ctx(), "find_services", { need: "furnace making noise" });
    expect((hit.matches as Array<{ service_key: string }>)[0].service_key).toBe("furnace_tune_up");
  });
});

describe("my_invoices / send_invoice_link (phone)", () => {
  it("counts the caller's open invoices without reading any amount", async () => {
    const r = await runSkill(ctx(), "my_invoices", {});
    expect(r).toMatchObject({ ok: true, open_invoices: 1, invoices: [{ invoice_number: "INV-0007", title: "Fall cleanup" }] });
    expect(JSON.stringify(r)).not.toMatch(/\$|450|45000/);
    const reads = db.queries.filter((q) => q.table === "invoices");
    for (const q of reads) {
      expect(q.filters).toEqual(expect.arrayContaining([expect.objectContaining({ column: "organization_id", value: ORG }), expect.objectContaining({ column: "company_id", value: CO })]));
    }
  });

  it("an unknown caller gets no account details", async () => {
    const r = await runSkill(ctx({ caller: { contactId: null, phone: "+19995550000", name: null } }), "my_invoices", {});
    expect(r).toMatchObject({ ok: false, reason: "unknown_caller" });
    expect(db.queries.some((q) => q.table === "invoices")).toBe(false);
  });

  it("texts the pay link to the number ON FILE, never one the model passes", async () => {
    const r = await runSkill(ctx({ caller: { contactId: "ct-1", phone: "+17055550123", name: null } }), "send_invoice_link", { phone: "+15555550000" });
    expect(r).toMatchObject({ ok: true, sent: true, invoice_number: "INV-0007" });
    expect(deliverMessage).toHaveBeenCalledTimes(1);
    const sent = deliverMessage.mock.calls[0][0] as { channel: string; to: string; body: string; contactId: string; consentContact: unknown };
    expect(sent).toMatchObject({ channel: "sms", to: "+17055550123", contactId: "ct-1" });
    expect(sent.body).toContain("/i/tok-1");
    expect(sent.body).toContain("invoice INV-0007 (Fall cleanup)");
    expect(sent.consentContact).toEqual({ sms_opt_out_at: null, email_opt_out_at: null, sms_consent_at: null, consent_source: null });
  });

  it("doesn't text an opted-out number, and says when the send failed", async () => {
    const out = await runSkill(ctx({ caller: { contactId: "ct-out", phone: "+17055550199", name: null } }), "send_invoice_link", {});
    expect(out).toMatchObject({ ok: false, reason: "opted_out" });
    expect(deliverMessage).not.toHaveBeenCalled();
    deliverMessage.mockResolvedValueOnce({ status: "skipped", reason: "no_sender" });
    const failed = await runSkill(ctx(), "send_invoice_link", {});
    expect(failed).toMatchObject({ ok: false, reason: "no_sender" });
    expect(typeof failed.say).toBe("string");
  });

  it("asks which invoice when the number given matches none", async () => {
    const r = await runSkill(ctx(), "send_invoice_link", { invoice_number: "#0099" });
    expect(r).toMatchObject({ ok: false, reason: "which_invoice" });
    expect(deliverMessage).not.toHaveBeenCalled();
    expect((await runSkill(ctx(), "send_invoice_link", { invoice_number: "#0007" })).ok).toBe(true);
  });
});

describe("message_owner / alert_owner / business_notes", () => {
  it("the owner text names the caller by caller ID and adds a different callback number", () => {
    expect(
      ownerMessageBody({ companyName: "Northshore", urgent: false, callerName: "Sam", callerPhone: "+17055550123", callback: "705-555-0123", message: "call me about the quote", where: null, bestTime: "after 5" }),
    ).toBe('📞 Caller for Northshore asked for you: Sam · (705) 555-0123 — "call me about the quote". Best time: after 5.');
    expect(
      ownerMessageBody({ companyName: "Northshore", urgent: true, callerName: null, callerPhone: "+17055550123", callback: "+14165550000", message: "basement flooding", where: "12 Bay St", bestTime: null }),
    ).toBe("🚨 URGENT call right now for Northshore: (705) 555-0123 — basement flooding at 12 Bay St. Callback: (416) 555-0000. Call them back now.");
  });

  it("message_owner texts and emails the owner, at most twice a call", async () => {
    let used = 0;
    db.onRpc((name, args) => {
      expect(name).toBe("consume_rate_limit");
      expect(args.p_key).toBe("voice_owner_msg:call-1");
      used += 1;
      return { data: used <= MAX_OWNER_MESSAGES_PER_CALL, error: null };
    });
    const first = await runSkill(ctx(), "message_owner", { message: "wants a callback about the deposit" });
    expect(first).toMatchObject({ ok: true, sent: true });
    expect(deliverMessage.mock.calls.map((c) => (c[0] as { channel: string; to: string }).channel)).toEqual(["sms", "email"]);
    expect((deliverMessage.mock.calls[0][0] as { to: string; body: string }).to).toBe("+17055550100");
    expect((deliverMessage.mock.calls[0][0] as { body: string }).body).toContain("Sam Lee · (705) 555-0123");
    await runSkill(ctx(), "message_owner", { message: "again" });
    deliverMessage.mockClear();
    const third = await runSkill(ctx(), "message_owner", { message: "and again" });
    expect(third).toMatchObject({ ok: true, sent: false });
    expect(deliverMessage).not.toHaveBeenCalled();
  });

  it("alert_owner sends once per call and always tells the caller about 9-1-1", async () => {
    let used = 0;
    db.onRpc((_name, args) => {
      expect(args.p_key).toBe("voice_urgent:call-1");
      used += 1;
      return { data: used <= 1, error: null };
    });
    const first = await runSkill(ctx(), "alert_owner", { what: "basement flooding", address: "12 Bay St" });
    expect(first).toMatchObject({ ok: true, alerted: true });
    expect(String(first.say)).toContain("9-1-1");
    expect((deliverMessage.mock.calls[0][0] as { body: string }).body).toMatch(/^🚨 URGENT/);
    deliverMessage.mockClear();
    expect((await runSkill(ctx(), "alert_owner", { what: "still flooding" })).alerted).toBe(true);
    expect(deliverMessage).not.toHaveBeenCalled();
  });

  it("a failed owner send is reported, not claimed", async () => {
    deliverMessage.mockResolvedValue({ status: "failed" });
    const r = await runSkill(ctx(), "message_owner", { message: "call me" });
    expect(r).toMatchObject({ ok: false, reason: "not_sent" });
    expect(String(r.say)).not.toMatch(/sent your message/);
  });

  it("business_notes returns the business's notes only (not a customer's)", async () => {
    expect(await runSkill(ctx(), "business_notes", {})).toEqual({ ok: true, notes: ["Closed Dec 24 to Jan 2."] });
  });
});

describe("the phone route (runVoiceSkill)", () => {
  function req(name: string, args: Record<string, unknown> = {}, fromNumber = "+1 (705) 555-0123"): RetellFunctionRequest<unknown> {
    return { name, args, call: { callId: "call-9", fromNumber, toNumber: "+17055550001", agentId: "ag-1", direction: "inbound" }, raw: {} };
  }
  function deps(tenant: RetellTenant | null): VoiceSkillDeps {
    return { admin: () => db.client, resolveTenant: vi.fn(async () => tenant), now: () => Date.parse("2026-10-28T15:00:00Z") };
  }
  const tenant: RetellTenant = { organizationId: ORG, companyId: CO, sourceSite: "x", resolvedBy: "number" };

  it("refuses a guessed (legacy) or unresolved tenant", async () => {
    for (const t of [null, { ...tenant, resolvedBy: "legacy" as const }, { ...tenant, companyId: null }]) {
      expect(await runVoiceSkill(req("business_notes"), deps(t))).toEqual({ ok: false, reason: "unsupported", say: SAY_SKILL_FAILED });
    }
  });

  it("matches the caller by caller ID within the call's company only", async () => {
    expect(await callerFor(db.client, scope, "+1 705-555-0123")).toEqual({ contactId: "ct-1", phone: "+17055550123", name: "Sam Lee" });
    expect(await callerFor(db.client, scope, "+14165550000")).toEqual({ contactId: null, phone: "+14165550000", name: null });
    expect(await callerFor(db.client, scope, null)).toEqual({ contactId: null, phone: null, name: null });
  });

  it("runs the named skill for that caller, keyed to the Retell call id", async () => {
    const keys: unknown[] = [];
    db.onRpc((_n, args) => {
      keys.push(args.p_key);
      return { data: true, error: null };
    });
    const r = await runVoiceSkill(req("message_owner", { message: "please call" }), deps(tenant));
    expect(r).toMatchObject({ ok: true, sent: true });
    expect(keys).toEqual(["voice_owner_msg:call-9"]);
    expect((await runVoiceSkill(req("my_invoices"), deps(tenant))).open_invoices).toBe(1);
  });

  it("never throws", async () => {
    const broken: VoiceSkillDeps = { admin: () => db.client, resolveTenant: async () => Promise.reject(new Error("boom")), now: Date.now };
    expect(await runVoiceSkill(req("business_notes"), broken)).toEqual({ ok: false, reason: "error", say: SAY_SKILL_FAILED });
  });
});

describe("the texting agent's skill tools", () => {
  function state(): TurnState {
    return {
      admin: db.client,
      facts: facts(),
      contact: { id: "ct-1", organization_id: ORG, company_id: CO, first_name: "Sam", last_name: null, phone: "+17055550123", email: null, notes: null, metadata: null },
      services: { now: () => new Date("2026-10-28T15:00:00Z") },
      effects: newTurnEffects(),
    } as never;
  }

  it("adds skills no other tool covers, and the texting agent's own tool wins a name clash", () => {
    const all = allAgentTools().map((t) => t.name);
    expect(all.filter((n) => n === "find_services")).toHaveLength(1);
    expect(skillAgentTools(["find_services"])).toEqual([]);
  });

  it("builds the context from the conversation, not the model's input", () => {
    expect(smsSkillContext(state())).toMatchObject({ channel: "customer_sms", scope, caller: { contactId: "ct-1", phone: "+17055550123", name: "Sam" }, callId: null });
  });

  it("vouches for the amounts a skill returned and puts its link in the reply", async () => {
    expect([...amountsInResult({ a: "$1,234.50 + HST", b: ["$180", { c: "From $45" }], d: 12 })].sort((x, y) => x - y)).toEqual([4500, 18000, 123450]);
    const s = state();
    applySkillResult(s, { ok: true, link: "https://pay.test/i/1" });
    applySkillResult(s, { ok: true, link: "https://pay.test/i/1" });
    expect(s.effects.links).toEqual(["https://pay.test/i/1"]);
    const tool = skillAgentTools([]).find((t) => t.name === "find_services");
    const result = await tool!.run(s, { need: "gutters" } as never);
    expect(result).toMatchObject({ ok: true });
    expect(s.effects.allowedAmountsCents.has(18000)).toBe(true);
  });
});
