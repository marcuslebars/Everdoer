import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

// callContactWithMarina with an owner's brief (docs/owner-call-requests.md): the per-call
// prompt reaches Retell as {{system_prompt}}, the request id rides in the metadata, and an
// un-briefed call gets the plain follow-up prompt — never the stored INBOUND receptionist one.
const placeRetellCall = vi.fn((..._a: unknown[]) => Promise.resolve({ callId: "call_1", toNumber: "+17055550123" }));
const placeOutboundCall = vi.fn((..._a: unknown[]) => Promise.resolve({ agentCallId: "cartesia_1", toNumber: "+17055550123" }));
let cartesiaConfigured = false;

vi.mock("@/server/outbound/retell-voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/outbound/retell-voice")>();
  return { ...actual, placeRetellCall: (...a: unknown[]) => placeRetellCall(...a) };
});
vi.mock("@/server/outbound/voice", () => ({
  fetchCallDetails: vi.fn(),
  placeOutboundCall: (...a: unknown[]) => placeOutboundCall(...a),
  readVoiceConfig: () => (cartesiaConfigured ? { apiKey: "c", agentId: "a", fromNumberId: "f" } : null),
}));
vi.mock("@/server/services/quotes/catalog-items", () => ({
  listCatalogItems: () => Promise.resolve([{ id: "i1", label: "Spring cleanup", pricing_type: "flat", rate_cents: 18000, minimum_cents: 0, unit_label: null, description: null, sort_order: 1, service_key: "spring_cleanup", active: true }]),
}));

import { callContactWithMarina, isRetellOutboundActive } from "@/server/services/voice";

let db: FakeDb;
const DANA = "11111111-1111-4111-8111-111111111111";

function seed(profile: { system_prompt: string | null } | null) {
  db = createFakeDb({
    contacts: [{ id: DANA, organization_id: "org-1", company_id: "co-1", first_name: "Dana", last_name: "Jones", phone: "705-555-0123" }],
    companies: [{ id: "co-1", organization_id: "org-1", name: "Northshore Lawn", hours: { summary: "Mon-Fri 8-5" }, service_area: "Midland", owner_phone_e164: "+17055559999", quote_public_base_url: null, platform_brand: null }],
    company_voice_profiles: profile
      ? [{ organization_id: "org-1", company_id: "co-1", retell_outbound_agent_id: null, from_number: "+17055551111", brand_label: "Northshore Lawn", system_prompt: profile.system_prompt, dynamic_variables: {}, active: true }]
      : [],
    activity_events: [],
  });
}

const ctx = () => ({ organizationId: "org-1", actorProfileId: null, supabase: db.client as never });
const BRIEF = { purpose: "the lift is fixed", askFor: "does Thursday still work?", ifVoicemail: "leave_message" as const, who: "Dana Jones" };

beforeEach(() => {
  process.env.RETELL_OUTBOUND_ENABLED = "1";
  process.env.RETELL_API_KEY = "k";
  process.env.RETELL_FROM_NUMBER = "+17055550000";
  cartesiaConfigured = false;
  placeRetellCall.mockClear();
  placeOutboundCall.mockClear();
});

afterEach(() => {
  delete process.env.RETELL_OUTBOUND_ENABLED;
  delete process.env.RETELL_API_KEY;
  delete process.env.RETELL_FROM_NUMBER;
});

describe("callContactWithMarina with a brief", () => {
  it("sends the per-call prompt, the customer name and the request id to Retell", async () => {
    seed({ system_prompt: "You are Marina, the automated phone assistant for Northshore Lawn. You answer inbound phone calls." });
    expect(isRetellOutboundActive()).toBe(true);
    const result = await callContactWithMarina(ctx(), DANA, { brief: BRIEF, requestId: "44444444-4444-4444-8444-444444444444" });
    expect(result).toEqual({ agentCallId: "call_1", toNumber: "+17055550123" });
    expect(placeRetellCall).toHaveBeenCalledTimes(1);
    const [input, config] = placeRetellCall.mock.calls[0] as [{ toNumber: string; metadata: Record<string, unknown>; dynamicVariables: Record<string, string> }, { fromNumber: string }];
    expect(input.toNumber).toBe("+17055550123");
    expect(config.fromNumber).toBe("+17055551111"); // the company's own number as caller ID
    expect(input.metadata).toMatchObject({ contactId: DANA, organizationId: "org-1", companyId: "co-1", ownerCallRequestId: "44444444-4444-4444-8444-444444444444" });
    expect(input.dynamicVariables.customer_name).toBe("Dana Jones");
    const prompt = input.dynamicVariables.system_prompt;
    expect(prompt).toContain("calling on behalf of Northshore Lawn");
    expect(prompt).toContain("«the lift is fixed»");
    expect(prompt).toContain("«does Thursday still work?»");
    expect(prompt).toContain("Spring cleanup — $180"); // company facts travel with the call
    expect(prompt).toContain("Business hours: Mon-Fri 8-5");
    expect(prompt).not.toMatch(/answer inbound phone calls/); // the stored inbound prompt never drives an outbound call
    // The timeline event links back to the request.
    expect(db.tables.activity_events[0]).toMatchObject({ event_type: "contact.call_placed" });
    expect(JSON.stringify(db.tables.activity_events[0])).toContain("44444444-4444-4444-8444-444444444444");
  });

  it("without a brief: the plain follow-up prompt, still not the inbound one", async () => {
    seed({ system_prompt: "You answer inbound phone calls." });
    await callContactWithMarina(ctx(), DANA);
    const [input] = placeRetellCall.mock.calls[0] as [{ metadata: Record<string, unknown>; dynamicVariables: Record<string, string> }];
    expect(input.dynamicVariables.system_prompt).toContain("follow up on their recent enquiry with Northshore Lawn");
    expect(input.dynamicVariables.system_prompt).not.toMatch(/answer inbound phone calls/);
    expect(input.metadata.ownerCallRequestId).toBeUndefined();
  });

  it("no voice profile → global caller ID, prompt still built from the company", async () => {
    seed(null);
    await callContactWithMarina(ctx(), DANA, { brief: BRIEF });
    const [input, config] = placeRetellCall.mock.calls[0] as [{ dynamicVariables: Record<string, string> }, { fromNumber: string }];
    expect(config.fromNumber).toBe("+17055550000");
    expect(input.dynamicVariables.company_name).toBe("Northshore Lawn");
    expect(input.dynamicVariables.system_prompt).toContain("«the lift is fixed»");
  });

  it("a brief with only the Cartesia fallback is refused — the brief can't be dropped silently", async () => {
    delete process.env.RETELL_OUTBOUND_ENABLED;
    cartesiaConfigured = true;
    seed(null);
    expect(isRetellOutboundActive()).toBe(false);
    await expect(callContactWithMarina(ctx(), DANA, { brief: BRIEF })).rejects.toThrow(/needs Retell outbound/);
    expect(placeOutboundCall).not.toHaveBeenCalled();
    // Un-briefed calls keep working on the fallback.
    await callContactWithMarina(ctx(), DANA);
    expect(placeOutboundCall).toHaveBeenCalledTimes(1);
  });
});
