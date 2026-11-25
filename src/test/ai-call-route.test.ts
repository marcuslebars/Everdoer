import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

// "Have the AI call" on a contact (docs/sales-calls.md → "Calls with your instructions"): who may
// use it, that the contact must be visible to the caller, and that the request reaches the
// service with the signed-in user as the one who asked.
const h = vi.hoisted(() => ({ db: null as FakeDb | null, role: "owner" }));
const requestAiCallFromApp = vi.fn();
const cancelAiCallFromApp = vi.fn();
const getAiCallView = vi.fn();
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => h.db?.client }));
vi.mock("@/server/supabase/server", () => ({ createSupabaseServerClient: () => h.db?.client }));
vi.mock("@/server/services/sales-calls/app-request", () => ({
  requestAiCallFromApp: (...a: unknown[]) => requestAiCallFromApp(...a),
  cancelAiCallFromApp: (...a: unknown[]) => cancelAiCallFromApp(...a),
  getAiCallView: (...a: unknown[]) => getAiCallView(...a),
}));
vi.mock("@/server/organizations/context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/organizations/context")>();
  return {
    ...original,
    requireOrganizationContext: async (_s: unknown, organizationId: string) => ({
      organizationId,
      user: { id: "user-1", email: "dana@x.test" },
      profile: { full_name: "Dana Owner" },
      membership: { role: h.role },
    }),
  };
});

import { DELETE, GET, POST } from "@/app/api/organizations/[organizationId]/contacts/[contactId]/ai-call/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const CO = "22222222-2222-4222-8222-222222222222";
const CALL = "33333333-3333-4333-8333-333333333333";
const ctx = (contactId = "ct-1") => ({ params: { organizationId: ORG, contactId } });
const post = (body: unknown) => new Request("https://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  h.role = "owner";
  h.db = createFakeDb({ contacts: [{ id: "ct-1", organization_id: ORG, company_id: CO, first_name: "Kim", phone: "+17055550177" }] });
  requestAiCallFromApp.mockReset().mockResolvedValue({ ok: true, status: "placed", message: "Calling Kim now.", salesCallId: CALL, runAtMs: Date.parse("2026-11-25T15:00:00Z") });
  cancelAiCallFromApp.mockReset().mockResolvedValue(true);
  getAiCallView.mockReset().mockResolvedValue({ availability: "enabled", calls: [] });
});

describe("/contacts/[contactId]/ai-call", () => {
  it("an owner's request reaches the service with the contact's company and who asked", async () => {
    const res = await POST(post({ instructions: "Ask about Tuesday", when: "now", customerAsked: true }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ status: "placed", message: "Calling Kim now.", salesCallId: CALL, runAt: "2026-11-25T15:00:00.000Z" });
    const [, scope, contactId, request, actor] = requestAiCallFromApp.mock.calls[0];
    expect(scope).toEqual({ organizationId: ORG, companyId: CO });
    expect(contactId).toBe("ct-1");
    expect(request).toEqual({ instructions: "Ask about Tuesday", when: "now", customerAsked: true });
    expect(actor).toEqual({ profileId: "user-1", label: "Dana Owner" });
  });

  it("staff can see the panel but can't place or cancel calls", async () => {
    h.role = "member";
    expect((await GET(new Request("https://x/api"), ctx())).status).toBe(200);
    expect((await POST(post({ instructions: "Ask" }), ctx())).status).toBe(403);
    expect((await DELETE(new Request(`https://x/api?id=${CALL}`, { method: "DELETE" }), ctx())).status).toBe(403);
    expect(requestAiCallFromApp).not.toHaveBeenCalled();
  });

  it("a contact the user can't see is refused before anything runs", async () => {
    const res = await POST(post({ instructions: "Ask" }), ctx("ct-unknown"));
    expect(res.status).toBe(400);
    expect(requestAiCallFromApp).not.toHaveBeenCalled();
  });

  it("cancels only a waiting call", async () => {
    expect((await DELETE(new Request(`https://x/api?id=${CALL}`, { method: "DELETE" }), ctx())).status).toBe(200);
    cancelAiCallFromApp.mockResolvedValueOnce(false);
    expect((await DELETE(new Request(`https://x/api?id=${CALL}`, { method: "DELETE" }), ctx())).status).toBe(400);
    expect((await DELETE(new Request("https://x/api?id=nope", { method: "DELETE" }), ctx())).status).toBe(400);
  });
});
