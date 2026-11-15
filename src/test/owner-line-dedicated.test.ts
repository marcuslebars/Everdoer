/**
 * A number just for the owner's assistant (docs/owner-line.md → "A number just for the
 * assistant"): owners reach their assistant there, everyone else is turned away before any
 * agent answers, and with it set the receptionist's numbers go back to the receptionist for
 * everyone, the owner included.
 */
import crypto from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findOwnerCompanies: vi.fn(),
  loadFacts: vi.fn(),
  loadBrief: vi.fn(async () => null),
  resolveRetellTenant: vi.fn(),
  resolveCatcherTenant: vi.fn(),
}));
vi.mock("@/server/services/owner-channel/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/owner-channel/common")>()),
  findOwnerCompanies: h.findOwnerCompanies,
}));
vi.mock("@/server/services/sms-agent/facts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/sms-agent/facts")>()),
  loadBusinessFacts: h.loadFacts,
}));
vi.mock("@/server/services/voice/owner-brief", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice/owner-brief")>()),
  loadOwnerBrief: h.loadBrief,
}));
vi.mock("@/server/services/retell/tenant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/retell/tenant")>()),
  resolveRetellTenant: h.resolveRetellTenant,
  createRetellAdminClient: () => ({}),
}));
vi.mock("@/server/services/twilio/missed-call", () => ({ resolveCatcherTenant: h.resolveCatcherTenant }));
vi.mock("@/server/services/rate-limit", () => ({ enforceWebhookBackstop: () => Promise.resolve(null) }));
vi.mock("@/server/services/retell/caller-lookup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/retell/caller-lookup")>()),
  loadGreetingContext: async () => ({ companyName: "A1 Marine Care", agentName: "Marina" }),
  lookupCaller: async () => ({ known: false }),
}));

import type { OwnerCompany } from "@/server/services/owner-channel/common";
import type { BusinessFacts } from "@/server/services/sms-agent/facts";
import {
  getOwnerLineConfig,
  homeBusiness,
  isDedicatedOwnerNumber,
  normalizeE164,
  ownerLineForRetellInbound,
  readOwnerLineMetadata,
  REJECT_INBOUND,
  startOwnerLineFromTwilio,
  type OwnerLineConfig,
} from "@/server/services/voice/owner-line";
import { POST as retellInbound } from "@/app/api/retell/inbound/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const CARE = "22222222-2222-4222-8222-222222222222";
const NAMES = "33333333-3333-4333-8333-333333333333";
const OWNER = "+17055296157";
const STRANGER = "+14165550123";
const ASSISTANT_NUMBER = "+12495003606";
const MARINA_NUMBER = "+14314304558";
const SECRET = "token-secret";
const API_KEY = "retell-test-key";
const admin = {} as never;

const company = (over: Partial<OwnerCompany> = {}): OwnerCompany => ({ companyId: CARE, organizationId: ORG, name: "A1 Marine Care", timeZone: "America/Toronto", ownerPhone: OWNER, platformBrand: "everdoer", ...over });
const CARE_CO = company();
const NAMES_CO = company({ companyId: NAMES, name: "boatnames.ca" });
const FACTS = { businessName: "A1 Marine Care", ownerFirstName: "Marcus", timeZone: "America/Toronto", persona: { name: null, tone: null }, priceList: [], qualifyingQuestions: [], urgentKeywords: [], onlineBooking: { slotMinutes: 60 } } as unknown as BusinessFacts;

const BASE_ENV = {
  RETELL_INTAKE_ENABLED: "1",
  RETELL_API_KEY: API_KEY,
  RETELL_FUNCTION_SECRET: SECRET,
  RETELL_OWNER_AGENT_ID: "agent_everly",
  OWNER_LINE_ORG_IDS: ORG,
};
const env = { ...process.env };
afterAll(() => {
  process.env = env;
});
function setEnv(extra: Record<string, string | undefined> = {}) {
  process.env = { ...env, ...BASE_ENV, ...extra };
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete process.env[k];
}
const config = (extra: Record<string, string | undefined> = {}): OwnerLineConfig => getOwnerLineConfig({ ...BASE_ENV, ...extra } as Record<string, string | undefined>);

beforeEach(() => {
  setEnv({ OWNER_LINE_NUMBERS: "+1 (249) 500-3606", OWNER_LINE_HOME_COMPANY_ID: CARE });
  h.findOwnerCompanies.mockReset();
  h.findOwnerCompanies.mockImplementation(async (_a: unknown, phone: string) => (phone === OWNER ? [NAMES_CO, CARE_CO] : []));
  h.loadFacts.mockReset();
  h.loadFacts.mockResolvedValue(FACTS);
  h.resolveRetellTenant.mockReset();
  h.resolveRetellTenant.mockResolvedValue({ organizationId: ORG, companyId: CARE, resolvedBy: "number" });
  h.resolveCatcherTenant.mockReset();
  h.resolveCatcherTenant.mockResolvedValue({ organizationId: ORG, companyId: CARE });
});

describe("configuration", () => {
  it("reads the assistant's numbers in any common format", () => {
    expect(normalizeE164("+1 (249) 500-3606")).toBe(ASSISTANT_NUMBER);
    expect(normalizeE164("2495003606")).toBe(ASSISTANT_NUMBER);
    expect(normalizeE164("12495003606")).toBe(ASSISTANT_NUMBER);
    expect(normalizeE164("555")).toBeNull();
    expect(normalizeE164(null)).toBeNull();
    const c = config({ OWNER_LINE_NUMBERS: "+1 (249) 500-3606, 705-555-0100 ,junk" });
    expect([...c.dedicatedNumbers]).toEqual([ASSISTANT_NUMBER, "+17055550100"]);
    expect(isDedicatedOwnerNumber(c, "+12495003606")).toBe(true);
    expect(isDedicatedOwnerNumber(c, MARINA_NUMBER)).toBe(false);
  });

  it("with an assistant number set, business numbers go back to the receptionist unless asked otherwise", () => {
    expect(config().onBusinessNumbers).toBe(true);
    expect(config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER }).onBusinessNumbers).toBe(false);
    expect(config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER, OWNER_LINE_ON_BUSINESS_NUMBERS: "1" }).onBusinessNumbers).toBe(true);
    expect(config({ OWNER_LINE_ON_BUSINESS_NUMBERS: "0" }).onBusinessNumbers).toBe(false);
  });

  it("the home business: the one named if the caller owns it, else the first by name; never an organization it's off for", () => {
    const c = config({ OWNER_LINE_HOME_COMPANY_ID: CARE });
    expect(homeBusiness([NAMES_CO, CARE_CO], c)).toEqual(CARE_CO);
    expect(homeBusiness([NAMES_CO, CARE_CO], config())).toEqual(CARE_CO);
    expect(homeBusiness([NAMES_CO], c)).toEqual(NAMES_CO);
    expect(homeBusiness([company({ organizationId: OTHER_ORG })], c)).toBeNull();
    expect(homeBusiness([], c)).toBeNull();
  });
});

describe("a call to the assistant's own number", () => {
  const call = (from: string) => ({ from, to: ASSISTANT_NUMBER, agentId: "agent_everly", callId: "call_abc123" });

  it("the owner gets the assistant on the home business, with a signed token, and the other business reachable", async () => {
    const out = await ownerLineForRetellInbound(admin, call(OWNER), { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER, OWNER_LINE_HOME_COMPANY_ID: CARE }) });
    expect(out).toMatchObject({ override_agent_id: "agent_everly" });
    const override = out as { dynamic_variables: Record<string, string>; metadata: Record<string, string> };
    expect(override.dynamic_variables.system_prompt).toContain("A1 Marine Care");
    expect(override.dynamic_variables.system_prompt).toContain("you can reach: boatnames.ca.");
    expect(readOwnerLineMetadata(override.metadata, SECRET, Date.now())).toMatchObject({ organizationId: ORG, companyId: CARE, callRef: "call_abc123" });
    // No tenant lookup by number: the assistant's number isn't any business's.
    expect(h.resolveRetellTenant).not.toHaveBeenCalled();
  });

  it("anyone else is declined before any agent answers", async () => {
    expect(await ownerLineForRetellInbound(admin, call(STRANGER), { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER }) })).toEqual(REJECT_INBOUND);
    expect(h.loadFacts).not.toHaveBeenCalled();
  });

  it("an owner of a business the owner line is off for is declined too", async () => {
    h.findOwnerCompanies.mockResolvedValue([company({ organizationId: OTHER_ORG })]);
    expect(await ownerLineForRetellInbound(admin, call(OWNER), { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER }) })).toEqual(REJECT_INBOUND);
  });

  it("switched off, missing details, or a failing lookup: declined, never handed to the agent bare", async () => {
    expect(await ownerLineForRetellInbound(admin, call(OWNER), { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER, RETELL_OWNER_AGENT_ID: "" }) })).toEqual(REJECT_INBOUND);
    expect(await ownerLineForRetellInbound(admin, { ...call(OWNER), callId: null }, { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER }) })).toEqual(REJECT_INBOUND);
    h.findOwnerCompanies.mockRejectedValueOnce(new Error("db down"));
    expect(await ownerLineForRetellInbound(admin, call(OWNER), { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER }) })).toEqual(REJECT_INBOUND);
  });
});

describe("Marina's numbers are left alone", () => {
  it("Retell: the owner calling a business number gets the receptionist (no override) once the assistant has its own number", async () => {
    const out = await ownerLineForRetellInbound(admin, { from: OWNER, to: MARINA_NUMBER, agentId: "agent_marina", callId: "call_1" }, { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER }) });
    expect(out).toBeNull();
    expect(h.findOwnerCompanies).not.toHaveBeenCalled();
  });

  it("Retell: a customer calling a business number is never declined", async () => {
    expect(await ownerLineForRetellInbound(admin, { from: STRANGER, to: MARINA_NUMBER, agentId: "agent_marina", callId: "call_2" }, { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER, OWNER_LINE_ON_BUSINESS_NUMBERS: "1" }) })).toBeNull();
  });

  it("Twilio: the owner calling the business's own number gets the receptionist", async () => {
    const out = await startOwnerLineFromTwilio(admin, { from: OWNER, to: "+17059962001", callSid: "CA" + "a".repeat(32) }, { config: config({ OWNER_LINE_NUMBERS: ASSISTANT_NUMBER }) });
    expect(out).toEqual({ kind: "none" });
    expect(h.findOwnerCompanies).not.toHaveBeenCalled();
  });

  it("without an assistant number, the owner line on business numbers works as before", async () => {
    const out = await ownerLineForRetellInbound(admin, { from: OWNER, to: MARINA_NUMBER, agentId: "agent_marina", callId: "call_3" }, { config: config() });
    expect(out).toMatchObject({ override_agent_id: "agent_everly" });
  });
});

describe("POST /api/retell/inbound", () => {
  function signed(body: unknown, key = API_KEY): Request {
    const raw = JSON.stringify(body);
    const ts = Date.now();
    const digest = crypto.createHmac("sha256", key).update(raw + ts).digest("hex");
    return new Request("http://x.test/api/retell/inbound", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-retell-signature": `v=${ts},d=${digest}` } });
  }
  const inbound = (from: string, to: string) => ({ event: "call_inbound", call_inbound: { from_number: from, to_number: to, agent_id: "agent_x", call_id: "call_abc123" } });

  it("the assistant's number: the owner gets the override; a stranger gets reject", async () => {
    const owner = (await (await retellInbound(signed(inbound(OWNER, ASSISTANT_NUMBER)))).json()) as { call_inbound: Record<string, unknown> };
    expect(owner.call_inbound.override_agent_id).toBe("agent_everly");
    const stranger = (await (await retellInbound(signed(inbound(STRANGER, ASSISTANT_NUMBER)))).json()) as { call_inbound: Record<string, unknown> };
    expect(stranger.call_inbound).toEqual({ reject: true });
  });

  it("the assistant's number with a bad signature is declined; a business number with one still connects as a new caller", async () => {
    const bad = (await (await retellInbound(signed(inbound(OWNER, ASSISTANT_NUMBER), "wrong-key"))).json()) as { call_inbound: Record<string, unknown> };
    expect(bad.call_inbound).toEqual({ reject: true });
    const business = (await (await retellInbound(signed(inbound(STRANGER, MARINA_NUMBER), "wrong-key"))).json()) as { call_inbound: Record<string, unknown> };
    expect(business.call_inbound.reject).toBeUndefined();
    expect(business.call_inbound.dynamic_variables).toBeDefined();
  });

  it("Marina's number from the owner's cell: the receptionist answers (no override, no reject)", async () => {
    const res = (await (await retellInbound(signed(inbound(OWNER, MARINA_NUMBER)))).json()) as { call_inbound: Record<string, unknown> };
    expect(res.call_inbound.override_agent_id).toBeUndefined();
    expect(res.call_inbound.reject).toBeUndefined();
    expect(res.call_inbound.dynamic_variables).toBeDefined();
  });
});
