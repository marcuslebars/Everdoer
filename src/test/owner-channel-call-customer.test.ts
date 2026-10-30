import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

// Owner call requests end to end (docs/owner-call-requests.md): the owner texts, the agent
// proposes a call, the owner confirms with a code, Marina dials (mocked), the scheduler places
// later calls, and the Retell webhook texts the owner the result once.
const deliverMessage = vi.fn((..._a: unknown[]) => Promise.resolve({ status: "sent", body: "sent body" }));
const executeApprovedAction = vi.fn((..._a: unknown[]) => Promise.resolve({ ok: true, message: "ok" }));
const recordAiUsageSafe = vi.fn((..._a: unknown[]) => Promise.resolve());
const anthropicCreate = vi.fn();
const callContactWithMarina = vi.fn((..._a: unknown[]) => Promise.resolve({ agentCallId: "call_abc", toNumber: "+17055550123" }));
const orgCan = vi.fn((..._a: unknown[]) => Promise.resolve(true));
const requireFeature = vi.fn((..._a: unknown[]) => Promise.resolve());
let retellOutbound = true;

let db: FakeDb;

vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => db.client }));
vi.mock("@/server/services/workflow-engine/messaging", () => ({
  STOP_FOOTER: "Reply STOP to opt out",
  deliverMessage: (...a: unknown[]) => deliverMessage(...a),
}));
vi.mock("@/server/services/sms-agent/approved", () => ({ executeApprovedAction: (...a: unknown[]) => executeApprovedAction(...a) }));
vi.mock("@/server/services/usage", () => ({ recordUsageSafe: vi.fn(), recordUsage: vi.fn(), recordAiUsageSafe: (...a: unknown[]) => recordAiUsageSafe(...a) }));
vi.mock("@/server/services/billing/gating", () => ({
  orgCan: (...a: unknown[]) => orgCan(...a),
  requireFeature: (...a: unknown[]) => requireFeature(...a),
}));
vi.mock("@/server/services/voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/voice")>();
  return {
    ...actual,
    isRetellOutboundActive: () => retellOutbound,
    callContactWithMarina: (...a: unknown[]) => callContactWithMarina(...a),
  };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => anthropicCreate(...a) };
  },
}));

import { UsageCapExceeded, ValidationError } from "@/server/organizations/context";
import { processDueOwnerCalls, recordOwnerCallOutcome } from "@/server/services/owner-channel/calls";
import { handleOwnerInboundSms } from "@/server/services/owner-channel/entry";

const OWNER = "+17055559999";
const PLATFORM = "+16475550000";
const NOW = Date.parse("2026-10-07T14:00:00Z"); // Wed 10:00 Toronto
const DANA = "11111111-1111-4111-8111-111111111111";
const NO_PHONE = "22222222-2222-4222-8222-222222222222";
const OTHER_CONTACT = "99999999-9999-4999-8999-999999999999";

function seed() {
  db = createFakeDb(
    {
      companies: [
        { id: "co-1", organization_id: "org-1", name: "Northshore Lawn", timezone: "America/Toronto", owner_phone_e164: OWNER, owner_phone_verified_at: "2026-10-01T00:00:00Z", ai_settings: {}, booking_policy: null, online_booking_settings: {} },
        { id: "co-9", organization_id: "org-9", name: "Someone Else Plumbing", timezone: "America/Toronto", owner_phone_e164: "+14165551234", owner_phone_verified_at: "2026-10-01T00:00:00Z", ai_settings: {} },
      ],
      organizations: [
        { id: "org-1", platform_brand: "crankleads", plan: "front_desk", subscription_status: "active", trial_ends_at: null },
        { id: "org-9", platform_brand: "empirevu", plan: "front_desk", subscription_status: "active", trial_ends_at: null },
      ],
      contacts: [
        { id: DANA, organization_id: "org-1", company_id: "co-1", first_name: "Dana", last_name: "Jones", phone: "+17055550123", search_text: "dana jones +17055550123", sms_opt_out_at: null },
        { id: NO_PHONE, organization_id: "org-1", company_id: "co-1", first_name: "Pat", last_name: "Nophone", phone: null, search_text: "pat nophone", sms_opt_out_at: null },
        { id: OTHER_CONTACT, organization_id: "org-9", company_id: "co-9", first_name: "Dana", last_name: "Secret", phone: "+14165550000", search_text: "dana secret", sms_opt_out_at: null },
      ],
      bookings: [],
      owner_approvals: [],
      owner_call_requests: [],
      owner_command_log: [],
      sales_calls: [],
      call_consents: [],
      do_not_call: [],
      voice_numbers: [{ id: "vn-1", organization_id: "org-1", company_id: "co-1", provider: "retell", active: true, phone_e164: "+17055550001" }],
      retell_calls: [],
      platform_sms_opt_outs: [],
      sms_conversations: [],
      ui_inbox_v: [],
      workflows: [],
    },
    { owner_command_log: [["provider_ref"]], sms_conversations: [["company_id", "contact_id"]] },
  );
}

let sid = 0;
function text(body: string) {
  return handleOwnerInboundSms(db.client, { from: OWNER, to: PLATFORM, body, media: [], providerRef: `SM${++sid}`, viaPlatformNumber: true, companyId: null });
}

/** The model: call these tools (one round each), then say `final`. */
function scriptModel(steps: Array<{ name: string; input: Record<string, unknown> }>, final: string) {
  let i = 0;
  anthropicCreate.mockImplementation(() => {
    const step = steps[i++];
    if (step) {
      return Promise.resolve({
        id: `msg_${i}`,
        model: "claude-sonnet-5-5",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: `tu_${i}`, name: step.name, input: step.input }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    }
    return Promise.resolve({ id: `msg_${i++}`, model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: final }], usage: { input_tokens: 10, output_tokens: 5 } });
  });
}

function lastCode(): string {
  const m = /Reply (\d{4}) to confirm/.exec(ownerReplies().at(-1) ?? "");
  if (!m) throw new Error(`no code in: ${ownerReplies().at(-1)}`);
  return m[1];
}

function ownerReplies(): string[] {
  return deliverMessage.mock.calls.map((c) => c[0] as { smsFrom?: string; body: string }).filter((m) => m.smsFrom === "platform").map((m) => m.body);
}

function toolResult(n: number): string {
  const call = anthropicCreate.mock.calls.at(-1) as [{ messages: Array<{ role: string; content: unknown }> }];
  for (const message of call[0].messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content as Array<{ type: string; tool_use_id?: string; content?: string }>) {
      if (block.type === "tool_result" && block.tool_use_id === `tu_${n}`) return block.content ?? "";
    }
  }
  return "";
}

function listedTools(): string[] {
  const first = anthropicCreate.mock.calls[0][0] as { tools: Array<{ name: string }> };
  return first.tools.map((t) => t.name);
}

const BRIEF_INPUT = { contact_id: DANA, purpose: "The lift is fixed and we can launch any day this week.", ask_for: "Does Thursday morning still work for the launch?" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.ANTHROPIC_API_KEY = "test-key";
  retellOutbound = true;
  for (const fn of [deliverMessage, executeApprovedAction, recordAiUsageSafe, anthropicCreate, callContactWithMarina, orgCan, requireFeature]) fn.mockReset();
  deliverMessage.mockImplementation(() => Promise.resolve({ status: "sent", body: "sent body" }));
  callContactWithMarina.mockImplementation(() => Promise.resolve({ agentCallId: "call_abc", toNumber: "+17055550123" }));
  orgCan.mockImplementation(() => Promise.resolve(true));
  requireFeature.mockImplementation(() => Promise.resolve());
  seed();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OWNER_CALLS_HOURS;
});

describe("call_customer — propose, confirm, dial", () => {
  it("proposes the exact words with a code; nothing dials until the code; then dials once with the brief", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana, tell her the lift is fixed and ask if Thursday morning still works");

    expect(listedTools()).toContain("call_customer");
    expect(callContactWithMarina).not.toHaveBeenCalled();
    const ask = ownerReplies().at(-1) ?? "";
    expect(ask).toBe(
      'CrankLeads: Call Dana Jones ((705) 555-0123) now and say: "The lift is fixed and we can launch any day this week." Ask: "Does Thursday morning still work for the launch?" Reply ' +
        `${lastCode()} to confirm, or N to leave it.`,
    );
    expect(db.tables.owner_call_requests).toHaveLength(1);
    const row = db.tables.owner_call_requests[0];
    expect(row).toMatchObject({ organization_id: "org-1", company_id: "co-1", contact_id: DANA, status: "proposed", requested_by_phone: OWNER });
    expect(row.approval_id).toBe(db.tables.owner_approvals[0].id);
    expect(row.brief).toEqual({ purpose: "The lift is fixed and we can launch any day this week.", askFor: "Does Thursday morning still work for the launch?", ifVoicemail: "leave_message", who: "Dana Jones" });

    // A bare Y doesn't confirm an owner command; the code does.
    const code = lastCode();
    await text("Y");
    expect(callContactWithMarina).not.toHaveBeenCalled();

    await text(code);
    expect(requireFeature).toHaveBeenCalledWith(expect.anything(), "org-1", "marina_reception");
    expect(callContactWithMarina).toHaveBeenCalledTimes(1);
    const [ctx, contactId, options] = callContactWithMarina.mock.calls[0] as [{ organizationId: string }, string, { brief: unknown; requestId: string }];
    expect(ctx.organizationId).toBe("org-1");
    expect(contactId).toBe(DANA);
    expect(options.requestId).toBe(row.id);
    expect(options.brief).toMatchObject({ purpose: "The lift is fixed and we can launch any day this week.", who: "Dana Jones" });
    expect(db.tables.owner_call_requests[0]).toMatchObject({ status: "placed", retell_call_id: "call_abc", claimed_at: expect.any(String) });
    expect(ownerReplies().at(-1)).toBe("CrankLeads: Calling Dana Jones now. I'll text you how it went.");

    // The same code again: the approval was already decided — no second call.
    await text(code);
    expect(callContactWithMarina).toHaveBeenCalledTimes(1);
  });

  it("N cancels the request; nothing dials", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana about the lift");
    await text("N");
    expect(db.tables.owner_call_requests[0].status).toBe("cancelled");
    expect(callContactWithMarina).not.toHaveBeenCalled();
    expect(ownerReplies().at(-1)).toMatch(/OK, no call to Dana Jones/);
  });

  it("a placement that throws is recorded as failed, never retried; raw errors never reach the owner", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    callContactWithMarina.mockImplementation(() => Promise.reject(new Error("duplicate key value violates unique constraint")));
    await text(lastCode());
    expect(callContactWithMarina).toHaveBeenCalledTimes(1);
    expect(db.tables.owner_call_requests[0]).toMatchObject({ status: "failed", last_error: "duplicate key value violates unique constraint" });
    expect(ownerReplies().at(-1)).toBe("CrankLeads: Couldn't place the call to Dana Jones - the call couldn't be placed.");
  });

  it("the customer lost their phone number between proposal and confirmation → a plain reason", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    // callContactWithMarina re-reads the contact and refuses an uncallable number (voice.ts).
    callContactWithMarina.mockImplementation(() => Promise.reject(new ValidationError("This lead has no phone number to call.")));
    await text(lastCode());
    expect(db.tables.owner_call_requests[0].status).toBe("failed");
    expect(ownerReplies().at(-1)).toBe("CrankLeads: Couldn't place the call to Dana Jones - this lead has no phone number to call.");
  });

  it("no minutes left at proposal time → refused before the owner is asked to confirm", async () => {
    requireFeature.mockImplementation(() => Promise.reject(new UsageCapExceeded("This month's included allowance for marina_reception is used up.")));
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "done");
    await text("call Dana");
    expect(toolResult(1)).toMatch(/this month's AI minutes are used up/);
    expect(db.tables.owner_call_requests).toHaveLength(0);
    expect(db.tables.owner_approvals).toHaveLength(0);
  });

  it("minutes used up between proposal and confirmation → failed with a plain reason", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    requireFeature.mockImplementation(() => Promise.reject(new UsageCapExceeded("This month's included allowance for marina_reception is used up.")));
    await text(lastCode());
    expect(callContactWithMarina).not.toHaveBeenCalled();
    expect(db.tables.owner_call_requests[0].status).toBe("failed");
    expect(ownerReplies().at(-1)).toMatch(/this month's AI minutes are used up/);
  });
});

describe("call_customer — refusals and gating", () => {
  it("is not offered when Retell outbound is off or the plan lacks the receptionist", async () => {
    retellOutbound = false;
    scriptModel([], "I can't place calls here.");
    await text("call Dana");
    expect(listedTools()).not.toContain("call_customer");
    const first = anthropicCreate.mock.calls[0][0] as { system: Array<{ text: string }> };
    expect(first.system[0].text).toContain("calling isn't set up on this account");
    expect(orgCan).not.toHaveBeenCalled(); // short-circuits before the plan check

    anthropicCreate.mockReset();
    retellOutbound = true;
    orgCan.mockImplementation(() => Promise.resolve(false));
    scriptModel([], "unused");
    await text("call Dana");
    expect(listedTools()).not.toContain("call_customer");
    const second = anthropicCreate.mock.calls[0][0] as { system: Array<{ text: string }> };
    expect(second.system[0].text).toContain("part of the Front Desk plan");
  });

  it("a race on the insert (23505) reads as already waiting", async () => {
    db.failNext("owner_call_requests", "insert", { message: "duplicate key", code: "23505" });
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "done");
    await text("call Dana");
    expect(toolResult(1)).toMatch(/already waiting/);
    expect(db.tables.owner_approvals).toHaveLength(0);
  });

  it("no phone, another business's customer, a too-long message", async () => {
    scriptModel(
      [
        { name: "call_customer", input: { ...BRIEF_INPUT, contact_id: NO_PHONE } },
        { name: "call_customer", input: { ...BRIEF_INPUT, contact_id: OTHER_CONTACT } },
        { name: "call_customer", input: { ...BRIEF_INPUT, purpose: "x".repeat(301) } },
      ],
      "done",
    );
    await text("call people");
    expect(toolResult(1)).toContain("has no phone number on file");
    expect(toolResult(2)).toContain("No such customer for this business");
    expect(toolResult(3)).toContain("under 300 characters");
    expect(db.tables.owner_call_requests).toHaveLength(0);
    expect(db.tables.owner_approvals).toHaveLength(0);
  });

  it("a second request for the same customer is refused while one is open; cancel frees it", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    anthropicCreate.mockReset();
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "done");
    await text("call Dana again");
    expect(toolResult(1)).toMatch(/already waiting/);
    expect(db.tables.owner_call_requests).toHaveLength(1);

    anthropicCreate.mockReset();
    scriptModel([{ name: "cancel_customer_call", input: { contact_id: DANA } }], "Cancelled the call to Dana.");
    await text("cancel the call to Dana");
    expect(toolResult(1)).toContain('"cancelled":"Dana Jones"');
    expect(db.tables.owner_call_requests[0].status).toBe("cancelled");
    expect(db.tables.owner_approvals[0].status).toBe("rejected");
  });

  it("the daily cap refuses the next call", async () => {
    // Only the per-company calls bucket is exhausted; the owner-channel's own per-phone limits stay open.
    db.onRpc((name, args) => (name === "consume_rate_limit" && String(args.p_key).startsWith("owner_calls:") ? { data: false, error: null } : { data: [], error: null }));
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "done");
    await text("call Dana");
    expect(toolResult(1)).toMatch(/daily limit/);
    expect(db.tables.owner_call_requests.map((r) => r.status)).toEqual(["cancelled"]);
    expect(db.tables.owner_approvals).toHaveLength(0);
  });
});

describe("scheduled calls", () => {
  it("a later time schedules; the sweep dials it once when due and texts the owner", async () => {
    scriptModel([{ name: "call_customer", input: { ...BRIEF_INPUT, when: "2026-10-08 09:00" } }], "unused");
    await text("call Dana tomorrow at 9");
    expect(ownerReplies().at(-1)).toMatch(/^CrankLeads: Call Dana Jones \(\(705\) 555-0123\) Thu, Oct 8, 9:00 a\.m\. and say:/);
    await text(lastCode());
    expect(callContactWithMarina).not.toHaveBeenCalled();
    expect(db.tables.owner_call_requests[0]).toMatchObject({ status: "scheduled", run_at: "2026-10-08T13:00:00.000Z" });
    expect(ownerReplies().at(-1)).toBe('CrankLeads: OK - I\'ll call Dana Jones Thu, Oct 8, 9:00 a.m. Say "cancel the call to Dana" to stop it.');

    // Not due yet.
    expect(await processDueOwnerCalls(db.client, Date.parse("2026-10-08T12:00:00Z"))).toEqual({ placed: 0, failed: 0, expired: 0 });
    expect(callContactWithMarina).not.toHaveBeenCalled();

    // Due: two sweeps, one call.
    const due = Date.parse("2026-10-08T13:00:30Z");
    const [a, b] = await Promise.all([processDueOwnerCalls(db.client, due), processDueOwnerCalls(db.client, due)]);
    expect(a.placed + b.placed).toBe(1);
    expect(callContactWithMarina).toHaveBeenCalledTimes(1);
    expect(db.tables.owner_call_requests[0]).toMatchObject({ status: "placed", claimed_by: "scheduler", retell_call_id: "call_abc" });
    expect(ownerReplies().at(-1)).toBe("CrankLeads: Calling Dana Jones now. I'll text you how it went.");
  });

  it("blank 'when' outside calling hours lands at the next opening and says so", async () => {
    vi.setSystemTime(Date.parse("2026-10-08T01:30:00Z")); // Wed 21:30 Toronto
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    expect(ownerReplies().at(-1)).toMatch(/Call Dana Jones \(\(705\) 555-0123\) Thu, Oct 8, 8:00 a\.m\. and say/);
    expect(db.tables.owner_call_requests[0].run_at).toBe("2026-10-08T12:00:00.000Z");
  });

  it("a proposal nobody confirmed expires; a worker that died mid-dial is marked failed", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    db.tables.owner_call_requests.push({
      id: "33333333-3333-4333-8333-333333333333",
      organization_id: "org-1",
      company_id: "co-1",
      contact_id: NO_PHONE,
      requested_by_phone: OWNER,
      brief: { purpose: "p", askFor: null, ifVoicemail: "leave_message", who: "Pat" },
      status: "dialing",
      run_at: new Date(NOW).toISOString(),
      claimed_at: new Date(NOW - 20 * 60_000).toISOString(),
      retell_call_id: null,
      created_at: new Date(NOW - 20 * 60_000).toISOString(),
    });
    const later = NOW + 60 * 60_000;
    deliverMessage.mockClear();
    expect(await processDueOwnerCalls(db.client, later)).toEqual({ placed: 0, failed: 1, expired: 1 });
    expect(db.tables.owner_call_requests[0].status).toBe("expired");
    expect(db.tables.owner_call_requests[1]).toMatchObject({ status: "failed", last_error: expect.stringMatching(/worker lost/) });
    // The owner was told "calling now" earlier, so they hear that it didn't happen.
    expect(ownerReplies()).toEqual(["CrankLeads: Couldn't place the call to Pat - something went wrong on our side. Ask again if you still want it."]);
  });

  it("three wrong codes cancel the confirmation AND the request; expiry closes it too", async () => {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    for (const wrong of ["0000", "0001", "0002"]) await text(wrong);
    expect(db.tables.owner_approvals[0].status).toBe("rejected");
    expect(db.tables.owner_call_requests[0].status).toBe("cancelled");
  });
});

describe("the result (Retell call_analyzed → owner text)", () => {
  async function placedRequest() {
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "unused");
    await text("call Dana");
    await text(lastCode());
    const row = db.tables.owner_call_requests[0];
    expect(row.status).toBe("placed");
    deliverMessage.mockClear();
    return row;
  }

  it("reached: answer first, then the summary; texted exactly once across redeliveries", async () => {
    const row = await placedRequest();
    const outcome = {
      requestId: row.id as string,
      organizationId: "org-1",
      callId: "call_abc",
      callSuccessful: true,
      inVoicemail: false,
      callSummary: "Dana confirmed Thursday 9am and asked for the invoice by email first.",
      userSentiment: "Positive",
      durationMs: 95_000,
      customAnalysisData: { owner_question_answer: "Thursday 9am works" },
    };
    expect(await recordOwnerCallOutcome(db.client, outcome)).toEqual({ notified: true });
    expect(db.tables.owner_call_requests[0]).toMatchObject({ status: "completed", owner_notified_at: expect.any(String) });
    expect(db.tables.owner_call_requests[0].outcome).toMatchObject({ reached: true, answer: "Thursday 9am works", durationMs: 95_000 });
    expect(ownerReplies()).toEqual(["CrankLeads: Dana Jones: reached. Answer: Thursday 9am works. Dana confirmed Thursday 9am and asked for the invoice by email first. (2 min)"]);

    expect(await recordOwnerCallOutcome(db.client, outcome)).toEqual({ notified: false });
    expect(ownerReplies()).toHaveLength(1);
  });

  it("voicemail and no-answer wordings", async () => {
    const row = await placedRequest();
    await recordOwnerCallOutcome(db.client, { requestId: row.id as string, organizationId: "org-1", callId: "call_abc", callSuccessful: false, inVoicemail: true, callSummary: null, userSentiment: null, durationMs: 15_000, customAnalysisData: null });
    expect(ownerReplies().at(-1)).toBe('CrankLeads: Dana Jones: voicemail - left a message. Want me to text them? Say "tell Dana ...".');
    expect(db.tables.owner_call_requests[0].status).toBe("completed");

    seed();
    deliverMessage.mockClear();
    anthropicCreate.mockReset();
    const row2 = await placedRequest();
    // Retell reports the ring time as duration and call_successful null when nobody picked up.
    await recordOwnerCallOutcome(db.client, { requestId: row2.id as string, organizationId: "org-1", callId: "call_abc", callSuccessful: null, inVoicemail: null, disconnectionReason: "dial_no_answer", callSummary: null, userSentiment: null, durationMs: 27_000, customAnalysisData: null });
    expect(ownerReplies().at(-1)).toBe('CrankLeads: Dana Jones: no answer. Try again later? Say "call Dana again".');
    expect(db.tables.owner_call_requests[0].status).toBe("failed");

    seed();
    deliverMessage.mockClear();
    anthropicCreate.mockReset();
    const row3 = await placedRequest();
    // A 3-second "call" with no verdict is a ring, not a conversation; machine_detected is voicemail.
    await recordOwnerCallOutcome(db.client, { requestId: row3.id as string, organizationId: "org-1", callId: "call_abc", callSuccessful: null, inVoicemail: null, disconnectionReason: "user_hangup", callSummary: null, userSentiment: null, durationMs: 3_000, customAnalysisData: null });
    expect(ownerReplies().at(-1)).toMatch(/no answer/);
    seed();
    deliverMessage.mockClear();
    anthropicCreate.mockReset();
    const row4 = await placedRequest();
    await recordOwnerCallOutcome(db.client, { requestId: row4.id as string, organizationId: "org-1", callId: "call_abc", callSuccessful: null, inVoicemail: null, disconnectionReason: "machine_detected", callSummary: null, userSentiment: null, durationMs: 40_000, customAnalysisData: null });
    expect(ownerReplies().at(-1)).toMatch(/voicemail - left a message/);
  });

  it("an organization mismatch is ignored (the row is pinned by the org we sent)", async () => {
    const row = await placedRequest();
    expect(await recordOwnerCallOutcome(db.client, { requestId: row.id as string, organizationId: "org-9", callId: "call_abc", callSuccessful: true, inVoicemail: false, callSummary: "x", userSentiment: null, durationMs: 1000, customAnalysisData: null })).toEqual({ notified: false });
    expect(db.tables.owner_call_requests[0].status).toBe("placed");
    expect(ownerReplies()).toHaveLength(0);
  });
});

// Sales calls by text (docs/sales-calls.md): "call Dana and see if she wants to book".
describe("sales_call — consent, code, dial on the sales agent", () => {
  beforeEach(() => {
    process.env.RETELL_SALES_AGENT_ID = "agent_sales";
  });
  afterEach(() => {
    delete process.env.RETELL_SALES_AGENT_ID;
  });

  it("isn't offered without the sales agent", async () => {
    delete process.env.RETELL_SALES_AGENT_ID;
    scriptModel([], "ok");
    await text("what's on today");
    expect(listedTools()).not.toContain("sales_call");
    expect(listedTools()).toContain("call_customer");
  });

  it("refuses without consent and asks for nothing", async () => {
    scriptModel([{ name: "sales_call", input: { contact_id: DANA, focus: "spring cleanup" } }], "Dana hasn't agreed to automated calls.");
    await text("call Dana and see if she wants the spring cleanup");
    expect(listedTools()).toEqual(expect.arrayContaining(["sales_call", "cancel_sales_call", "lead_call_settings"]));
    expect(toolResult(1)).toContain("hasn't agreed to automated calls");
    expect(db.tables.owner_approvals).toHaveLength(0);
    expect(db.tables.sales_calls).toHaveLength(0);
  });

  it("with the owner's word: code first, then consent recorded and the call placed on the sales agent", async () => {
    scriptModel([{ name: "sales_call", input: { contact_id: DANA, focus: "spring cleanup", customer_asked: true, when: "now" } }], "unused");
    await text("Dana asked me to call her back about the spring cleanup - have the AI call her");
    expect(callContactWithMarina).not.toHaveBeenCalled();
    expect(ownerReplies().at(-1)).toContain('Have the AI call Dana Jones ((705) 555-0123) now about "spring cleanup"');

    await text(lastCode());
    expect(db.tables.call_consents[0]).toMatchObject({ source: "owner_attested", phone_last10: "7055550123" });
    expect(callContactWithMarina).toHaveBeenCalledTimes(1);
    const opts = callContactWithMarina.mock.calls[0][2] as { sales: { agentId: string; fromNumber: string; prompt: string } };
    expect(opts.sales).toMatchObject({ agentId: "agent_sales", fromNumber: "+17055550001" });
    expect(opts.sales.prompt).toContain("asked you to call Dana Jones about «spring cleanup»");
    expect(db.tables.sales_calls[0]).toMatchObject({ reason: "owner_request", status: "placed", requested_by_phone: OWNER });
    expect(ownerReplies().at(-1)).toContain("Calling Dana Jones now");
  });

  it("call_customer won't phone someone on the do-not-call list", async () => {
    db.tables.do_not_call.push({ organization_id: "org-1", company_id: "co-1", phone_last10: "7055550123", source: "call", expires_at: "2029-11-01T00:00:00Z" });
    scriptModel([{ name: "call_customer", input: BRIEF_INPUT }], "They asked not to be called.");
    await text("call Dana and tell her the lift is fixed");
    expect(toolResult(1)).toContain("asked not to be called");
    expect(db.tables.owner_call_requests).toHaveLength(0);
  });

  it("lead_call_settings turns new-lead calls on and clamps the numbers", async () => {
    scriptModel([{ name: "lead_call_settings", input: { on: true, delay_minutes: 0, attempts: 7 } }], "Lead calls are on.");
    await text("turn on lead calls, call them right away and try a few times");
    expect(db.tables.companies[0].sales_call_settings).toMatchObject({ enabled: true, delayMinutes: 1, maxAttempts: 3 });
  });
});

// Agent profile by text (docs/agent-blueprints.md): "call yourself Sam, and be more professional".
describe("assistant_persona", () => {
  it("sets the name and tone, says the current setting, and refuses junk names", async () => {
    scriptModel([{ name: "assistant_persona", input: { name: "sam", tone: "professional" } }], "Done - I'm Sam now.");
    await text("call yourself Sam and be more professional");
    expect(db.tables.companies[0].agent_persona).toEqual({ name: "Sam", tone: "professional" });
    expect(toolResult(1)).toContain('"name":"Sam"');

    scriptModel([{ name: "assistant_persona", input: { name: "<script>" } }], "That name won't work.");
    await text("call yourself <script>");
    expect(toolResult(1)).toContain("plain first name");
    expect(db.tables.companies[0].agent_persona).toEqual({ name: "Sam", tone: "professional" });

    scriptModel([{ name: "assistant_persona", input: { name: "default", tone: "default" } }], "Back to Marina.");
    await text("go back to the normal name");
    expect(db.tables.companies[0].agent_persona).toEqual({});
  });
});
