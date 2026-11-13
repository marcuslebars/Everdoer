/**
 * The owner line's routes (docs/owner-line.md): the Twilio voice webhook sends the owner to
 * their assistant WITHOUT recording a missed call; the <Dial> action; the tool route's gate.
 */
import crypto from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "./fake-supabase";

const h = vi.hoisted(() => ({
  db: null as FakeDb | null,
  start: vi.fn(),
  runTool: vi.fn(),
}));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => h.db?.client }));
vi.mock("@/server/services/rate-limit", () => ({ enforceWebhookBackstop: () => Promise.resolve(null) }));
vi.mock("@/server/services/voice/owner-line", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice/owner-line")>()),
  startOwnerLineFromTwilio: h.start,
  runOwnerLineTool: h.runTool,
}));

import { POST as ownerLineTools } from "@/app/api/retell/functions/owner-line/route";
import { POST as voiceInbound } from "@/app/api/twilio/voice/inbound/route";
import { POST as ownerLineDial } from "@/app/api/twilio/voice/owner-line/route";

const AUTH_TOKEN = "test-auth-token";
const BASE = "https://app.everdoer.test";
const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const NUMBER = "+17055550100";
const OWNER = "+17055550111";

const env = { ...process.env };
afterAll(() => {
  process.env = env;
});

function sign(url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf8")).digest("base64");
}

function twilioRequest(pathWithQuery: string, params: Record<string, string>, signature?: string): Request {
  return new Request(`http://internal:3000${pathWithQuery}`, {
    method: "POST",
    body: new URLSearchParams(params).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature ?? sign(`${BASE}${pathWithQuery}`, params) },
  });
}

const callParams = (over: Record<string, string> = {}) => ({ CallSid: "CA0001", AccountSid: "AC123", From: OWNER, To: NUMBER, CallStatus: "ringing", Direction: "inbound", StirVerstat: "TN-Validation-Passed-A", ...over });

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  process.env.APP_BASE_URL = BASE;
  delete process.env.TWILIO_WEBHOOK_BASE_URL;
  h.start.mockReset();
  h.runTool.mockReset();
  h.db = createFakeDb({
    voice_numbers: [{ id: "vn-1", organization_id: ORG, company_id: COMPANY, phone_e164: NUMBER, provider: "twilio", mode: "missed_call_catcher", active: true, brand_label: null }],
    companies: [{ id: COMPANY, organization_id: ORG, name: "Northshore Roofing", slug: "northshore" }],
  });
});

describe("POST /api/twilio/voice/inbound — the owner calling their own number", () => {
  it("dials the owner's assistant and records NO missed call (no lead, no text-back)", async () => {
    h.start.mockResolvedValue({ kind: "owner", sipUri: "sip:call_abc123@sip.retellai.com", ringTimeoutSeconds: 12, timeLimitSeconds: 1200 });
    const res = await voiceInbound(twilioRequest("/api/twilio/voice/inbound", callParams()));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response>' +
        `<Dial action="${BASE}/api/twilio/voice/owner-line?event=dial" method="POST" timeout="12" timeLimit="1200" answerOnBridge="true">` +
        "<Sip>sip:call_abc123@sip.retellai.com</Sip></Dial></Response>",
    );
    expect(h.db!.tables.inbound_webhook_jobs ?? []).toHaveLength(0);
    // The carrier's attestation for THIS call is what's passed on; nothing from the model or the caller.
    expect(h.start).toHaveBeenCalledWith(expect.anything(), { from: OWNER, to: NUMBER, callSid: "CA0001", stirVerstat: "TN-Validation-Passed-A" });
  });

  it("anyone else (or the owner line off / failing) is a normal missed call, stored first as before", async () => {
    h.start.mockResolvedValue({ kind: "none" });
    const res = await voiceInbound(twilioRequest("/api/twilio/voice/inbound", callParams({ From: "+17055550123" })));
    expect(res.status).toBe(200);
    expect(h.db!.tables.inbound_webhook_jobs).toHaveLength(1);
    expect(await res.text()).toContain("<Record");
  });

  it("a bad signature never reaches the owner check", async () => {
    const res = await voiceInbound(twilioRequest("/api/twilio/voice/inbound", callParams(), "bm90LXRoZS1zaWduYXR1cmU="));
    expect(res.status).toBe(403);
    expect(h.start).not.toHaveBeenCalled();
  });
});

describe("POST /api/twilio/voice/owner-line — the <Dial> action", () => {
  const path = "/api/twilio/voice/owner-line?event=dial";

  it("hangs up after a call that connected", async () => {
    const res = await ownerLineDial(twilioRequest(path, { CallSid: "CA0001", DialCallStatus: "completed" }));
    expect(await res.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  });

  it("says the assistant couldn't pick up when the leg failed (no voicemail: this is the owner)", async () => {
    const res = await ownerLineDial(twilioRequest(path, { CallSid: "CA0001", DialCallStatus: "no-answer" }));
    const xml = await res.text();
    expect(xml).toContain("your assistant couldn't pick up");
    expect(xml).not.toContain("<Record");
  });

  it("rejects an unsigned request", async () => {
    const res = await ownerLineDial(twilioRequest(path, { CallSid: "CA0001", DialCallStatus: "completed" }, "bm90LXRoZS1zaWduYXR1cmU="));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/retell/functions/owner-line", () => {
  const post = (headers: Record<string, string>) =>
    ownerLineTools(new Request(`${BASE}/api/retell/functions/owner-line`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ name: "business", args: { request: "what's on today?" }, call: { call_id: "call_1" } }) }));

  it("needs the shared function secret", async () => {
    process.env.RETELL_FUNCTION_SECRET = "shh";
    process.env.RETELL_INTAKE_ENABLED = "1";
    const res = await post({});
    expect(res.status).toBe(401);
    expect(h.runTool).not.toHaveBeenCalled();
  });

  it("with it, hands the envelope to the tool runner and answers 200 with something to say", async () => {
    process.env.RETELL_FUNCTION_SECRET = "shh";
    process.env.RETELL_INTAKE_ENABLED = "1";
    h.runTool.mockResolvedValue({ ok: true, say: "Two jobs today." });
    const { retellFunctionSecretHeaderForWrite } = await import("@/server/services/retell/auth");
    const res = await post({ [retellFunctionSecretHeaderForWrite()]: "shh" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, say: "Two jobs today." });
    expect(h.runTool).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "business", args: { request: "what's on today?" } }));
  });
});
