/**
 * The owner line (src/server/services/voice/owner-line.ts, docs/owner-line.md): the owner calls
 * their own business number and gets their assistant. These tests pin who counts as the owner,
 * that it is off unless switched on, what the signed call metadata protects, and that business
 * data and actions need a verified caller.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  catcherTenant: null as { organizationId: string; companyId: string } | null,
  retellTenant: { organizationId: null as string | null, companyId: null as string | null, sourceSite: "x", resolvedBy: "number" as "number" | "agent" | "legacy" },
  recordTurn: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/twilio/missed-call", () => ({ resolveCatcherTenant: async () => h.catcherTenant }));
vi.mock("@/server/services/retell/tenant", () => ({ resolveRetellTenant: async () => h.retellTenant }));
vi.mock("@/server/agent/memory", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/agent/memory")>()), recordTurn: h.recordTurn }));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));

import type { AdminClient } from "@/server/services/front-desk/contracts";
import type { OwnerCompany } from "@/server/services/owner-channel/common";
import type { RetellFunctionRequest } from "@/server/services/retell/functions";
import type { BusinessFacts } from "@/server/services/sms-agent/facts";
import { buildOwnerAgentConfig, OWNER_LINE_TOOL_PATH } from "@/server/services/voice/owner-agent";
import {
  buildOwnerLineMetadata,
  buildOwnerLinePrompt,
  carrierVerified,
  getOwnerLineConfig,
  isOwnerLineClaims,
  isOwnerLineWebhook,
  ownerLineForRetellInbound,
  ownerLineOpening,
  readOwnerLineMetadata,
  runOwnerLineTool,
  SAY_OWNER_LINE_UNAVAILABLE,
  spokenDigits,
  startOwnerLineFromTwilio,
  unlockCode,
  type OwnerLineClaims,
  type OwnerLineConfig,
} from "@/server/services/voice/owner-line";
import { ownerWebLookup, spokenAnswer } from "@/server/services/voice/owner-web-lookup";

const ORG = "11111111-1111-4111-8111-111111111111";
const CO = "22222222-2222-4222-8222-222222222222";
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

const COMPANY: OwnerCompany = { companyId: CO, organizationId: ORG, name: "Northshore Roofing", timeZone: "America/Toronto", ownerPhone: OWNER, platformBrand: "everdoer" };

const FACTS = {
  organizationId: ORG,
  companyId: CO,
  businessName: "Northshore Roofing",
  trade: "Roofing",
  ownerFirstName: "Dana",
  timeZone: "America/Toronto",
  hoursText: "Mon–Fri 8am–5pm",
  serviceArea: "Barrie and Innisfil",
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

function registered() {
  const calls: Array<Record<string, unknown>> = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ call_id: "call_abc123" }), { status: 200 });
  };
  return { calls, fetchImpl };
}

beforeEach(() => {
  h.catcherTenant = { organizationId: ORG, companyId: CO };
  h.retellTenant = { organizationId: ORG, companyId: CO, sourceSite: "x", resolvedBy: "number" };
  h.recordTurn.mockClear();
});

describe("configuration", () => {
  const base = { RETELL_INTAKE_ENABLED: "1", RETELL_API_KEY: "k", RETELL_FUNCTION_SECRET: "s" };

  it("is off until the agent id AND an organization list are set", () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, base);
      expect(getOwnerLineConfig({}).enabled).toBe(false);
      expect(getOwnerLineConfig({ RETELL_OWNER_AGENT_ID: "agent_x" }).enabled).toBe(false);
      expect(getOwnerLineConfig({ OWNER_LINE_ORG_IDS: ORG }).enabled).toBe(false);
      const on = getOwnerLineConfig({ RETELL_OWNER_AGENT_ID: "agent_x", OWNER_LINE_ORG_IDS: ` ${ORG} , other ` });
      expect(on.enabled).toBe(true);
      expect(on.orgIds).toEqual(new Set([ORG, "other"]));
      expect(on.trustCallerId).toBe(false);
      expect(on.maxCallSeconds).toBe(20 * 60);
      expect(getOwnerLineConfig({ RETELL_OWNER_AGENT_ID: "agent_x", OWNER_LINE_ORG_IDS: "*" }).orgIds).toBe("all");
    } finally {
      process.env = saved;
    }
  });

  it("only full carrier attestation counts as a verified caller", () => {
    expect(carrierVerified("TN-Validation-Passed-A")).toBe(true);
    for (const v of ["TN-Validation-Passed-B", "TN-Validation-Passed-A-Diverted", "TN-Validation-Failed-A", "No-TN-Validation", "", null, undefined]) {
      expect(carrierVerified(v)).toBe(false);
    }
  });
});

describe("signed call metadata", () => {
  it("round-trips, and anything changed in it is refused", () => {
    const meta = buildOwnerLineMetadata(claims(), SECRET);
    expect(readOwnerLineMetadata(meta, SECRET, NOW.getTime())).toEqual(claims());
    // A different company, or an unverified call claiming to be verified.
    expect(readOwnerLineMetadata({ ...meta, company_id: "33333333-3333-4333-8333-333333333333" }, SECRET, NOW.getTime())).toEqual({ valid: false });
    const unverified = buildOwnerLineMetadata(claims({ callerVerified: false }), SECRET);
    expect(readOwnerLineMetadata({ ...unverified, caller_verified: "1" }, SECRET, NOW.getTime())).toEqual({ valid: false });
    expect(readOwnerLineMetadata(meta, "another-secret", NOW.getTime())).toEqual({ valid: false });
    expect(readOwnerLineMetadata(meta, null, NOW.getTime())).toEqual({ valid: false });
  });

  it("expires, and isn't confused with other calls", () => {
    const meta = buildOwnerLineMetadata(claims(), SECRET);
    expect(readOwnerLineMetadata(meta, SECRET, NOW.getTime() + 4 * 3_600_000)).toEqual({ valid: false });
    expect(readOwnerLineMetadata({ source: "catcher_ai" }, SECRET)).toBeNull();
    expect(readOwnerLineMetadata(null, SECRET)).toBeNull();
    expect(isOwnerLineClaims(readOwnerLineMetadata(meta, SECRET, NOW.getTime()))).toBe(true);
  });

  it("marks owner calls so the post-call pipeline can skip them", () => {
    expect(isOwnerLineWebhook({ event: "call_analyzed", call: { metadata: { source: "owner_line" } } })).toBe(true);
    expect(isOwnerLineWebhook({ event: "call_analyzed", call: { metadata: { source: "catcher_ai" } } })).toBe(false);
    expect(isOwnerLineWebhook({ event: "call_analyzed", call: {} })).toBe(false);
  });

  it("the unlock code is six digits, fixed for a call and different for the next", () => {
    const a = unlockCode(claims(), SECRET);
    expect(a).toMatch(/^\d{6}$/);
    expect(unlockCode(claims(), SECRET)).toBe(a);
    expect(unlockCode(claims({ callRef: "CA" + "b".repeat(32) }), SECRET)).not.toBe(a);
    expect(spokenDigits("4 8 2, 1-5 5")).toBe("482155");
    expect(spokenDigits(undefined)).toBe("");
  });
});

describe("the prompt", () => {
  it("is the owner's assistant, not the receptionist: any topic, by name, with the business facts", () => {
    const prompt = buildOwnerLinePrompt({ facts: FACTS, now: NOW, callerVerified: true });
    expect(prompt).toContain("You are Sam, the AI assistant of Dana, who owns Northshore Roofing.");
    expect(prompt).toContain("This is NOT a customer call");
    expect(prompt).toContain("You are not limited to this business.");
    expect(prompt).toContain('Open with exactly: "Hi Dana, it\'s Sam. What do you need?"');
    expect(prompt).toContain("- web_lookup:");
    expect(prompt).toContain("- business:");
    expect(prompt).toContain("Business name: Northshore Roofing");
    expect(prompt).toContain("The business tool is ready to use on this call.");
    // The receptionist's rule would make it useless as a general assistant.
    expect(prompt).not.toContain("Use ONLY the facts below");
  });

  it("an unverified call is told about the texted code; no owner name falls back cleanly", () => {
    const prompt = buildOwnerLinePrompt({ facts: FACTS, now: NOW, callerVerified: false });
    expect(prompt).toContain("six-digit security code");
    expect(prompt).not.toContain("ready to use on this call");
    expect(ownerLineOpening({ ownerFirstName: null, persona: { name: null, tone: null } })).toBe("Hi, it's Everly. What do you need?");
  });
});

describe("a call to the business's own Twilio number", () => {
  const input = { from: OWNER, to: NUMBER, callSid: "CA" + "a".repeat(32), stirVerstat: "TN-Validation-Passed-A" };
  const deps = (over: Partial<Parameters<typeof startOwnerLineFromTwilio>[2] & object> = {}) => ({ config: CONFIG, now: NOW, findOwnerCompanies: async () => [COMPANY], loadFacts: async () => FACTS, ...over });

  it("switched off: no lookup at all, the call carries on as before", async () => {
    const find = vi.fn(async () => [COMPANY]);
    expect(await startOwnerLineFromTwilio(admin, input, deps({ config: { ...CONFIG, enabled: false }, findOwnerCompanies: find }))).toEqual({ kind: "none" });
    expect(find).not.toHaveBeenCalled();
  });

  it("a customer (not an owner number) is never sent to the owner's assistant", async () => {
    const { calls, fetchImpl } = registered();
    expect(await startOwnerLineFromTwilio(admin, input, deps({ findOwnerCompanies: async () => [], fetchImpl }))).toEqual({ kind: "none" });
    expect(calls).toHaveLength(0);
  });

  it("an owner of a DIFFERENT business, or an organization it isn't on for, gets the normal path", async () => {
    const { calls, fetchImpl } = registered();
    const other = { ...COMPANY, companyId: "99999999-9999-4999-8999-999999999999" };
    expect(await startOwnerLineFromTwilio(admin, input, deps({ findOwnerCompanies: async () => [other], fetchImpl }))).toEqual({ kind: "none" });
    expect(await startOwnerLineFromTwilio(admin, input, deps({ config: { ...CONFIG, orgIds: new Set(["someone-else"]) }, fetchImpl }))).toEqual({ kind: "none" });
    h.catcherTenant = null;
    expect(await startOwnerLineFromTwilio(admin, input, deps({ fetchImpl }))).toEqual({ kind: "none" });
    expect(calls).toHaveLength(0);
  });

  it("the owner: registers the call with the owner agent, its own prompt and signed metadata", async () => {
    const { calls, fetchImpl } = registered();
    const out = await startOwnerLineFromTwilio(admin, input, deps({ fetchImpl }));
    expect(out).toEqual({ kind: "owner", sipUri: "sip:call_abc123@sip.retellai.com", ringTimeoutSeconds: 12, timeLimitSeconds: 1200 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ agent_id: "agent_owner", direction: "inbound", from_number: OWNER, to_number: NUMBER });
    const vars = calls[0].retell_llm_dynamic_variables as Record<string, string>;
    expect(vars.system_prompt).toContain("You are Sam, the AI assistant of Dana");
    expect(readOwnerLineMetadata(calls[0].metadata, SECRET, NOW.getTime())).toMatchObject({ organizationId: ORG, companyId: CO, callRef: input.callSid, callerVerified: true });
  });

  it("without carrier attestation the caller starts unverified (unless the pilot override is on)", async () => {
    const a = registered();
    await startOwnerLineFromTwilio(admin, { ...input, stirVerstat: null }, deps({ fetchImpl: a.fetchImpl }));
    expect(readOwnerLineMetadata(a.calls[0].metadata, SECRET, NOW.getTime())).toMatchObject({ callerVerified: false });
    const b = registered();
    await startOwnerLineFromTwilio(admin, { ...input, stirVerstat: null }, deps({ config: { ...CONFIG, trustCallerId: true }, fetchImpl: b.fetchImpl }));
    expect(readOwnerLineMetadata(b.calls[0].metadata, SECRET, NOW.getTime())).toMatchObject({ callerVerified: true });
  });

  it("a failed registration falls back to the normal call path instead of dropping the call", async () => {
    const fetchImpl = async () => new Response("nope", { status: 500 });
    expect(await startOwnerLineFromTwilio(admin, input, deps({ fetchImpl }))).toEqual({ kind: "none" });
  });
});

describe("a call to a dedicated Retell number", () => {
  const input = { from: OWNER, to: NUMBER, agentId: "agent_receptionist", callId: "call_in_1" };
  const deps = { config: CONFIG, now: NOW, findOwnerCompanies: async () => [COMPANY], loadFacts: async () => FACTS };

  it("the owner gets the owner agent for this call only, bound to Retell's call id", async () => {
    const out = await ownerLineForRetellInbound(admin, input, deps);
    expect(out?.override_agent_id).toBe("agent_owner");
    expect(out?.dynamic_variables.system_prompt).toContain("six-digit security code");
    expect(readOwnerLineMetadata(out?.metadata, SECRET, NOW.getTime())).toMatchObject({ callRef: "call_in_1", callerVerified: false });
  });

  it("never for the legacy env-guessed company, a customer, or when off", async () => {
    h.retellTenant = { organizationId: ORG, companyId: CO, sourceSite: "x", resolvedBy: "legacy" };
    expect(await ownerLineForRetellInbound(admin, input, deps)).toBeNull();
    h.retellTenant = { organizationId: ORG, companyId: CO, sourceSite: "x", resolvedBy: "number" };
    expect(await ownerLineForRetellInbound(admin, input, { ...deps, findOwnerCompanies: async () => [] })).toBeNull();
    expect(await ownerLineForRetellInbound(admin, input, { ...deps, config: { ...CONFIG, enabled: false } })).toBeNull();
    expect(await ownerLineForRetellInbound(admin, { ...input, callId: null }, deps)).toBeNull();
  });
});

describe("the tools", () => {
  const sms = () => vi.fn(async () => ({ status: "sent" as const }));
  const agent = (over: Record<string, unknown> = {}) => vi.fn(async () => ({ reply: "Two jobs today: Dana at 9, Lee at 1.", confirmationId: null, actions: [], rounds: 1, memoryActions: [], ...over }));
  const allow = () => vi.fn(async () => true);

  function request(name: string, args: Record<string, unknown>, c: OwnerLineClaims = claims(), call: Record<string, unknown> = {}): RetellFunctionRequest<Record<string, unknown>> {
    const metadata = buildOwnerLineMetadata(c, SECRET);
    return { name, args, call: { callId: "call_abc123", fromNumber: OWNER, toNumber: NUMBER, agentId: "agent_owner", direction: "inbound", ...call }, raw: { name, args, call: { metadata } } };
  }
  const toolDeps = (over: Record<string, unknown> = {}) => ({ config: CONFIG, nowMs: NOW.getTime(), findOwnerCompanies: async () => [COMPANY], runAgent: agent(), sendSms: sms(), consume: allow(), ...over });

  it("business, verified caller: runs the owner's text-command agent for the call's company and reads back its reply", async () => {
    const runAgent = agent();
    const out = await runOwnerLineTool(admin, request("business", { request: "what's on today?" }), toolDeps({ runAgent }));
    expect(out).toEqual({ ok: true, say: "Two jobs today: Dana at 9, Lee at 1." });
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ ownerPhone: OWNER, body: "what's on today?", scope: expect.objectContaining({ organizationId: ORG, companyId: CO }) }));
    // Calls and texts share one memory.
    expect(h.recordTurn).toHaveBeenCalledWith(admin, expect.objectContaining({ channel: "owner_sms", threadKey: OWNER, userText: "what's on today?" }));
  });

  it("a change is confirmed by a code texted to the owner's phone, never spoken on the call", async () => {
    const sendSms = sms();
    const runAgent = agent({ reply: "Move Dana to Thu 9am? Reply 4821 to confirm, or N to leave it.", confirmationId: "appr-1" });
    const out = await runOwnerLineTool(admin, request("business", { request: "move Dana to Thursday at 9" }), toolDeps({ runAgent, sendSms }));
    expect(out.ok).toBe(true);
    expect(out.say).not.toContain("4821");
    expect(out.say).toContain("texted you the details with a code");
    expect(sendSms).toHaveBeenCalledWith(admin, expect.objectContaining({ to: OWNER, body: expect.stringContaining("Reply 4821") }));
  });

  it("unverified caller: texts a code once, refuses until it is read back, then runs", async () => {
    const c = claims({ callerVerified: false });
    const sendSms = sms();
    const runAgent = agent();
    const consume = vi.fn(async (_a: unknown, key: string) => !(key.startsWith("owner_line_code:") && consume.mock.calls.filter((x) => String(x[1]).startsWith("owner_line_code:")).length > 1));
    const deps = toolDeps({ runAgent, sendSms, consume });

    const first = await runOwnerLineTool(admin, request("business", { request: "who's waiting on me?" }, c), deps);
    expect(first).toMatchObject({ ok: false, reason: "locked" });
    expect(sendSms).toHaveBeenCalledTimes(1);
    const texted = (sendSms.mock.calls[0] as unknown as [unknown, { body: string }])[1].body;
    expect(texted).toContain(unlockCode(c, SECRET));

    // Asking again without the code doesn't text a second one.
    await runOwnerLineTool(admin, request("business", { request: "who's waiting on me?" }, c), deps);
    expect(sendSms).toHaveBeenCalledTimes(1);

    const wrong = await runOwnerLineTool(admin, request("business", { request: "who's waiting on me?", unlock_code: "000000" }, c), deps);
    expect(wrong).toMatchObject({ ok: false, reason: "locked" });
    expect(runAgent).not.toHaveBeenCalled();

    const right = await runOwnerLineTool(admin, request("business", { request: "who's waiting on me?", unlock_code: unlockCode(c, SECRET).split("").join(" ") }, c), deps);
    expect(right.ok).toBe(true);
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it("too many code checks on one call locks the business tool for that call", async () => {
    const c = claims({ callerVerified: false });
    const consume = vi.fn(async (_a: unknown, key: string) => !key.startsWith("owner_line_unlock:"));
    const runAgent = agent();
    const out = await runOwnerLineTool(admin, request("business", { request: "x", unlock_code: unlockCode(c, SECRET) }, c), toolDeps({ consume, runAgent }));
    expect(out).toMatchObject({ ok: false, reason: "locked" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("refuses when the metadata is missing, forged or for an organization it isn't on for", async () => {
    const runAgent = agent();
    const good = request("business", { request: "what's on today?" });
    const forged = { ...good, raw: { call: { metadata: { ...buildOwnerLineMetadata(claims(), SECRET), company_id: "33333333-3333-4333-8333-333333333333" } } } };
    const none = { ...good, raw: { call: {} } };
    for (const req of [forged, none]) {
      expect(await runOwnerLineTool(admin, req, toolDeps({ runAgent }))).toEqual({ ok: false, reason: "unsupported", say: SAY_OWNER_LINE_UNAVAILABLE });
    }
    expect(await runOwnerLineTool(admin, good, toolDeps({ runAgent, config: { ...CONFIG, orgIds: new Set(["someone-else"]) } }))).toMatchObject({ ok: false, reason: "unsupported" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("refuses when the caller is no longer that company's verified owner number", async () => {
    const runAgent = agent();
    const out = await runOwnerLineTool(admin, request("business", { request: "what's on today?" }), toolDeps({ runAgent, findOwnerCompanies: async () => [] }));
    expect(out).toMatchObject({ ok: false, reason: "not_owner" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("a call on a Retell number must be the call the metadata was issued for", async () => {
    const runAgent = agent();
    const c = claims({ callRef: "call_in_1" });
    expect(await runOwnerLineTool(admin, request("business", { request: "x" }, c, { callId: "call_other" }), toolDeps({ runAgent }))).toMatchObject({ ok: false, reason: "unsupported" });
    expect(await runOwnerLineTool(admin, request("business", { request: "x" }, c, { callId: "call_in_1" }), toolDeps({ runAgent }))).toMatchObject({ ok: true });
  });

  it("web_lookup needs no unlock (it exposes nothing) and is rate limited", async () => {
    const webLookup = vi.fn(async () => ({ ok: true, say: "Minus two and snowing in Barrie." }));
    const c = claims({ callerVerified: false });
    const out = await runOwnerLineTool(admin, request("web_lookup", { question: "weather in Barrie right now" }, c), toolDeps({ webLookup, loadFacts: async () => FACTS }));
    expect(out).toEqual({ ok: true, say: "Minus two and snowing in Barrie." });
    expect(webLookup).toHaveBeenCalledWith(expect.objectContaining({ question: "weather in Barrie right now", near: "Barrie and Innisfil", companyId: CO }));
    const limited = await runOwnerLineTool(admin, request("web_lookup", { question: "x" }, c), toolDeps({ webLookup, consume: vi.fn(async () => false) }));
    expect(limited).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("an agent failure is something to say, never a thrown error", async () => {
    const runAgent = vi.fn(async () => {
      throw new Error("model down");
    });
    const out = await runOwnerLineTool(admin, request("business", { request: "what's on today?" }), toolDeps({ runAgent }));
    expect(out).toMatchObject({ ok: false, reason: "error" });
    expect(out.say).toMatch(/try again/i);
  });
});

describe("the shared Retell agent", () => {
  it("is a prompt passthrough with the two tools on the owner-line route, behind the function secret", () => {
    const config = buildOwnerAgentConfig({ baseUrl: "https://api.everdoer.test/", functionSecret: "shh" });
    expect(config.llm.general_prompt).toBe("{{system_prompt}}");
    expect(config.llm.model).toBe("claude-5.5-sonnet");
    const tools = config.llm.general_tools as Array<Record<string, unknown>>;
    expect(tools.map((t) => t.name)).toEqual(["business", "web_lookup", "end_call"]);
    for (const tool of tools.slice(0, 2)) {
      expect(tool.url).toBe(`https://api.everdoer.test${OWNER_LINE_TOOL_PATH}`);
      expect(Object.values(tool.headers as Record<string, string>)).toEqual(["shh"]);
      // The company must come from Retell's trusted call object, never the model's arguments.
      expect(tool.args_at_root).toBe(false);
    }
    const agent = config.agent("llm_1");
    expect(agent.response_engine).toEqual({ type: "retell-llm", llm_id: "llm_1" });
    // An owner call is not a lead: no webhook, no post-call analysis.
    expect(agent.webhook_url).toBeUndefined();
    expect(agent.post_call_analysis_data).toBeUndefined();
    expect(buildOwnerAgentConfig({ baseUrl: "https://x", functionSecret: "s", model: "gpt-6-astra" }).llm.model).toBe("gpt-6-astra");
  });
});

describe("web lookup", () => {
  const input = { question: "who won the Leafs game last night?", organizationId: ORG, companyId: CO, timeZone: "America/Toronto", near: "Barrie", nowMs: NOW.getTime() };
  const message = (content: unknown[]) => ({ id: "msg_1", model: "m", content, usage: { input_tokens: 1, output_tokens: 1 } }) as never;

  it("asks Claude with the web search tool and reads back only the answer text", async () => {
    const create = vi.fn(async () =>
      message([
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "leafs score" } },
        { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
        { type: "text", text: "The Leafs won 4 to 2 " },
        { type: "text", text: "over Ottawa." },
      ]),
    );
    const out = await ownerWebLookup(input, { create });
    expect(out).toEqual({ ok: true, say: "The Leafs won 4 to 2 over Ottawa." });
    const params = (create.mock.calls[0] as unknown as [{ tools: Array<Record<string, unknown>>; system: string }])[0];
    expect(params.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]);
    expect(params.system).toContain("Their business is in Barrie");
  });

  it("no answer or a failure is still something to say", async () => {
    expect(await ownerWebLookup(input, { create: async () => message([]) })).toMatchObject({ ok: false, reason: "no_answer" });
    const failing = { create: async () => Promise.reject(new Error("search off")) };
    expect(await ownerWebLookup(input, failing)).toMatchObject({ ok: false, reason: "error" });
    expect(spokenAnswer({ content: [] })).toBe("");
  });
});
