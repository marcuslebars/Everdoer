/**
 * Your AI route + the owner's brief (docs/owner-line.md → "The brief"): shown and saved only
 * for owners and admins, only where calling your assistant is switched on for the organization,
 * and saved into its own ai_settings section.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

const h = vi.hoisted(() => ({ db: null as FakeDb | null, role: "owner", lineOn: true }));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => h.db?.client }));
vi.mock("@/server/supabase/server", () => ({ createSupabaseServerClient: () => h.db?.client }));
vi.mock("@/server/organizations/context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/organizations/context")>();
  return {
    ...original,
    requireOrganizationContext: async (_s: unknown, organizationId: string) => ({ organizationId, user: { id: "user-1" }, membership: { role: h.role } }),
  };
});
vi.mock("@/server/services/voice/owner-line", () => ({
  getOwnerLineConfig: () => ({ enabled: h.lineOn, orgIds: new Set(["11111111-1111-4111-8111-111111111111"]) }),
  ownerLineAllowed: (config: { orgIds: Set<string> }, organizationId: string) => config.orgIds.has(organizationId),
}));
vi.mock("@/server/services/voice/resync", () => ({ resyncReceptionistAgent: vi.fn(async () => ({ status: "ok" })) }));

import { GET, PATCH } from "@/app/api/organizations/[organizationId]/companies/[companyId]/your-ai/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "33333333-3333-4333-8333-333333333333";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const OTHER_COMPANY = "44444444-4444-4444-8444-444444444444";
const ctx = (organizationId = ORG, companyId = COMPANY) => ({ params: { organizationId, companyId } });

function seed(): FakeDb {
  const company = (id: string, organization_id: string, ai_settings: Record<string, unknown>) => ({
    id,
    organization_id,
    name: "Northshore Roofing",
    industry_pack: null,
    ai_settings,
    review_settings: {},
    sales_call_settings: {},
    brand_review_url: null,
    agent_persona: {},
    owner_phone_e164: "+17055550111",
    owner_phone_verified_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  });
  return createFakeDb({
    companies: [company(COMPANY, ORG, { sms_agent: { enabled: true }, owner_line: { brief: "Roofing pays the bills." } }), company(OTHER_COMPANY, OTHER_ORG, {})],
    organizations: [
      { id: ORG, platform_brand: "empirevu", crankleads_tier: null },
      { id: OTHER_ORG, platform_brand: "empirevu", crankleads_tier: null },
    ],
    voice_numbers: [],
    workflows: [],
  });
}

const json = (res: Response) => res.json() as Promise<{ data?: Record<string, unknown>; error?: unknown }>;
const req = (method: string, body?: unknown) => new Request("http://x.test/", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  h.db = seed();
  h.role = "owner";
  h.lineOn = true;
});

describe("Your AI route: the owner's brief", () => {
  it("GET: owners and admins get their notes; members get the switches without them", async () => {
    const owner = await json(await GET(req("GET"), ctx()));
    expect(owner.data?.ownerLine).toEqual({ brief: "Roofing pays the bills.", maxChars: 6000 });
    expect(Array.isArray(owner.data?.switches)).toBe(true);
    h.role = "member";
    const member = await json(await GET(req("GET"), ctx()));
    expect(member.data?.ownerLine).toBeNull();
    expect(Array.isArray(member.data?.switches)).toBe(true);
  });

  it("GET: nothing about it where calling your assistant isn't switched on", async () => {
    h.lineOn = false;
    expect((await json(await GET(req("GET"), ctx()))).data?.ownerLine).toBeNull();
    h.lineOn = true;
    // Switched on for one organization only.
    expect((await json(await GET(req("GET"), ctx(OTHER_ORG, OTHER_COMPANY)))).data?.ownerLine).toBeNull();
  });

  it("PATCH: saves into its own section, cleaned, and leaves the other settings alone; empty clears it", async () => {
    const saved = await json(await PATCH(req("PATCH", { ownerBrief: "  I own two businesses.\r\n\r\n\r\n\r\nCoatings is new. {{system_prompt}} " }), ctx()));
    expect(saved.data?.ownerLine).toEqual({ brief: "I own two businesses.\n\nCoatings is new.", maxChars: 6000 });
    expect(h.db?.tables.companies[0].ai_settings).toEqual({ sms_agent: { enabled: true }, owner_line: { brief: "I own two businesses.\n\nCoatings is new." } });
    const cleared = await json(await PATCH(req("PATCH", { ownerBrief: null }), ctx()));
    expect(cleared.data?.ownerLine).toEqual({ brief: null, maxChars: 6000 });
    expect(h.db?.tables.companies[0].ai_settings).toEqual({ sms_agent: { enabled: true } });
  });

  it("PATCH: members can't; too long is refused with a plain message; off is refused; one thing per request", async () => {
    h.role = "member";
    expect((await PATCH(req("PATCH", { ownerBrief: "x" }), ctx())).status).toBe(403);
    h.role = "admin";
    const long = await PATCH(req("PATCH", { ownerBrief: "x".repeat(6001) }), ctx());
    expect(long.status).toBe(400);
    expect(JSON.stringify(await long.json())).toContain("Keep it under 6,000 characters.");
    expect((await PATCH(req("PATCH", { ownerBrief: "x", switch: "texts", on: true }), ctx())).status).toBe(400);
    h.lineOn = false;
    const off = await PATCH(req("PATCH", { ownerBrief: "x" }), ctx());
    expect(off.status).toBe(400);
    expect(h.db?.tables.companies[0].ai_settings).toEqual({ sms_agent: { enabled: true }, owner_line: { brief: "Roofing pays the bills." } });
  });

  it("PATCH: a switch still works and its answer keeps the notes", async () => {
    const out = await json(await PATCH(req("PATCH", { switch: "morning_briefing", on: true }), ctx()));
    expect(out.data?.ownerLine).toEqual({ brief: "Roofing pays the bills.", maxChars: 6000 });
    expect((h.db?.tables.companies[0].ai_settings as Record<string, unknown>).owner_line).toEqual({ brief: "Roofing pays the bills." });
  });
});
