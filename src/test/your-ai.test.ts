/**
 * "Your AI" switches (services/your-ai/switches.ts): each plain switch reads and writes the very
 * setting its AI role uses, defaults included, without touching other sections.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const resync = vi.fn(async () => ({ status: "ok" }));
vi.mock("@/server/services/voice/resync", () => ({ resyncReceptionistAgent: (...args: unknown[]) => resync(...(args as [])) }));
const calls = { outbound: true, plan: true, agent: "agent_sales" as string | null };
vi.mock("@/server/services/voice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice")>()),
  isRetellOutboundActive: () => calls.outbound,
}));
vi.mock("@/server/services/voice/minutes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice/minutes")>()),
  hasReceptionistPlan: async () => calls.plan,
}));
vi.mock("@/server/services/voice/sales-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice/sales-agent")>()),
  salesAgentId: () => calls.agent,
}));

import { SWITCHES, SWITCH_KEYS, aiSettingsMutation, getYourAiView, overlappingAutomations, readSwitches, setSwitch, setYourAiPersona, type CompanySnapshot } from "@/server/services/your-ai/switches";
import { readEstimatorSettings } from "@/server/services/staff/estimator/settings";
import { readCustomerCareSettings } from "@/server/services/staff/customer-care/settings";
import { createFakeDb } from "@/test/helpers/fake-supabase";

const scope = { organizationId: "org-1", companyId: "co-1" };
const house = { doneForYou: false, tier: null };
const dfy = { doneForYou: true, tier: null };

function snapshot(over: Partial<CompanySnapshot> = {}): CompanySnapshot {
  return {
    aiSettings: {},
    reviewSettings: null,
    salesCallSettings: null,
    hasReviewLink: true,
    hasAiNumber: true,
    hasOwnerCell: true,
    leadCalls: "enabled",
    dispatch: { hints: ["Jane's Roofing"] },
    org: house,
    ...over,
  };
}

function stateOf(s: CompanySnapshot) {
  return Object.fromEntries(readSwitches(s).map((x) => [x.key, x.on]));
}

function seed(company: Record<string, unknown> = {}, opts: { platformBrand?: string; aiNumber?: boolean } = {}) {
  return createFakeDb({
    companies: [
      {
        id: "co-1",
        organization_id: "org-1",
        ai_settings: {},
        review_settings: {},
        sales_call_settings: {},
        brand_review_url: null,
        agent_persona: {},
        updated_at: "2026-10-30T10:00:00.000Z",
        ...company,
      },
    ],
    organizations: [{ id: "org-1", platform_brand: opts.platformBrand ?? "empirevu", crankleads_tier: null }],
    voice_numbers: opts.aiNumber ? [{ organization_id: "org-1", company_id: "co-1", provider: "retell", active: true, phone_e164: "+14165550100" }] : [],
  });
}

beforeEach(() => {
  resync.mockClear();
  calls.outbound = true;
  calls.plan = true;
  calls.agent = "agent_sales";
});

describe("the switch list", () => {
  it("every key has one definition, with a label and a group", () => {
    expect(SWITCHES.map((s) => s.key)).toEqual([...SWITCH_KEYS]);
    for (const s of SWITCHES) expect(s.label.length).toBeGreaterThan(3);
  });
});

describe("readSwitches (pure)", () => {
  it("follows each role's defaults: done-for-you on, house orgs off; reviews and lead calls start off", () => {
    const d = stateOf(snapshot({ org: dfy }));
    expect(d.texts && d.calls && d.quote_follow_ups && d.chase_invoices && d.weather && d.morning_briefing).toBe(true);
    expect(d.reviews).toBe(false);
    expect(d.lead_calls).toBe(false);
    const h = stateOf(snapshot());
    expect(Object.values(h).every((on) => on === false)).toBe(true);
  });

  it("reads explicit choices from the right places", () => {
    const s = stateOf(
      snapshot({
        aiSettings: {
          sms_agent: { enabled: true, autonomy: "ask_first" },
          call_answering: { mode: "ai" },
          estimator: { enabled: true, follow_ups: false },
          dispatch: { weather: { enabled: true }, on_our_way: { enabled: false } },
          marketing: { win_back: { enabled: true } },
        },
        reviewSettings: { enabled: true },
        salesCallSettings: { enabled: true },
      }),
    );
    expect(s).toMatchObject({ texts: true, calls: true, quote_follow_ups: false, weather: true, on_our_way: false, win_back: true, reviews: true, lead_calls: true });
    const texts = readSwitches(snapshot({ aiSettings: { sms_agent: { enabled: true, autonomy: "ask_first" } } })).find((x) => x.key === "texts");
    expect(texts?.choice).toBe("ask_first");
  });

  it("texts with autonomy off counts as off; follow-ups need the estimator on", () => {
    expect(stateOf(snapshot({ aiSettings: { sms_agent: { enabled: true, autonomy: "off" } } })).texts).toBe(false);
    expect(stateOf(snapshot({ aiSettings: { estimator: { enabled: false, follow_ups: true } } })).quote_follow_ups).toBe(false);
  });

  it("says what's missing: review link, AI number, owner cell", () => {
    const s = readSwitches(snapshot({ hasReviewLink: false, hasAiNumber: false, hasOwnerCell: false }));
    const needs = (k: string) => s.find((x) => x.key === k)?.needs;
    expect(needs("reviews")).toMatch(/review link/);
    expect(needs("lead_calls")).toMatch(/AI phone number/);
    expect(needs("morning_briefing")).toMatch(/cell number/);
    // Forwarded calls are answered by the shared agent: no number needed.
    expect(s.find((x) => x.key === "calls")).not.toHaveProperty("needs");
    expect(s.find((x) => x.key === "weather")).not.toHaveProperty("needs");
  });

  it("lead calls: outside the plan or not set up says so", () => {
    expect(readSwitches(snapshot({ leadCalls: "not_in_plan" })).find((x) => x.key === "lead_calls")?.needs).toMatch(/Front Desk plan/);
    expect(readSwitches(snapshot({ leadCalls: "not_set_up" })).find((x) => x.key === "lead_calls")?.needs).toMatch(/Not set up/);
  });

  it("check-ins and quote follow-ups need texting on (that's how they go out)", () => {
    const off = readSwitches(snapshot({ aiSettings: { customer_care: { enabled: true, checkins: { enabled: true } } } }));
    expect(off.find((x) => x.key === "check_ins")).toMatchObject({ on: true, needs: expect.stringMatching(/Answer customer texts/) });
    expect(off.find((x) => x.key === "quote_follow_ups")?.needs).toMatch(/Answer customer texts/);
    const on = readSwitches(snapshot({ aiSettings: { sms_agent: { enabled: true }, customer_care: { enabled: true, checkins: { enabled: true } } } }));
    expect(on.find((x) => x.key === "check_ins")).not.toHaveProperty("needs");
  });

  it("weather: says so when no job counts as weather-dependent (indoor trade, unknown trade, none chosen)", () => {
    const weather = (over: Partial<CompanySnapshot>) => readSwitches(snapshot(over)).find((x) => x.key === "weather");
    expect(weather({ dispatch: { hints: ["Acme Services"] } })?.needs).toMatch(/depend on the weather/);
    expect(weather({ dispatch: { hints: ["Acme Services"] }, aiSettings: { dispatch: { weather: { sensitive: "all" } } } })).not.toHaveProperty("needs");
    expect(weather({ aiSettings: { dispatch: { weather: { sensitive: "none" } } } })?.needs).toMatch(/depend on the weather/);
  });

  it("chase invoices is off when its reminder texts are", () => {
    expect(stateOf(snapshot({ aiSettings: { collections: { enabled: true, textReminders: false } } })).chase_invoices).toBe(false);
  });

  it("names an automation that does the same job", () => {
    const s = readSwitches(snapshot({ automations: { reviews: "Review request" } }));
    expect(s.find((x) => x.key === "reviews")?.alsoDoneBy).toBe("Review request");
    expect(s.find((x) => x.key === "texts")).not.toHaveProperty("alsoDoneBy");
  });
});

describe("aiSettingsMutation (pure)", () => {
  const apply = (key: Parameters<typeof aiSettingsMutation>[0], on: boolean, current: Record<string, unknown> = {}, choice?: string) => {
    const m = aiSettingsMutation(key, on, choice);
    if (!m) throw new Error("no mutation");
    return m(current);
  };

  it("follow-ups on also turns the estimator on; off leaves the estimator alone", () => {
    const on = apply("quote_follow_ups", true);
    expect(readEstimatorSettings(on, house)).toMatchObject({ enabled: true, followUps: true });
    const off = apply("quote_follow_ups", false, { estimator: { enabled: true, follow_ups: true, cadence_days: [3, 7, 14] } });
    expect(off.estimator).toEqual({ enabled: true, follow_ups: false, cadence_days: [3, 7, 14] });
  });

  it("check-ins on also turns customer care on; off keeps warranty cases running", () => {
    expect(readCustomerCareSettings(apply("check_ins", true), house)).toMatchObject({ enabled: true, checkins: { enabled: true } });
    const off = readCustomerCareSettings(apply("check_ins", false, { customer_care: { enabled: true, checkins: { enabled: true, delay_days: 3 } } }), house);
    expect(off.enabled).toBe(true);
    expect(off.checkins.enabled).toBe(false);
  });

  it("texts: a choice sets the autonomy; switching on from 'off' autonomy goes back to standard", () => {
    expect(apply("texts", true, {}, "ask_first").sms_agent).toEqual({ enabled: true, autonomy: "ask_first" });
    expect(apply("texts", true, { sms_agent: { enabled: false, autonomy: "off" } }).sms_agent).toEqual({ enabled: true, autonomy: "standard" });
    expect(apply("texts", false, { sms_agent: { enabled: true, autonomy: "ask_first" } }).sms_agent).toEqual({ enabled: false, autonomy: "ask_first" });
  });

  it("phone: on is AI answering, off is voicemail", () => {
    expect(apply("calls", true).call_answering).toEqual({ mode: "ai" });
    expect(apply("calls", false, { call_answering: { mode: "ai", included_minutes: 300 } }).call_answering).toEqual({ mode: "voicemail", included_minutes: 300 });
  });

  it("touches only its own section", () => {
    const current = { sms_agent: { enabled: true }, owner_pause: { until: "x" }, dispatch: { weather: { enabled: true, rain_mm: 1 } } };
    const next = apply("on_our_way", false, current);
    expect(next.sms_agent).toEqual(current.sms_agent);
    expect(next.owner_pause).toEqual(current.owner_pause);
    expect(next.dispatch).toMatchObject({ weather: { enabled: true, rain_mm: 1 }, on_our_way: { enabled: false } });
  });

  it("weekly report, briefing, win-back, collections, weather", () => {
    expect(apply("weekly_report", false).weekly_report).toMatchObject({ enabled: false });
    expect(apply("morning_briefing", true).office_manager).toMatchObject({ enabled: true });
    expect(apply("win_back", true).marketing).toMatchObject({ win_back: { enabled: true } });
    expect(apply("chase_invoices", true).collections).toMatchObject({ enabled: true });
    expect(apply("weather", false).dispatch).toMatchObject({ weather: { enabled: false } });
  });

  it("chase invoices on also turns its reminder texts back on", () => {
    expect(apply("chase_invoices", true, { collections: { enabled: true, textReminders: false } }).collections).toMatchObject({ enabled: true, textReminders: true });
  });

  it("reviews and lead calls live in their own columns", () => {
    expect(aiSettingsMutation("reviews", true)).toBeNull();
    expect(aiSettingsMutation("lead_calls", true)).toBeNull();
  });
});

describe("overlappingAutomations (pure)", () => {
  it("quote follow-up, review request and an on-the-way text automation, this company or org-wide only", () => {
    const out = overlappingAutomations(
      [
        { company_id: null, name: "Quote follow-up", slug: "quote-follow-up", trigger_event: "quote.sent", definition: {} },
        { company_id: "co-2", name: "Other co reviews", slug: "review-request", trigger_event: "booking.completed", definition: {} },
        { company_id: "co-1", name: "Heads up", slug: "custom", trigger_event: "booking.en_route", definition: { actions: [{ type: "send_sms" }] } },
        { company_id: "co-1", name: "Log only", slug: "log", trigger_event: "booking.en_route", definition: { actions: [{ type: "create_task" }] } },
      ],
      "co-1",
    );
    expect(out).toEqual({ quote_follow_ups: "Quote follow-up", on_our_way: "Heads up" });
  });
});

describe("getYourAiView / setSwitch / setYourAiPersona", () => {
  it("the view: persona, every switch with its definition and state", async () => {
    const db = seed({ agent_persona: { name: "Sam", tone: "professional" } }, { platformBrand: "crankleads", aiNumber: true });
    const view = await getYourAiView(db.client, scope);
    expect(view?.persona).toEqual({ name: "Sam", tone: "professional", defaultName: "Marina" });
    expect(view?.switches).toHaveLength(SWITCH_KEYS.length);
    const calls = view?.switches.find((s) => s.key === "calls");
    expect(calls).toMatchObject({ label: "Answer your phone", on: true });
    expect(calls).not.toHaveProperty("needs");
  });

  it("unknown company → null", async () => {
    const db = seed();
    expect(await getYourAiView(db.client, { organizationId: "org-1", companyId: "nope" })).toBeNull();
    expect(await getYourAiView(db.client, { organizationId: "org-2", companyId: "co-1" })).toBeNull();
  });

  it("a switch writes its role's section and keeps the rest", async () => {
    const db = seed({ ai_settings: { sms_agent: { enabled: true }, owner_pause: { until: "2026-11-01" } } });
    const view = await setSwitch(db.client, scope, { key: "quote_follow_ups", on: true });
    expect(view?.switches.find((s) => s.key === "quote_follow_ups")?.on).toBe(true);
    expect(db.tables.companies[0].ai_settings).toEqual({
      sms_agent: { enabled: true },
      owner_pause: { until: "2026-11-01" },
      estimator: { enabled: true, follow_ups: true },
    });
  });

  it("reviews: refused without a review link; with one, review_settings.enabled flips and the rest stays", async () => {
    const db = seed({ review_settings: { delayHours: 24 } });
    await expect(setSwitch(db.client, scope, { key: "reviews", on: true })).rejects.toThrow(/review link/);
    expect(db.tables.companies[0].review_settings).toEqual({ delayHours: 24 });
    db.tables.companies[0].brand_review_url = "https://g.page/r/abc/review";
    await setSwitch(db.client, scope, { key: "reviews", on: true });
    expect(db.tables.companies[0].review_settings).toEqual({ delayHours: 24, enabled: true });
    // Switching off never needs the link.
    db.tables.companies[0].brand_review_url = null;
    await setSwitch(db.client, scope, { key: "reviews", on: false });
    expect(db.tables.companies[0].review_settings).toEqual({ delayHours: 24, enabled: false });
  });

  it("lead calls: sales_call_settings.enabled, other settings kept", async () => {
    const db = seed({ sales_call_settings: { enabled: false, delayMinutes: 2, maxAttempts: 3 } });
    const view = await setSwitch(db.client, scope, { key: "lead_calls", on: true });
    expect(view?.switches.find((s) => s.key === "lead_calls")?.on).toBe(true);
    expect(db.tables.companies[0].sales_call_settings).toMatchObject({ enabled: true, delayMinutes: 2, maxAttempts: 3 });
  });

  it("lead calls can't be switched on outside the plan or before it's set up; off always works", async () => {
    calls.plan = false;
    const db = seed({ sales_call_settings: { enabled: true } });
    await expect(setSwitch(db.client, scope, { key: "lead_calls", on: true })).rejects.toThrow(/Front Desk plan/);
    calls.plan = true;
    calls.agent = null;
    await expect(setSwitch(db.client, scope, { key: "lead_calls", on: true })).rejects.toThrow(/isn't set up/);
    await setSwitch(db.client, scope, { key: "lead_calls", on: false });
    expect(db.tables.companies[0].sales_call_settings).toMatchObject({ enabled: false });
  });

  it("the view names an active automation doing the same job", async () => {
    const db = seed();
    db.tables.workflows = [{ organization_id: "org-1", company_id: null, name: "Review request", slug: "review-request", trigger_event: "booking.completed", definition: {}, status: "active" }];
    const view = await getYourAiView(db.client, scope);
    expect(view?.switches.find((s) => s.key === "reviews")?.alsoDoneBy).toBe("Review request");
  });

  it("persona: saved and the phone receptionist re-synced, only when it changed", async () => {
    const db = seed({ agent_persona: { name: "Sam" } });
    const view = await setYourAiPersona(db.client, scope, { name: "Riley", tone: "casual" });
    expect(view?.persona).toMatchObject({ name: "Riley", tone: "casual" });
    expect(db.tables.companies[0].agent_persona).toEqual({ name: "Riley", tone: "casual" });
    expect(resync).toHaveBeenCalledTimes(1);
    await setYourAiPersona(db.client, scope, { name: "Riley", tone: "casual" });
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("persona: clearing the name goes back to the default", async () => {
    const db = seed({ agent_persona: { name: "Sam", tone: "friendly" } });
    const view = await setYourAiPersona(db.client, scope, { name: null, tone: "friendly" });
    expect(view?.persona.name).toBeNull();
    expect(db.tables.companies[0].agent_persona).toEqual({ tone: "friendly" });
  });

  it("a failed re-sync doesn't fail the save", async () => {
    resync.mockRejectedValueOnce(new Error("retell down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = seed();
    const view = await setYourAiPersona(db.client, scope, { name: "Sam", tone: null });
    expect(view?.persona.name).toBe("Sam");
  });
});
