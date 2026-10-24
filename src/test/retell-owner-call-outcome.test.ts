import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

// The Retell call_analyzed webhook for a call the owner asked for: the outbound branch stores the
// call, logs the outcome on the contact, and hands the result to the owner channel — pinned by
// the organization we put in the call metadata, texted once.
let db: FakeDb;
const deliverMessage = vi.fn((..._a: unknown[]) => Promise.resolve({ status: "sent", body: "sent" }));

vi.mock("@/server/services/retell/config", () => ({
  getRetellConfig: () => ({ enabled: true, outboundEnabled: true, apiKey: "k", toleranceMs: 300_000, sourceSite: "x", leadSource: "retell_voice_agent" }),
}));
vi.mock("@/server/services/retell/tenant", () => ({
  createRetellAdminClient: () => db.client,
  resolveRetellTenant: () => Promise.resolve({ organizationId: "org-1", companyId: "co-1", sourceSite: "x" }),
}));
vi.mock("@/server/services/usage", () => ({ recordUsage: vi.fn(), recordUsageSafe: vi.fn(), recordAiUsageSafe: vi.fn() }));
vi.mock("@/server/services/workflow-engine/messaging", () => ({
  STOP_FOOTER: "Reply STOP to opt out",
  deliverMessage: (...a: unknown[]) => deliverMessage(...a),
}));

import { ingestRetellCall } from "@/server/services/retell/lead-adapter";

const REQ = "44444444-4444-4444-8444-444444444444";
const DANA = "11111111-1111-4111-8111-111111111111";

function payload(over: Record<string, unknown> = {}) {
  return {
    event: "call_analyzed",
    call: {
      call_id: "call_owner_1",
      direction: "outbound",
      from_number: "+17055551111",
      to_number: "+17055550123",
      duration_ms: 80_000,
      start_timestamp: 1_760_000_000_000,
      end_timestamp: 1_760_000_080_000,
      transcript: "Agent: Hi, is this Dana? ...",
      call_analysis: {
        call_summary: "Dana said Thursday works and asked for the invoice first.",
        user_sentiment: "Positive",
        call_successful: true,
        in_voicemail: false,
        custom_analysis_data: { owner_question_answer: "Thursday works" },
      },
      metadata: { contactId: DANA, organizationId: "org-1", companyId: "co-1", ownerCallRequestId: REQ },
      ...over,
    },
  };
}

beforeEach(() => {
  deliverMessage.mockClear();
  db = createFakeDb({
    organizations: [{ id: "org-1", platform_brand: "crankleads" }],
    companies: [{ id: "co-1", organization_id: "org-1", name: "Northshore Lawn" }],
    contacts: [{ id: DANA, organization_id: "org-1", company_id: "co-1", first_name: "Dana", last_name: "Jones", phone: "+17055550123" }],
    retell_calls: [],
    activity_events: [],
    platform_sms_opt_outs: [],
    raw_leads: [],
    owner_call_requests: [
      {
        id: REQ,
        organization_id: "org-1",
        company_id: "co-1",
        contact_id: DANA,
        requested_by_phone: "+17055559999",
        brief: { purpose: "the lift is fixed", askFor: "does Thursday still work?", ifVoicemail: "leave_message", who: "Dana Jones" },
        status: "placed",
        run_at: "2026-10-07T14:00:00.000Z",
        retell_call_id: "call_owner_1",
        owner_notified_at: null,
        created_at: "2026-10-07T14:00:00.000Z",
      },
    ],
  });
});

describe("outbound call_analyzed for an owner call request", () => {
  it("stores the call, logs the outcome with the request id, and texts the owner once", async () => {
    expect(await ingestRetellCall(payload())).toEqual({ handled: "outbound" });
    expect(db.tables.retell_calls[0]).toMatchObject({ call_id: "call_owner_1", organization_id: "org-1", contact_id: DANA, direction: "outbound" });
    expect(db.tables.activity_events[0]).toMatchObject({ event_type: "contact.call_completed", entity_id: DANA });
    expect(JSON.stringify(db.tables.activity_events[0])).toContain(REQ);
    expect(db.tables.owner_call_requests[0]).toMatchObject({ status: "completed", owner_notified_at: expect.any(String) });
    const texts = deliverMessage.mock.calls.map((c) => c[0] as { to: string; body: string; smsFrom?: string });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ to: "+17055559999", smsFrom: "platform" });
    expect(texts[0].body).toBe("CrankLeads: Dana Jones: reached. Answer: Thursday works. Dana said Thursday works and asked for the invoice first. (1 min)");

    // Redelivered webhook: the call row is upserted again, the owner is not texted again.
    expect(await ingestRetellCall(payload())).toEqual({ handled: "outbound" });
    expect(db.tables.retell_calls).toHaveLength(1);
    expect(deliverMessage).toHaveBeenCalledTimes(1);
  });

  it("a request id that isn't a uuid, or an organization that doesn't match, changes nothing", async () => {
    await ingestRetellCall(payload({ metadata: { contactId: DANA, organizationId: "org-1", companyId: "co-1", ownerCallRequestId: "not-a-uuid" } }));
    await ingestRetellCall(payload({ metadata: { contactId: DANA, organizationId: "org-9", companyId: "co-9", ownerCallRequestId: REQ } }));
    expect(db.tables.owner_call_requests[0]).toMatchObject({ status: "placed", owner_notified_at: null });
    expect(deliverMessage).not.toHaveBeenCalled();
  });
});
