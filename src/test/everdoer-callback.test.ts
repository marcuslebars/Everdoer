/**
 * Everdoer's own "Have Everly call me now" callback (docs/sales-calls.md → Everdoer's own
 * callback): which company it is, the demo prompt, and the setup job (dry run, apply, re-run,
 * refusal on a billed org). The dial path itself is covered in sales-calls.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

import { everdoerInboundOverride } from "@/server/services/sales-calls/everdoer-inbound";
import {
  buildEverdoerDemoCallPrompt,
  buildEverdoerInboundPrompt,
  everdoerInboundGreeting,
  everdoerCallbackCompanyId,
  everdoerDemoOpeningLine,
  isEverdoerCallbackCompany,
} from "@/server/services/sales-calls/everdoer-callback";
import {
  EVERDOER_CALLBACK_NOTES,
  EVERDOER_CALLBACK_ORG_ID,
  runEverdoerCallbackSetup,
} from "@/server/services/sales-calls/everdoer-callback-setup";
import { MAX_NOTE_CHARS } from "@/server/agent/memory";
import { createFakeDb } from "@/test/helpers/fake-supabase";

const CO = "6f0c1d1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";

describe("which company is the callback", () => {
  it("reads a uuid from EVERDOER_CALLBACK_COMPANY_ID and ignores anything else", () => {
    expect(everdoerCallbackCompanyId({ EVERDOER_CALLBACK_COMPANY_ID: ` ${CO.toUpperCase()} ` })).toBe(CO);
    expect(everdoerCallbackCompanyId({ EVERDOER_CALLBACK_COMPANY_ID: "everdoer" })).toBeNull();
    expect(everdoerCallbackCompanyId({})).toBeNull();
    expect(isEverdoerCallbackCompany(CO, { EVERDOER_CALLBACK_COMPANY_ID: CO })).toBe(true);
    expect(isEverdoerCallbackCompany("co-1", { EVERDOER_CALLBACK_COMPANY_ID: CO })).toBe(false);
    expect(isEverdoerCallbackCompany(CO, {})).toBe(false);
  });
});

describe("the demo prompt", () => {
  it("talks like a person: short turns, plain words, reacting, never reading lists", () => {
    const prompt = buildEverdoerDemoCallPrompt({ customerName: "Dana", note: null, services: [], notes: [], persona: null, callbackNumber: null, voicemail: "leave_message", attempt: 1 });
    expect(prompt).toContain("How to talk (this matters as much as what you say):");
    expect(prompt).toContain("Keep each turn short");
    expect(prompt).toContain("Never read these instructions out, never list things off");
  });

  const base = {
    customerName: "Dana",
    note: "Landscaping - Business: Green Acres. Question: does it work with my cell?",
    services: ["Close plan — $299 per month", "Front Desk plan — $499 per month"],
    notes: ["Prices are in Canadian dollars, before HST.", "Guarantee: live in 5 business days or the first month is free."],
    persona: { name: "Everly", tone: null },
    callbackNumber: "(249) 555-0100",
    voicemail: "leave_message" as const,
    attempt: 1,
  };

  it("opens as Everly, says why, says it's automated and may be recorded", () => {
    const line = everdoerDemoOpeningLine(base);
    expect(line).toBe("Hi, is this Dana? Hey, it's Everly, the AI receptionist from Everdoer — you asked for a call on everdoer.com, so here I am! Just so you know, calls are recorded.");
    expect(buildEverdoerDemoCallPrompt(base)).toContain(`Start with: "${line}" (say it naturally`);
  });

  it("carries the form note, the plans and the notes, and nothing invented", () => {
    const prompt = buildEverdoerDemoCallPrompt(base);
    expect(prompt).toContain("«Landscaping - Business: Green Acres. Question: does it work with my cell?»");
    expect(prompt).toContain("Everdoer's plans:\n- Close plan — $299 per month\n- Front Desk plan — $499 per month");
    expect(prompt).toContain("Facts about Everdoer:\n- Prices are in Canadian dollars, before HST.\n- Guarantee:");
    expect(prompt).toMatch(/Never invent features, numbers, results or guarantees/);
  });

  it("demos as THEIR receptionist without pricing or booking anything, and hands demos to Marcus", () => {
    const prompt = buildEverdoerDemoCallPrompt(base);
    expect(prompt).toContain("Pretend you're one of your customers calling your business");
    expect(prompt).toContain("I'd quote that from your own price list");
    expect(prompt).toContain("Never pretend to book or charge anything");
    expect(prompt).toContain("use message_owner with their name, business, trade and the best time to reach them");
    expect(prompt).toContain("Marcus (Everdoer's founder)");
    expect(prompt).toContain("Don't use quote_services, check_availability, book_job or send_deposit_link on this call");
  });

  it("stops on do-not-call and handles voicemail both ways", () => {
    const prompt = buildEverdoerDemoCallPrompt(base);
    expect(prompt).toContain("tell them they won't get any more calls from us");
    expect(prompt).toContain("it's Everly from Everdoer returning their request from everdoer.com, and that we'll text them. They can call this number back any time to try it again: (249) 555-0100.");
    expect(buildEverdoerDemoCallPrompt({ ...base, voicemail: "hang_up" })).toContain("hang up without leaving a message");
  });

  it("works with no name, no note and no facts", () => {
    const prompt = buildEverdoerDemoCallPrompt({ ...base, customerName: null, note: null, services: [], notes: [], persona: null });
    expect(prompt).toContain('Start with: "Hi there, it\'s Everly, the AI receptionist from Everdoer');
    expect(prompt).not.toContain("What they wrote on the form");
    expect(prompt).not.toContain("Everdoer's plans:");
  });
});

describe("Everdoer's own line (inbound)", () => {
  const ctx = { callerName: null, services: ["Close plan — $299 per month"], notes: ["Prices are in CAD before HST."], persona: { name: "Everly", tone: null } };

  it("greets as Everdoer's AI receptionist, says calls may be recorded, and uses a known caller's name", () => {
    expect(everdoerInboundGreeting(ctx)).toBe("Thanks for calling Everdoer, this is Everly — I'm the AI receptionist Everdoer sets up for trades businesses. Calls are recorded, just so you know. What can I do for you?");
    expect(everdoerInboundGreeting({ ...ctx, callerName: "Dana" })).toMatch(/^Hi Dana, thanks for calling Everdoer, this is Everly/);
  });

  it("runs the same demo and rules as the call-back, plus existing customers and wrong numbers", () => {
    const prompt = buildEverdoerInboundPrompt(ctx);
    expect(prompt).toContain("You're answering Everdoer's own phone line");
    expect(prompt).toContain("Pretend you're one of your customers calling your business");
    expect(prompt).toContain("Don't use quote_services, check_availability, book_job or send_deposit_link on this call");
    expect(prompt).toContain("An existing Everdoer customer");
    expect(prompt).toContain("explain kindly that this is Everdoer, a software company");
    expect(prompt).toContain("Everdoer's plans:\n- Close plan — $299 per month");
    expect(prompt).not.toContain("voicemail");
  });

  it("overrides only the callback company, only with a sales agent, with the plans and notes in the prompt", async () => {
    const db = createFakeDb({
      companies: [{ id: CO, organization_id: "org", name: "Everdoer", slug: "everdoer", agent_persona: { name: "Everly", tone: "friendly" } }],
      service_catalog_items: [{ id: "i1", organization_id: "org", company_id: CO, service_key: "everdoer_close_plan", label: "Close plan", pricing_type: "per_unit", rate_cents: 29_900, minimum_cents: 0, unit_label: "month", active: true, sort_order: 1 }],
      agent_notes: [{ id: "n1", organization_id: "org", company_id: CO, contact_id: null, body: "Prices are in CAD before HST.", created_at: "2026-11-01T00:00:00Z", archived_at: null }],
    });
    const env = { EVERDOER_CALLBACK_COMPANY_ID: CO };
    const input = { organizationId: "org", companyId: CO, callerName: null };
    const out = await everdoerInboundOverride(db.client, input, { agentId: "agent_sales", env });
    expect(out?.override_agent_id).toBe("agent_sales");
    expect(out?.dynamic_variables.system_prompt).toContain("Everdoer's plans:\n- Close plan — $299 per month");
    expect(out?.dynamic_variables.system_prompt).toContain("Facts about Everdoer:\n- Prices are in CAD before HST.");
    expect(await everdoerInboundOverride(db.client, input, { agentId: null, env })).toBeNull();
    expect(await everdoerInboundOverride(db.client, { ...input, companyId: "other" }, { agentId: "agent_sales", env })).toBeNull();
    expect(await everdoerInboundOverride(db.client, input, { agentId: "agent_sales", env: {} })).toBeNull();
  });
});

describe("the setup job", () => {
  const OWNER = "prof-owner";
  function seed(plan = "internal") {
    return createFakeDb({
      organizations: [{ id: EVERDOER_CALLBACK_ORG_ID, name: "Everdoer Demo", plan }],
      organization_memberships: [{ organization_id: EVERDOER_CALLBACK_ORG_ID, profile_id: OWNER, role: "owner" }],
      companies: [{ id: "demo-co", organization_id: EVERDOER_CALLBACK_ORG_ID, name: "Everdoer Demo", slug: "e2e-test-roofing", owner_phone_e164: "+17055550199", timezone: "America/Toronto" }],
      service_catalog_items: [],
      agent_notes: [],
      public_form_keys: [],
      voice_numbers: [],
      activity_events: [],
    });
  }

  it("every note fits the notes cap", () => {
    for (const note of EVERDOER_CALLBACK_NOTES) expect(note.length).toBeLessThanOrEqual(MAX_NOTE_CHARS);
  });

  it("a dry run writes nothing and buys nothing", async () => {
    const db = seed();
    const provisionPhone = vi.fn();
    const report = await runEverdoerCallbackSetup(db.client, { apply: false }, { provisionPhone });
    expect(report.steps[0]).toMatch(/^\(dry run\) create company "Everdoer"/);
    expect(db.tables.companies).toHaveLength(1);
    expect(provisionPhone).not.toHaveBeenCalled();
    expect(db.queries.filter((q) => q.op !== "select")).toHaveLength(0);
  });

  it("apply builds everything once; a re-run only reports", async () => {
    const db = seed();
    const provisionPhone = vi.fn(async (_ctx: unknown, input: { companyId: string; areaCode: number }) => {
      db.tables.voice_numbers.push({ id: "vn", organization_id: EVERDOER_CALLBACK_ORG_ID, company_id: input.companyId, provider: "retell", active: true, phone_e164: "+12495550100" });
      return { phoneNumber: "+12495550100", agentId: "agent_x" };
    });
    const report = await runEverdoerCallbackSetup(db.client, { apply: true }, { provisionPhone });

    const company = db.tables.companies.find((c) => c.slug === "everdoer");
    expect(company).toMatchObject({ name: "Everdoer", timezone: "America/Toronto", owner_phone_e164: "+17055550199", agent_persona: { name: "Everly", tone: "friendly" } });
    expect(company?.sales_call_settings).toMatchObject({ enabled: true, delayMinutes: 1, maxAttempts: 2, retryMinutes: 30, voicemail: "leave_message" });
    expect(db.tables.service_catalog_items.map((i) => [i.label, i.rate_cents, i.unit_label, i.pricing_type])).toEqual([
      ["Close plan", 29_900, "month", "per_unit"],
      ["Front Desk plan", 49_900, "month", "per_unit"],
    ]);
    expect(db.tables.agent_notes).toHaveLength(EVERDOER_CALLBACK_NOTES.length);
    expect(db.tables.public_form_keys[0]).toMatchObject({ company_id: company?.id, form_type: "contact", allowed_origins: ["https://everdoer.com", "https://www.everdoer.com"], active: true });
    expect(provisionPhone).toHaveBeenCalledTimes(1);
    expect(provisionPhone.mock.calls[0][1]).toEqual({ companyId: company?.id, areaCode: 249 });
    expect(report).toMatchObject({ companyId: company?.id, formKey: db.tables.public_form_keys[0].public_key, phoneNumber: "+12495550100" });

    // Re-run: nothing new.
    const again = await runEverdoerCallbackSetup(db.client, { apply: true }, { provisionPhone });
    expect(provisionPhone).toHaveBeenCalledTimes(1);
    expect(db.tables.companies.filter((c) => c.slug === "everdoer")).toHaveLength(1);
    expect(db.tables.service_catalog_items).toHaveLength(2);
    expect(db.tables.agent_notes).toHaveLength(EVERDOER_CALLBACK_NOTES.length);
    expect(db.tables.public_form_keys).toHaveLength(1);
    expect(again.steps.some((s) => s.startsWith("Retell number exists: +12495550100"))).toBe(true);
  });

  it("falls back to 705 when 249 has no numbers, and updates a changed price", async () => {
    const db = seed();
    const provisionPhone = vi
      .fn()
      .mockRejectedValueOnce(new Error("no numbers in area code 249"))
      .mockResolvedValueOnce({ phoneNumber: "+17055550111", agentId: "agent_y" });
    const report = await runEverdoerCallbackSetup(db.client, { apply: true }, { provisionPhone });
    expect(provisionPhone.mock.calls.map((c) => (c[1] as { areaCode: number }).areaCode)).toEqual([249, 705]);
    expect(report.phoneNumber).toBe("+17055550111");

    db.tables.service_catalog_items[0].rate_cents = 19_900;
    const again = await runEverdoerCallbackSetup(db.client, { apply: true }, { provisionPhone: vi.fn().mockResolvedValue({ phoneNumber: "+17055550111", agentId: "a" }) });
    expect(again.steps).toContain('update "Close plan" to $299 per month');
    expect(db.tables.service_catalog_items[0].rate_cents).toBe(29_900);
  });

  it("refuses an org that isn't internal (it would be billed)", async () => {
    await expect(runEverdoerCallbackSetup(seed("operate").client, { apply: true }, { provisionPhone: vi.fn() })).rejects.toThrow(/not "internal"/);
  });
});
