/**
 * Sales calls (docs/sales-calls.md): settings, the calling window, consent + do-not-call,
 * speed-to-lead queuing, the dial-time rules, placing on the sales agent, outcomes + retries +
 * owner texts, the owner-requested flow, the sales prompt / agent, and outbound tool requests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callContactWithMarina = vi.fn();
const isRetellOutboundActive = vi.fn(() => true);
vi.mock("@/server/services/voice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice")>()),
  callContactWithMarina: (...a: unknown[]) => callContactWithMarina(...a),
  isRetellOutboundActive: () => isRetellOutboundActive(),
}));
const requireReceptionistMinutes = vi.fn();
vi.mock("@/server/services/voice/minutes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice/minutes")>()),
  requireReceptionistMinutes: (...a: unknown[]) => requireReceptionistMinutes(...a),
}));
vi.mock("@/server/services/voice/company-facts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/voice/company-facts")>()),
  loadCompanyFacts: vi.fn(async () => ({ companyName: "Northshore Home", services: ["Gutter cleaning — $180"], hoursText: "Mon–Fri 8–5", serviceArea: "Midland", transferNumber: null })),
}));
const sendOwnerSms = vi.fn();
vi.mock("@/server/services/owner-channel/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/owner-channel/common")>()),
  sendOwnerSms: (...a: unknown[]) => sendOwnerSms(...a),
  ownerAlertGate: vi.fn(async () => "send"),
}));

import { UsageCapExceeded } from "@/server/organizations/context";
import { parseRetellFunctionBody } from "@/server/services/retell/functions";
import { buildSalesCallPrompt, salesOpeningLine } from "@/server/services/retell/outbound-prompt";
import { addDoNotCall, callingWindow, findCallConsent, isDoNotCall, nextCallableAt, recordCallConsent } from "@/server/services/sales-calls/compliance";
import { executeSalesCallCommand, salesCallProposal } from "@/server/services/sales-calls/owner-request";
import {
  placeSalesCall,
  processDueSalesCalls,
  readSalesAnalysis,
  recordSalesCallOutcome,
  salesCallResultText,
  scheduleSalesCall,
  tomorrowsOpening,
  type SalesCallRow,
} from "@/server/services/sales-calls/queue";
import { applySalesCallPatch, DEFAULT_SALES_CALL_SETTINGS, parseSalesCallSettings } from "@/server/services/sales-calls/settings";
import { leadNote, maybeScheduleSpeedToLead } from "@/server/services/sales-calls/speed-to-lead";
import type { LeadEnvelope } from "@/server/services/lead-intake/envelope";
import { buildPublicFormEnvelope, callConsentText } from "@/server/services/lead-intake/public-form-envelope";
import { buildSalesAgentConfig, SALES_TOOL_NAMES } from "@/server/services/voice/sales-agent";
import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

const ORG = "org-1";
const CO = "co-1";
const scope = { organizationId: ORG, companyId: CO };
const TZ = "America/Toronto";
// Wed 2026-10-28, EDT (UTC-4): 14:00Z = 10:00 local.
const WED_10AM = Date.parse("2026-10-28T14:00:00Z");

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}): FakeDb {
  return createFakeDb(
    {
      companies: [{ id: CO, organization_id: ORG, name: "Northshore Home", timezone: TZ, owner_phone_e164: "+17055550100", sales_call_settings: { enabled: true, delayMinutes: 5, maxAttempts: 2, retryMinutes: 120 } }],
      organizations: [{ id: ORG, platform_brand: null }],
      contacts: [
        { id: "ct-1", organization_id: ORG, company_id: CO, first_name: "Sam", last_name: "Lee", phone: "+17055550123" },
        { id: "ct-2", organization_id: ORG, company_id: CO, first_name: "Kim", last_name: null, phone: "(705) 555-0177" },
      ],
      voice_numbers: [{ id: "vn-1", organization_id: ORG, company_id: CO, provider: "retell", active: true, phone_e164: "+17055550001" }],
      call_consents: [],
      do_not_call: [],
      sales_calls: [],
      bookings: [],
      retell_calls: [],
      ...extra,
    },
    { sales_calls: [["company_id", "contact_id", "status"]] },
  );
}

let db: FakeDb;

function consent(contactId = "ct-1", last10 = "7055550123") {
  db.tables.call_consents.push({ id: `cc-${contactId}`, organization_id: ORG, company_id: CO, contact_id: contactId, phone_last10: last10, source: "form_optin", evidence: "Yes, call me", captured_at: "2026-10-28T13:00:00Z", revoked_at: null });
}

function queued(over: Partial<SalesCallRow> = {}): SalesCallRow {
  const row = {
    id: `sc-${db.tables.sales_calls.length + 1}`,
    organization_id: ORG,
    company_id: CO,
    contact_id: "ct-1",
    reason: "speed_to_lead",
    status: "scheduled",
    run_at: new Date(WED_10AM).toISOString(),
    attempt: 1,
    max_attempts: 2,
    requested_by_phone: null,
    note: "Gutter cleaning",
    raw_lead_id: "lead-1",
    claimed_at: null,
    claimed_by: null,
    retell_call_id: null,
    placed_at: null,
    outcome: null,
    skip_reason: null,
    last_error: null,
    owner_notified_at: null,
    created_at: "2026-10-28T13:55:00Z",
    updated_at: "2026-10-28T13:55:00Z",
    ...over,
  } as SalesCallRow;
  db.tables.sales_calls.push(row as unknown as Record<string, unknown>);
  return row;
}

function rowOf(id: string) {
  return db.tables.sales_calls.find((r) => r.id === id) as Record<string, unknown>;
}

beforeEach(() => {
  db = seed();
  process.env.RETELL_SALES_AGENT_ID = "agent_sales";
  callContactWithMarina.mockReset().mockResolvedValue({ agentCallId: "call_abc", toNumber: "+17055550123" });
  isRetellOutboundActive.mockReset().mockReturnValue(true);
  requireReceptionistMinutes.mockReset().mockResolvedValue(undefined);
  sendOwnerSms.mockReset().mockResolvedValue({ status: "sent" });
  db.onRpc(() => ({ data: true, error: null }));
});

afterEach(() => {
  delete process.env.RETELL_SALES_AGENT_ID;
});

describe("settings", () => {
  it("defaults off and clamps every number", () => {
    expect(parseSalesCallSettings(null)).toEqual(DEFAULT_SALES_CALL_SETTINGS);
    expect(parseSalesCallSettings({ enabled: "yes", delayMinutes: 0, maxAttempts: 9, retryMinutes: 5, dailyCap: 1e6, voicemail: "hang_up", junk: 1 })).toEqual({
      enabled: false,
      delayMinutes: 1,
      maxAttempts: 3,
      retryMinutes: 30,
      dailyCap: 200,
      voicemail: "hang_up",
    });
    expect(applySalesCallPatch(DEFAULT_SALES_CALL_SETTINGS, { enabled: true, delayMinutes: 10, maxAttempts: undefined })).toMatchObject({ enabled: true, delayMinutes: 10, maxAttempts: 2 });
  });
});

describe("calling window (CRTC hours, company time zone)", () => {
  const at = (iso: string) => Date.parse(iso);
  it("weekdays 9:00-21:30 and weekends 10:00-18:00, with a 15-minute end margin", () => {
    expect(callingWindow(at("2026-10-28T13:00:00Z"), TZ).open).toBe(true); // Wed 9:00
    expect(callingWindow(at("2026-10-28T12:59:00Z"), TZ)).toEqual({ open: false, nextOpenMs: at("2026-10-28T13:00:00Z") }); // Wed 8:59 → 9:00
    expect(callingWindow(at("2026-10-29T01:20:00Z"), TZ)).toEqual({ open: false, nextOpenMs: at("2026-10-29T13:00:00Z") }); // Wed 21:20 → Thu 9:00
    expect(callingWindow(at("2026-10-31T01:20:00Z"), TZ)).toEqual({ open: false, nextOpenMs: at("2026-10-31T14:00:00Z") }); // Fri 21:20 → Sat 10:00
    expect(callingWindow(at("2026-10-29T01:10:00Z"), TZ).open).toBe(true); // Wed 21:10 (before the 21:15 cut-off)
    expect(callingWindow(at("2026-10-31T13:30:00Z"), TZ).open).toBe(false); // Sat 9:30
    expect(callingWindow(at("2026-10-31T21:50:00Z"), TZ)).toEqual({ open: false, nextOpenMs: at("2026-11-01T15:00:00Z") }); // Sat 17:50 → Sun 10:00 EST (DST ends)
    expect(callingWindow(at("2026-11-01T17:00:00Z"), TZ).open).toBe(true); // Sun 12:00
  });

  it("nextCallableAt keeps an open time and tomorrowsOpening skips to the next day's start", () => {
    expect(nextCallableAt(WED_10AM, TZ)).toBe(WED_10AM);
    expect(tomorrowsOpening(WED_10AM, TZ)).toBe(at("2026-10-29T13:00:00Z"));
    expect(tomorrowsOpening(at("2026-10-30T14:00:00Z"), TZ)).toBe(at("2026-10-31T14:00:00Z")); // Fri → Sat 10:00
  });
});

describe("consent + do-not-call", () => {
  it("consent is for the contact's CURRENT number", async () => {
    await recordCallConsent(db.client, { scope, contactId: "ct-1", phone: "+1 705 555 0123", source: "form_optin", evidence: "  Yes,   call me  ", sourceRef: "lead-1" });
    expect(db.tables.call_consents[0]).toMatchObject({ phone_last10: "7055550123", evidence: "Yes, call me", source_ref: "lead-1" });
    expect(await findCallConsent(db.client, scope, { id: "ct-1", phone: "+17055550123" })).not.toBeNull();
    expect(await findCallConsent(db.client, scope, { id: "ct-1", phone: "+14165550000" })).toBeNull();
    expect(await recordCallConsent(db.client, { scope, contactId: "ct-1", phone: "123", source: "form_optin", evidence: "x" })).toBeNull();
  });

  it("a do-not-call request revokes consent, cancels waiting calls, and expires", async () => {
    consent();
    queued();
    await addDoNotCall(db.client, { scope, phone: "+17055550123", source: "call", contactId: "ct-1", nowMs: WED_10AM });
    expect(await isDoNotCall(db.client, scope, "705-555-0123", WED_10AM)).toBe(true);
    expect(await isDoNotCall(db.client, scope, "705-555-0123", Date.parse("2030-01-01T00:00:00Z"))).toBe(false);
    expect(db.tables.call_consents[0].revoked_at).toBeTruthy();
    expect(db.tables.sales_calls[0]).toMatchObject({ status: "cancelled", skip_reason: "do_not_call" });
    // A repeat request renews the entry (one row), even after it expired.
    db.tables.do_not_call[0].expires_at = "2026-01-01T00:00:00Z";
    await addDoNotCall(db.client, { scope, phone: "+17055550123", source: "owner", nowMs: WED_10AM });
    expect(db.tables.do_not_call).toHaveLength(1);
    expect(Date.parse(String(db.tables.do_not_call[0].expires_at))).toBeGreaterThan(Date.parse("2029-11-01T00:00:00Z"));
    expect(await isDoNotCall(db.client, scope, "705-555-0123", WED_10AM)).toBe(true);
  });
});

describe("speed-to-lead", () => {
  function envelope(over: Partial<LeadEnvelope> = {}, granted = true): LeadEnvelope {
    return {
      schemaVersion: 1,
      source: "public_form",
      sourceSite: "northshore",
      formType: "quote",
      receivedAt: "2026-10-28T13:59:00Z",
      contact: { name: "Sam Lee", phone: "705-555-0123" },
      services: ["Gutter cleaning"],
      message: "Service: Gutter cleaning\nTwo-storey house, gutters overflowing",
      meta: { callConsent: { granted, text: callConsentText("Northshore Home"), capturedAt: "2026-10-28T13:59:00Z" } },
      ...over,
    } as LeadEnvelope;
  }

  it("records the consent and queues a call after the delay", async () => {
    const r = await maybeScheduleSpeedToLead(db.client, { organizationId: ORG, companyId: CO, contactId: "ct-1", envelope: envelope(), leadId: "lead-1", nowMs: WED_10AM });
    expect(r).toMatchObject({ scheduled: true, runAtMs: WED_10AM + 5 * 60_000 });
    expect(db.tables.call_consents[0]).toMatchObject({ source: "form_optin", source_ref: "lead-1", phone_last10: "7055550123" });
    expect(String(db.tables.call_consents[0].evidence)).toContain("automated assistant");
    expect(db.tables.sales_calls[0]).toMatchObject({ reason: "speed_to_lead", status: "scheduled", max_attempts: 2, raw_lead_id: "lead-1", note: "Gutter cleaning - Two-storey house, gutters overflowing" });
  });

  it("does nothing without the tick, keeps consent when calls are off, and refuses another number", async () => {
    expect(await maybeScheduleSpeedToLead(db.client, { organizationId: ORG, companyId: CO, contactId: "ct-1", envelope: envelope({}, false), leadId: "l", nowMs: WED_10AM })).toEqual({ scheduled: false, reason: "no_consent" });
    expect(db.tables.call_consents).toHaveLength(0);

    db.tables.companies[0].sales_call_settings = { enabled: false };
    expect(await maybeScheduleSpeedToLead(db.client, { organizationId: ORG, companyId: CO, contactId: "ct-1", envelope: envelope(), leadId: "l", nowMs: WED_10AM })).toEqual({ scheduled: false, reason: "turned_off" });
    expect(db.tables.call_consents).toHaveLength(1);
    expect(db.tables.sales_calls).toHaveLength(0);

    const other = envelope({ contact: { name: "Sam", phone: "416-555-0000" } });
    expect(await maybeScheduleSpeedToLead(db.client, { organizationId: ORG, companyId: CO, contactId: "ct-1", envelope: other, leadId: "l", nowMs: WED_10AM })).toEqual({ scheduled: false, reason: "phone_mismatch" });
  });

  it("a second enquiry while a call is waiting doesn't queue another", async () => {
    await maybeScheduleSpeedToLead(db.client, { organizationId: ORG, companyId: CO, contactId: "ct-1", envelope: envelope(), leadId: "l1", nowMs: WED_10AM });
    expect(await maybeScheduleSpeedToLead(db.client, { organizationId: ORG, companyId: CO, contactId: "ct-1", envelope: envelope(), leadId: "l2", nowMs: WED_10AM })).toEqual({ scheduled: false, reason: "already_open" });
  });

  it("the note is the service plus their words", () => {
    expect(leadNote({ services: ["Roof repair"], message: "Service: Roof repair\nLeak over the kitchen" })).toBe("Roof repair - Leak over the kitchen");
    expect(leadNote({ services: [], message: undefined })).toBeNull();
  });
});

describe("placing a call (every rule at dial time)", () => {
  it("dials on the sales agent from the company's own number with the sales prompt", async () => {
    consent();
    const row = queued();
    const r = await placeSalesCall(db.client, row, { nowMs: WED_10AM });
    expect(r.status).toBe("placed");
    expect(callContactWithMarina).toHaveBeenCalledTimes(1);
    const [, contactId, opts] = callContactWithMarina.mock.calls[0] as [unknown, string, { sales: { salesCallId: string; agentId: string; fromNumber: string; prompt: string } }];
    expect(contactId).toBe("ct-1");
    expect(opts.sales).toMatchObject({ salesCallId: row.id, agentId: "agent_sales", fromNumber: "+17055550001" });
    expect(opts.sales.prompt).toContain("This is the automated assistant calling for Northshore Home, and this call may be recorded.");
    expect(opts.sales.prompt).toContain("Gutter cleaning — $180");
    expect(opts.sales.prompt).toContain("(705) 555-0001");
    expect(rowOf(row.id)).toMatchObject({ status: "placed", retell_call_id: "call_abc" });
  });

  it("outside calling hours: back to scheduled at the next opening, nothing dialed", async () => {
    consent();
    const row = queued();
    const late = Date.parse("2026-10-29T01:20:00Z"); // Wed 21:20
    const r = await placeSalesCall(db.client, row, { nowMs: late });
    expect(r).toMatchObject({ status: "deferred", runAtMs: Date.parse("2026-10-29T13:00:00Z") });
    expect(rowOf(row.id)).toMatchObject({ status: "scheduled", run_at: "2026-10-29T13:00:00.000Z", claimed_at: null });
    expect(callContactWithMarina).not.toHaveBeenCalled();
  });

  it.each([
    ["no consent", () => undefined, "no_consent"],
    ["do-not-call", () => { consent(); db.tables.do_not_call.push({ organization_id: ORG, company_id: CO, phone_last10: "7055550123", expires_at: "2029-01-01T00:00:00Z" }); }, "do_not_call"],
    ["lead calls off", () => { consent(); db.tables.companies[0].sales_call_settings = { enabled: false }; }, "turned_off"],
    ["no AI number", () => { consent(); db.tables.voice_numbers = []; }, "no_business_number"],
    ["already booked", () => { consent(); db.tables.bookings.push({ id: "b1", organization_id: ORG, contact_id: "ct-1", status: "confirmed", created_at: "2026-10-28T13:57:00Z" }); }, "already_in_touch"],
    ["called us", () => { consent(); db.tables.retell_calls.push({ call_id: "in1", organization_id: ORG, contact_id: "ct-1", direction: "inbound", received_at: "2026-10-28T13:58:00Z" }); }, "already_in_touch"],
    ["not set up", () => { consent(); delete process.env.RETELL_SALES_AGENT_ID; }, "not_set_up"],
  ])("skips: %s", async (_label, arrange, reason) => {
    arrange();
    const row = queued();
    const r = await placeSalesCall(db.client, row, { nowMs: WED_10AM });
    expect(r).toMatchObject({ status: "skipped", reason });
    expect(rowOf(row.id)).toMatchObject({ status: "skipped", skip_reason: reason });
    expect(callContactWithMarina).not.toHaveBeenCalled();
  });

  it("an owner-requested call goes ahead with lead calls off; the daily cap defers to tomorrow", async () => {
    consent();
    db.tables.companies[0].sales_call_settings = { enabled: false };
    expect((await placeSalesCall(db.client, queued({ reason: "owner_request" }), { nowMs: WED_10AM })).status).toBe("placed");

    consent("ct-2", "7055550177");
    db.onRpc(() => ({ data: false, error: null }));
    const capped = queued({ contact_id: "ct-2", reason: "owner_request" });
    expect(await placeSalesCall(db.client, capped, { nowMs: WED_10AM })).toMatchObject({ status: "deferred", runAtMs: Date.parse("2026-10-29T13:00:00Z") });
  });

  it("no minutes → skipped; a failed placement is failed and never redialed", async () => {
    consent();
    requireReceptionistMinutes.mockRejectedValueOnce(new UsageCapExceeded("minutes"));
    const a = queued();
    expect(await placeSalesCall(db.client, a, { nowMs: WED_10AM })).toMatchObject({ status: "skipped", reason: "no_minutes" });

    callContactWithMarina.mockRejectedValueOnce(new Error("retell 500"));
    const b = queued({ contact_id: "ct-1" });
    expect(await placeSalesCall(db.client, b, { nowMs: WED_10AM })).toMatchObject({ status: "failed" });
    expect(rowOf(b.id)).toMatchObject({ status: "failed", last_error: "retell 500" });
    // A second worker finds nothing to claim.
    expect((await placeSalesCall(db.client, b, { nowMs: WED_10AM })).status).toBe("already");
  });

  it("the sweep dials what's due, tells the owner about a skipped request, and fails lost claims", async () => {
    consent();
    queued();
    queued({ contact_id: "ct-2", reason: "owner_request", requested_by_phone: "+17055550100" }); // no consent → skipped
    queued({ contact_id: "ct-2", status: "dialing", claimed_at: "2026-10-28T13:00:00Z" }); // lost claim
    queued({ run_at: "2026-10-29T13:00:00Z", status: "scheduled", contact_id: "ct-9" }); // not due
    const r = await processDueSalesCalls(db.client, WED_10AM);
    expect(r).toEqual({ placed: 1, deferred: 0, skipped: 1, failed: 1 });
    expect(sendOwnerSms).toHaveBeenCalledTimes(1);
    expect((sendOwnerSms.mock.calls[0][1] as { to: string; body: string }).body).toBe("Didn't call Kim - they haven't agreed to automated calls.");
  });
});

describe("outcomes", () => {
  function placed(over: Partial<SalesCallRow> = {}) {
    consent();
    return queued({ status: "placed", retell_call_id: "call_abc", ...over });
  }
  const answered = { callId: "call_abc", callSuccessful: true, inVoicemail: false, disconnectionReason: "agent_hangup", durationMs: 125_000 };

  it("reached + booked: completed, one owner text even if the webhook comes twice", async () => {
    const row = placed();
    const input = { ...answered, salesCallId: row.id, organizationId: ORG, callSummary: "Sam booked gutter cleaning for Friday 9am.", customAnalysisData: { sales_outcome: "booked", services_interested: "gutter cleaning" }, nowMs: WED_10AM };
    expect(await recordSalesCallOutcome(db.client, input)).toEqual({ notified: true, retryId: null });
    expect(rowOf(row.id)).toMatchObject({ status: "completed" });
    expect((rowOf(row.id).outcome as Record<string, unknown>).salesOutcome).toBe("booked");
    const sms = sendOwnerSms.mock.calls[0][1] as { to: string; body: string };
    expect(sms.to).toBe("+17055550100");
    expect(sms.body).toBe("New-lead call - Sam Lee: booked. Interested in: gutter cleaning. Sam booked gutter cleaning for Friday 9am. (2 min)");
    expect(await recordSalesCallOutcome(db.client, input)).toEqual({ notified: false, retryId: null });
    expect(sendOwnerSms).toHaveBeenCalledTimes(1);
  });

  it("no answer on attempt 1 of 2: the next attempt is queued, the owner waits for the last one", async () => {
    const row = placed();
    const r = await recordSalesCallOutcome(db.client, { salesCallId: row.id, organizationId: ORG, callId: "call_abc", callSuccessful: false, inVoicemail: false, disconnectionReason: "dial_no_answer", callSummary: null, durationMs: 20_000, customAnalysisData: {}, nowMs: WED_10AM });
    expect(r.notified).toBe(false);
    expect(r.retryId).toBeTruthy();
    expect(rowOf(row.id)).toMatchObject({ status: "failed" });
    expect(rowOf(r.retryId as string)).toMatchObject({ status: "scheduled", attempt: 2, max_attempts: 2, run_at: new Date(WED_10AM + 120 * 60_000).toISOString() });
    expect(sendOwnerSms).not.toHaveBeenCalled();

    const last = rowOf(r.retryId as string);
    last.status = "placed";
    const final = await recordSalesCallOutcome(db.client, { salesCallId: String(last.id), organizationId: ORG, callId: "call_def", callSuccessful: null, inVoicemail: true, disconnectionReason: "voicemail_reached", callSummary: null, durationMs: 30_000, customAnalysisData: {}, nowMs: WED_10AM + 3 * 3_600_000 });
    expect(final).toEqual({ notified: true, retryId: null });
    expect((sendOwnerSms.mock.calls[0][1] as { body: string }).body).toBe('New-lead call - Sam Lee: voicemail after 2 tries. Want me to text them? Say "tell Sam ...".');
  });

  it("\"don't call me\": do-not-call list, consent revoked, no retry", async () => {
    const row = placed();
    await recordSalesCallOutcome(db.client, { ...answered, salesCallId: row.id, organizationId: ORG, callSummary: "They asked not to be called.", customAnalysisData: { do_not_call_requested: true, sales_outcome: "not_interested" }, nowMs: WED_10AM });
    expect(db.tables.do_not_call[0]).toMatchObject({ phone_last10: "7055550123", source: "call", contact_id: "ct-1" });
    expect(db.tables.call_consents[0].revoked_at).toBeTruthy();
    expect((sendOwnerSms.mock.calls[0][1] as { body: string }).body).toBe("New-lead call - Sam Lee: asked not to be called (added to your do-not-call list). (2 min)");
  });

  it("\"don't call me\" on a call Retell marks unsuccessful is still honoured, with no retry", async () => {
    const row = placed();
    const r = await recordSalesCallOutcome(db.client, { salesCallId: row.id, organizationId: ORG, callId: "call_abc", callSuccessful: false, inVoicemail: false, disconnectionReason: "user_hangup", callSummary: "Asked us to stop calling.", durationMs: 4_000, customAnalysisData: { do_not_call_requested: true }, nowMs: WED_10AM });
    expect(r.retryId).toBeNull();
    expect(db.tables.do_not_call).toHaveLength(1);
    expect(db.tables.call_consents[0].revoked_at).toBeTruthy();
    expect(db.tables.sales_calls.filter((x) => x.status === "scheduled")).toHaveLength(0);
    expect((sendOwnerSms.mock.calls[0][1] as { body: string }).body).toContain("asked not to be called");
  });

  it("a late result on a row already closed still honours \"don't call me\", on the number dialled", async () => {
    const row = placed({ status: "failed", last_error: "no call result from Retell" });
    db.tables.contacts[0].phone = "+14165550000"; // the contact's number changed meanwhile
    await recordSalesCallOutcome(db.client, { ...answered, salesCallId: row.id, organizationId: ORG, callSummary: null, customAnalysisData: { sales_outcome: "do_not_call" }, dialedNumber: "+17055550123", nowMs: WED_10AM });
    expect(db.tables.do_not_call[0]).toMatchObject({ phone_last10: "7055550123" });
    expect(sendOwnerSms).not.toHaveBeenCalled();
  });

  it("an owner-requested call that will be retried texts the owner once, at the end", async () => {
    const row = placed({ reason: "owner_request", requested_by_phone: "+17055559999" });
    const r = await recordSalesCallOutcome(db.client, { salesCallId: row.id, organizationId: ORG, callId: "call_abc", callSuccessful: false, inVoicemail: false, disconnectionReason: "dial_no_answer", callSummary: null, durationMs: 0, customAnalysisData: {}, nowMs: WED_10AM });
    expect(r).toMatchObject({ notified: false });
    expect(rowOf(r.retryId as string)).toMatchObject({ reason: "owner_request", requested_by_phone: "+17055559999", attempt: 2 });
    expect(sendOwnerSms).not.toHaveBeenCalled();
  });

  it("the sweep closes a placed call that never got a result, freeing the customer", async () => {
    placed({ placed_at: "2026-10-28T10:00:00Z" });
    placed({ contact_id: "ct-2", placed_at: "2026-10-28T13:50:00Z" });
    const r = await processDueSalesCalls(db.client, WED_10AM);
    expect(r.failed).toBe(1);
    expect(db.tables.sales_calls.map((x) => x.status)).toEqual(["failed", "placed"]);
  });

  it("wrong number: consent dropped (the number isn't theirs)", async () => {
    const row = placed();
    await recordSalesCallOutcome(db.client, { ...answered, durationMs: 15_000, salesCallId: row.id, organizationId: ORG, callSummary: null, customAnalysisData: { sales_outcome: "wrong_number" }, nowMs: WED_10AM });
    expect(db.tables.call_consents[0].revoked_at).toBeTruthy();
    expect(db.tables.do_not_call).toHaveLength(0);
  });

  it("another org's id finds nothing", async () => {
    const row = placed();
    expect(await recordSalesCallOutcome(db.client, { ...answered, salesCallId: row.id, organizationId: "org-x", callSummary: null, customAnalysisData: {} })).toEqual({ notified: false, retryId: null });
    expect(rowOf(row.id).status).toBe("placed");
  });

  it("reads the analysis defensively and keeps customer words inside fixed templates", () => {
    expect(readSalesAnalysis({ sales_outcome: "nonsense", do_not_call_requested: "yes" })).toEqual({ salesOutcome: null, doNotCall: false, callbackTime: null, servicesInterested: null });
    expect(readSalesAnalysis({ sales_outcome: "do_not_call" }).doNotCall).toBe(true);
    const text = salesCallResultText({
      who: "Kim",
      reason: "owner_request",
      reached: true,
      inVoicemail: false,
      analysis: { salesOutcome: "call_back_later", doNotCall: false, callbackTime: "tomorrow after 5", servicesInterested: null },
      summary: "x".repeat(400),
      durationMs: 60_000,
      attempt: 1,
    });
    expect(text.startsWith("Sales call - Kim: asked to be called back later (tomorrow after 5).")).toBe(true);
    expect(text.length).toBeLessThan(330);
  });
});

describe("owner-requested sales calls", () => {
  const approval = { id: "ap-1", organization_id: ORG, company_id: CO, contact_id: "ct-2", kind: "owner_command", summary: "", payload: {}, status: "approved", short_code: null, requested_by: "owner_command", expires_at: null, created_at: "" } as never;
  const decision = { approved: true, decidedVia: "sms" as const, decidedBy: "+17055550100" };
  const tz = { ...scope, timeZone: TZ };

  it("the proposal echoes who, when, the focus and the consent the owner is confirming", () => {
    expect(salesCallProposal({ who: "Kim", phone: "(705) 555-0177", focus: "spring cleanup", customerAsked: true, whenLabel: "now" }).summary).toBe(
      'Have the AI call Kim ((705) 555-0177) now about "spring cleanup" to answer questions, quote and book? You\'re confirming Kim asked to be called.',
    );
  });

  it("without consent it refuses; with the owner's word it records consent and dials", async () => {
    const payload = { action: "sales_call" as const, contactId: "ct-2", who: "Kim", focus: "spring cleanup", customerAsked: false, runAtMs: null, ownerPhone: "+17055550100" };
    expect(await executeSalesCallCommand(db.client, approval, payload, decision, tz, WED_10AM)).toMatchObject({ ok: false });
    expect(db.tables.sales_calls).toHaveLength(0);

    const r = await executeSalesCallCommand(db.client, approval, { ...payload, customerAsked: true }, decision, tz, WED_10AM);
    expect(r).toMatchObject({ ok: true, message: "Calling Kim now. I'll text you how it went." });
    expect(db.tables.call_consents[0]).toMatchObject({ source: "owner_attested", source_ref: "ap-1", phone_last10: "7055550177" });
    expect(db.tables.sales_calls[0]).toMatchObject({ reason: "owner_request", requested_by_phone: "+17055550100", note: "spring cleanup", status: "placed" });
  });

  it("outside hours it's scheduled for the next opening; declined does nothing", async () => {
    consent("ct-2", "7055550177");
    const payload = { action: "sales_call" as const, contactId: "ct-2", who: "Kim", focus: null, customerAsked: false, runAtMs: null, ownerPhone: "+17055550100" };
    const r = await executeSalesCallCommand(db.client, approval, payload, decision, tz, Date.parse("2026-10-29T02:00:00Z"));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("I'll call Kim");
    expect(callContactWithMarina).not.toHaveBeenCalled();
    expect(await executeSalesCallCommand(db.client, approval, payload, { ...decision, approved: false }, tz)).toEqual({ ok: true, message: "OK, no call to Kim." });
  });
});

describe("the sales prompt, agent and outbound tool requests", () => {
  it("discloses, gives the reason, and stops on a don't-call", () => {
    const prompt = buildSalesCallPrompt({
      companyName: "Northshore Home",
      customerName: "Sam Lee",
      services: [],
      hoursText: null,
      serviceArea: null,
      transferNumber: null,
      reason: "speed_to_lead",
      note: "gutter cleaning",
      callbackNumber: "(705) 555-0001",
      voicemail: "leave_message",
      attempt: 1,
    });
    expect(salesOpeningLine({ companyName: "Northshore Home", customerName: null })).toBe("Hi. This is the automated assistant calling for Northshore Home, and this call may be recorded.");
    expect(prompt).toContain("just enquired with Northshore Home about «gutter cleaning» and said it was OK to call them");
    expect(prompt).toContain("tell them they won't get any more calls from us");
    expect(prompt).toContain("Never offer discounts, invent urgency");
    expect(prompt).toContain("They can call back on (705) 555-0001.");
  });

  it("the shared agent: prompt passthrough, only the sales tools, the do-not-call field", () => {
    const config = buildSalesAgentConfig({ baseUrl: "https://app.everdoer.com", functionSecret: "s3cret" });
    expect(config.llm.general_prompt).toBe("{{system_prompt}}");
    const names = (config.llm.general_tools as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual([...SALES_TOOL_NAMES].sort());
    expect(names).not.toContain("capture_lead");
    const agent = config.agent("llm_1");
    expect(agent.webhook_url).toBe("https://app.everdoer.com/api/retell/webhook");
    expect((agent.post_call_analysis_data as Array<{ name: string }>).map((f) => f.name)).toEqual(expect.arrayContaining(["sales_outcome", "do_not_call_requested"]));
  });

  it("an outbound tool request reads the customer from the number we dialled", () => {
    const outbound = parseRetellFunctionBody({ name: "quote_services", args: {}, call: { call_id: "c1", from_number: "+17055550001", to_number: "+17055550123", direction: "outbound", agent_id: "agent_sales", metadata: { salesCallId: "sc-1" } } });
    expect(outbound.call).toMatchObject({ fromNumber: "+17055550123", toNumber: "+17055550001", direction: "outbound" });
    // Other outbound agents (no salesCallId) keep Retell's numbers and resolve by agent id as before.
    const other = parseRetellFunctionBody({ name: "x", args: {}, call: { call_id: "c3", from_number: "+16475550000", to_number: "+17055550123", direction: "outbound", agent_id: "agent_x" } });
    expect(other.call).toMatchObject({ fromNumber: "+16475550000", toNumber: "+17055550123" });
    const inbound = parseRetellFunctionBody({ name: "quote_services", args: {}, call: { call_id: "c2", from_number: "+17055550123", to_number: "+17055550001", direction: "inbound" } });
    expect(inbound.call).toMatchObject({ fromNumber: "+17055550123", toNumber: "+17055550001" });
  });

  it("the public form records call consent with the exact wording, only when ticked", () => {
    const ctx = { companyName: "Northshore Home", companySlug: "northshore", formType: "quote" as const, now: new Date(WED_10AM) };
    const yes = buildPublicFormEnvelope({ phone: "705-555-0123", callConsent: true } as never, ctx as never);
    expect(yes.meta?.callConsent).toEqual({ granted: true, text: callConsentText("Northshore Home"), capturedAt: expect.any(String) });
    const no = buildPublicFormEnvelope({ phone: "705-555-0123" } as never, ctx as never);
    expect(no.meta?.callConsent).toMatchObject({ granted: false });
    expect(no.meta?.callConsent?.text).toBeUndefined();
  });
});
