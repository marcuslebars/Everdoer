/**
 * One number for everything (src/server/services/onboarding-number.ts): the self-serve Phone
 * step buys ONE local Twilio number that texts and catches forwarded calls, switches AI
 * answering on, and on Front Desk pins the company's own receptionist on that number — which is
 * then what answers the forwarded calls and what Retell tool calls resolve the tenant from.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeTenantContext, type FakeDb } from "./fake-supabase";

vi.mock("@/server/services/company-voice-profiles", () => ({ upsertCompanyVoiceProfile: async () => ({}) }));
vi.mock("@/server/services/workflow-engine/recipes/install", () => ({ installRecipes: async () => ({ installed: [], skipped: [] }) }));
// onboarding_progress over the fake table (the fake client has no upsert().select().single()).
vi.mock("@/server/services/onboarding", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/services/onboarding")>();
  type Row = { organization_id: string; company_id: string; step: string; status: string; data: unknown };
  const rows = () => (h.db as FakeDb).tables.onboarding_progress as Row[];
  return {
    ...real,
    getOnboardingProgress: async (_ctx: unknown, companyId: string) => rows().filter((r) => r.company_id === companyId),
    upsertOnboardingStep: async (ctx: { organizationId: string }, companyId: string, step: string, input: { completed?: boolean; data?: unknown }) => {
      const row = rows().find((r) => r.company_id === companyId && r.step === step);
      const next = { organization_id: ctx.organizationId, company_id: companyId, step, status: input.completed ? "complete" : "in_progress", data: input.data ?? {} };
      if (row) Object.assign(row, next);
      else rows().push(next);
      return next;
    },
    recordOnboardingEvent: async () => undefined,
  };
});
const h = vi.hoisted(() => ({ db: null as unknown }));

import { ValidationError } from "@/server/organizations/context";
import { getBusinessNumberStatus, localAreaCode, setUpBusinessNumber } from "@/server/services/onboarding-number";
import type { RetellClient } from "@/server/services/retell/provision";
import { resolveRetellTenant } from "@/server/services/retell/tenant";
import type { TwilioIncomingNumber, TwilioNumbersClient } from "@/server/services/twilio/provision";
import { decideCallAnswering, type AiAnswerConfig } from "@/server/services/voice/ai-answer";
import { resyncReceptionistForContext } from "@/server/services/voice/resync";
import { answeringCopy } from "@/lib/phone-modes";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const BASE = "https://app.everdoer.test";
const env = { ...process.env };
afterAll(() => {
  process.env = env;
});

function mockTwilio(opts: { emptyAreaCodes?: number[] } = {}) {
  const account: TwilioIncomingNumber[] = [];
  let counter = 0;
  const client = {
    searchAvailableLocal: vi.fn((_country: string, areaCode: number | null) =>
      Promise.resolve(areaCode !== null && opts.emptyAreaCodes?.includes(areaCode) ? [] : [{ phone_number: `+1${areaCode ?? 289}5550${100 + counter}` }]),
    ),
    listIncoming: vi.fn((filter: { phoneNumber?: string; friendlyName?: string }) =>
      Promise.resolve(account.filter((n) => (!filter.phoneNumber || n.phone_number === filter.phoneNumber) && (!filter.friendlyName || n.friendly_name === filter.friendlyName))),
    ),
    purchase: vi.fn((input: { phoneNumber: string; friendlyName: string; voiceUrl: string; smsUrl: string }) => {
      counter += 1;
      const bought = { sid: `PN${counter}`, phone_number: input.phoneNumber, friendly_name: input.friendlyName, voice_url: input.voiceUrl, sms_url: input.smsUrl };
      account.push(bought);
      return Promise.resolve(bought);
    }),
    updateWebhooks: vi.fn((sid: string, input: { voiceUrl: string; smsUrl: string; friendlyName: string }) => {
      const n = account.find((x) => x.sid === sid)!;
      Object.assign(n, { voice_url: input.voiceUrl, sms_url: input.smsUrl, friendly_name: input.friendlyName });
      return Promise.resolve({ ...n });
    }),
  } satisfies TwilioNumbersClient;
  return client;
}

function mockRetell(calls: string[], opts: { fail?: boolean } = {}): RetellClient {
  return {
    createLlm: async () => {
      calls.push("createLlm");
      if (opts.fail) throw new Error("retell down");
      return { llm_id: "llm_fd" };
    },
    updateLlm: async (id) => (calls.push(`updateLlm:${id}`), { llm_id: id }),
    createAgent: async () => (calls.push("createAgent"), { agent_id: "agent_fd" }),
    updateAgent: async (id) => (calls.push(`updateAgent:${id}`), { agent_id: id }),
    createPhoneNumber: async () => (calls.push("createPhoneNumber"), { phone_number: "+15555550000" }),
    updatePhoneNumber: async (n) => (calls.push(`updatePhoneNumber:${n}`), { phone_number: n }),
    listPhoneNumbers: async () => [],
  };
}

let db: FakeDb;
function seed(opts: { plan?: string; aiSettings?: Record<string, unknown>; ownerPhone?: string | null; phoneStep?: Record<string, unknown> } = {}): FakeDb {
  const fake = createFakeDb({
    organizations: [{ id: ORG, plan: opts.plan ?? "operate", subscription_status: "active", crankleads_tier: null, platform_brand: null, stripe_customer_id: null }],
    companies: [
      {
        id: COMPANY,
        organization_id: ORG,
        name: "Northshore Plumbing",
        slug: "northshore",
        hours: { summary: "Mon–Fri 8–5" },
        service_area: "Barrie",
        quote_public_base_url: null,
        industry_pack: null,
        owner_phone_e164: opts.ownerPhone === undefined ? "+17055550111" : opts.ownerPhone,
        brand_reply_phone: null,
        ai_settings: opts.aiSettings ?? {},
        timezone: "America/Toronto",
      },
    ],
    service_catalog_items: [
      { id: "sci-1", organization_id: ORG, company_id: COMPANY, service_key: "drain_clear", label: "Drain clearing", pricing_type: "flat", rate_cents: 14900, minimum_cents: 0, sort_order: 0, active: true },
    ],
    onboarding_progress: opts.phoneStep ? [{ id: "op-1", organization_id: ORG, company_id: COMPANY, step: "phone", status: "complete", data: opts.phoneStep }] : [],
    onboarding_events: [],
    voice_numbers: [],
    missed_calls: [],
    usage_monthly_v: [],
    feature_flags: [],
  });
  h.db = fake; // the onboarding mock reads the current test's table
  return fake;
}
/**
 * The caller's RLS context, as production grants it: the authenticated role has NO update on
 * companies (ai_settings is server-owned). Shipped once writing ai_settings through this client:
 * every "Get my number" failed with "permission denied for table companies".
 */
const ctx = () => {
  const base = fakeTenantContext(db, ORG, "user-1");
  const client = base.supabase as unknown as { from: (t: string) => Record<string, unknown> };
  const from = client.from.bind(client);
  return {
    ...base,
    supabase: {
      ...client,
      from: (table: string) => {
        const q = from(table);
        if (table !== "companies") return q;
        return { ...q, update: () => { throw new Error("permission denied for table companies"); } };
      },
    } as unknown as typeof base.supabase,
  };
};
/** The route's service-role writer (after its checks). */
const writeAiSettings = async (companyId: string, aiSettings: unknown) => {
  const row = db.tables.companies.find((c) => c.id === companyId);
  if (row) row.ai_settings = aiSettings;
};
const lookupOwner = (phone: string) => Promise.resolve((db.tables.voice_numbers.find((r) => r.phone_e164 === phone) as never) ?? null);
const phoneData = () => (db.tables.onboarding_progress.find((r) => r.step === "phone")?.data ?? {}) as Record<string, unknown>;
const catcherRow = () => db.tables.voice_numbers.find((r) => r.provider === "twilio" && r.mode === "missed_call_catcher" && r.active);

beforeEach(() => {
  process.env.APP_BASE_URL = BASE;
  process.env.TWILIO_ACCOUNT_SID = "AC123";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.RETELL_API_KEY = "key_test";
  process.env.RETELL_FUNCTION_SECRET = "fn-secret";
  delete process.env.TWILIO_WEBHOOK_BASE_URL;
  delete process.env.TWILIO_NUMBER_COUNTRY;
  db = seed();
});

describe("localAreaCode", () => {
  it("a local NANP area code, or null (no phone, toll-free, malformed)", () => {
    expect(localAreaCode("+1 (705) 555-0111")).toBe(705);
    expect(localAreaCode("416-555-0100")).toBe(416);
    expect(localAreaCode("+18005550100")).toBeNull();
    expect(localAreaCode("555-0100")).toBeNull();
    expect(localAreaCode(null)).toBeNull();
  });
});

describe("setUpBusinessNumber — any plan", () => {
  it("buys ONE number in the owner's own area code, turns AI answering on, and records the Phone step", async () => {
    const twilio = mockTwilio();
    const calls: string[] = [];
    const result = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: twilio, lookupOwner, retell: mockRetell(calls) });

    expect(twilio.searchAvailableLocal).toHaveBeenCalledWith("CA", 705);
    expect(twilio.purchase).toHaveBeenCalledTimes(1);
    expect(result.number.phoneNumber).toMatch(/^\+1705/);
    expect(catcherRow()).toMatchObject({ company_id: COMPANY, phone_e164: result.number.phoneNumber, provider_agent_id: null });
    // Trial / Operate: the message-taking AI answers; no receptionist is built.
    expect(result).toMatchObject({ answering: "message", receptionist: { status: "not_included" }, answeringTurnedOn: true });
    expect(calls).toEqual([]);
    expect((db.tables.companies[0].ai_settings as Record<string, unknown>).call_answering).toEqual({ mode: "ai" });
    expect(phoneData()).toMatchObject({ mode: "missed_call_catcher", setup: "one_number", catcherNumber: result.number.phoneNumber });
    expect(phoneData().phoneNumber).toBeUndefined();
    expect(db.tables.onboarding_progress.find((r) => r.step === "phone")?.status).toBe("complete");
  });

  it("idempotent: a second run re-checks the same number instead of buying another", async () => {
    const twilio = mockTwilio();
    const first = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: twilio, lookupOwner });
    const second = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: twilio, lookupOwner });
    expect(second.number.phoneNumber).toBe(first.number.phoneNumber);
    expect(twilio.purchase).toHaveBeenCalledTimes(1);
    expect(second.answeringTurnedOn).toBe(false); // already on — now an explicit setting
  });

  it("an owner who chose voicemail keeps it", async () => {
    db = seed({ aiSettings: { call_answering: { mode: "voicemail" }, sms_agent: { enabled: true } } });
    const result = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner });
    expect(result).toMatchObject({ answering: "voicemail", answeringTurnedOn: false });
    expect(db.tables.companies[0].ai_settings).toEqual({ call_answering: { mode: "voicemail" }, sms_agent: { enabled: true } });
  });

  it("the owner's area code is sold out → any local number; an area code the owner typed is not second-guessed", async () => {
    const twilio = mockTwilio({ emptyAreaCodes: [705] });
    const result = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: twilio, lookupOwner });
    expect(twilio.searchAvailableLocal).toHaveBeenLastCalledWith("CA", null);
    expect(result.number.purchased).toBe(true);

    db = seed();
    await expect(setUpBusinessNumber(ctx(), { companyId: COMPANY, areaCode: 705 }, { writeAiSettings, client: mockTwilio({ emptyAreaCodes: [705] }), lookupOwner })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("no owner phone → Twilio picks (no area code)", async () => {
    db = seed({ ownerPhone: null });
    const twilio = mockTwilio();
    await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: twilio, lookupOwner });
    expect(twilio.searchAvailableLocal).toHaveBeenCalledWith("CA", null);
  });
});

describe("setUpBusinessNumber — Front Desk: the receptionist lives on the same number", () => {
  const AI_CONFIG: AiAnswerConfig = {
    enabled: true, apiKey: "key", messageAgentId: "agent_msg", tokenSecret: "secret", sipDomain: "sip.test",
    ringTimeoutSeconds: 12, registerTimeoutMs: 2000, watchdogMinutes: 30,
  };

  it("builds the LLM + agent WITHOUT buying a Retell number and pins the agent on the Twilio number", async () => {
    db = seed({ plan: "front_desk" });
    const calls: string[] = [];
    const result = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner, retell: mockRetell(calls) });

    expect(calls).toEqual(["createLlm", "createAgent"]);
    expect(result).toMatchObject({ answering: "receptionist", receptionist: { status: "ready", agentId: "agent_fd" } });
    expect(catcherRow()?.provider_agent_id).toBe("agent_fd");
    expect(db.tables.voice_numbers.filter((r) => r.provider === "retell")).toHaveLength(0);
    expect(phoneData()).toMatchObject({ catcherAgent: { llmId: "llm_fd", agentId: "agent_fd" } });

    // Forwarded calls go to that receptionist…
    const decision = await decideCallAnswering(db.client as never, { organizationId: ORG, companyId: COMPANY, companyName: "Northshore Plumbing" }, { config: AI_CONFIG, billingHealthy: async () => true });
    expect(decision, JSON.stringify(decision)).toMatchObject({ kind: "ai", agentId: "agent_fd", agentKind: "receptionist" });
    // …and its tool calls (book / quote) find the company by agent id.
    const tenant = await resolveRetellTenant(db.client as never, { toNumber: null, agentId: "agent_fd", legacySourceSite: "x" });
    expect(tenant).toMatchObject({ organizationId: ORG, companyId: COMPANY, resolvedBy: "agent" });
  });

  it("a re-run (or a re-sync) UPDATES the same receptionist and keeps it pinned", async () => {
    db = seed({ plan: "front_desk" });
    const twilio = mockTwilio();
    await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: twilio, lookupOwner, retell: mockRetell([]) });
    const calls: string[] = [];
    await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: twilio, lookupOwner, retell: mockRetell(calls) });
    expect(calls).toEqual(["updateLlm:llm_fd", "updateAgent:agent_fd"]);
    expect(catcherRow()?.provider_agent_id).toBe("agent_fd");

    const resyncCalls: string[] = [];
    const outcome = await resyncReceptionistForContext(ctx(), COMPANY, mockRetell(resyncCalls));
    expect(outcome).toMatchObject({ status: "resynced", agentId: "agent_fd", phoneNumber: catcherRow()?.phone_e164 });
    expect(resyncCalls).toEqual(["updateLlm:llm_fd", "updateAgent:agent_fd"]);
  });

  it("Retell fails → the number still works (message AI answers) and the step is still done", async () => {
    db = seed({ plan: "front_desk" });
    const result = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner, retell: mockRetell([], { fail: true }) });
    expect(result).toMatchObject({ answering: "message", receptionist: { status: "failed" } });
    expect(catcherRow()).toBeTruthy();
    expect(db.tables.onboarding_progress.find((r) => r.step === "phone")?.status).toBe("complete");
    const decision = await decideCallAnswering(db.client as never, { organizationId: ORG, companyId: COMPANY, companyName: "Northshore Plumbing" }, { config: AI_CONFIG, billingHealthy: async () => true });
    expect(decision).toMatchObject({ kind: "ai", agentId: "agent_msg", agentKind: "message" });
  });

  it("a company that already has a dedicated AI line keeps it — nothing new is built", async () => {
    db = seed({ plan: "front_desk", phoneStep: { llmId: "llm_old", agentId: "agent_old", phoneNumber: "+17055559999" } });
    db.tables.voice_numbers.push({ id: "vn-ret", organization_id: ORG, company_id: COMPANY, phone_e164: "+17055559999", provider: "retell", mode: "ai_receptionist", provider_agent_id: "agent_old", active: true });
    const calls: string[] = [];
    const result = await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner, retell: mockRetell(calls) });
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ answering: "receptionist", receptionist: { status: "dedicated_line" } });
    // The dedicated line's ids are untouched (re-sync still updates THAT receptionist).
    expect(phoneData()).toMatchObject({ llmId: "llm_old", agentId: "agent_old", phoneNumber: "+17055559999", setup: "one_number" });
  });
});

describe("getBusinessNumberStatus + copy", () => {
  it("reports the number, who answers, and whether the receptionist is included", async () => {
    expect(await getBusinessNumberStatus(ctx(), COMPANY)).toMatchObject({ number: null, answering: "voicemail", receptionistIncluded: false });
    await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner });
    const status = await getBusinessNumberStatus(ctx(), COMPANY);
    expect(status).toMatchObject({ configured: true, answering: "message", receptionistIncluded: false, dedicatedLine: false, dedicatedLineAllowed: false, textsOn: false, forwardingVerifiedAt: null });
    expect(status.number?.phoneNumberPretty).toMatch(/^\(705\)/);
  });

  it("the Phone step says plainly who picks up", () => {
    expect(answeringCopy("receptionist", true)).toMatch(/quotes .* books/);
    expect(answeringCopy("message", false)).toMatch(/takes a message.*Front Desk/);
    expect(answeringCopy("voicemail", false)).toMatch(/off/);
  });
});

describe("re-sync picks the receptionist that actually answers", () => {
  it("old dedicated-line ids left in the step data don't win over the pinned agent once that line is gone", async () => {
    // The old catcher route wrote the catcher number into phoneNumber next to old AI ids.
    db = seed({ plan: "front_desk", phoneStep: { llmId: "llm_old", agentId: "agent_old", phoneNumber: "+17055550100" } });
    await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner, retell: mockRetell([]) });
    expect(phoneData()).not.toHaveProperty("agentId"); // stale ids dropped when the pinned agent was built
    const calls: string[] = [];
    await resyncReceptionistForContext(ctx(), COMPANY, mockRetell(calls));
    expect(calls).toEqual(["updateLlm:llm_fd", "updateAgent:agent_fd"]);
  });

  it("an LLM made before a failed agent create is reused on retry (no orphan)", async () => {
    db = seed({ plan: "front_desk" });
    const failing: RetellClient = { ...mockRetell([]), createAgent: async () => { throw new Error("agent create failed"); } };
    await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner, retell: failing });
    expect(phoneData()).toMatchObject({ catcherAgent: { llmId: "llm_fd" } });
    const calls: string[] = [];
    await setUpBusinessNumber(ctx(), { companyId: COMPANY }, { writeAiSettings, client: mockTwilio(), lookupOwner, retell: mockRetell(calls) });
    expect(calls).toEqual(["updateLlm:llm_fd", "createAgent"]);
  });
});
