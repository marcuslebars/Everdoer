/**
 * The wizard's "Your AI" step (src/server/services/onboarding-ai.ts): one step turns the agent
 * on the way done-for-you does — the trade's defaults once, the owner's name + tone, texts on
 * (ask me first by default), calls on unless they chose voicemail — and says what's missing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const resync = vi.fn(async () => ({ status: "not_provisioned" }));
vi.mock("@/server/services/voice/resync", () => ({ resyncReceptionistAgent: (...args: unknown[]) => resync(...(args as [])) }));

import { getYourAiStep, setUpYourAi } from "@/server/services/onboarding-ai";
import { ONBOARDING_STEPS, nextOnboardingStep } from "@/server/services/onboarding";
import { readinessGaps } from "@/lib/ai-readiness";
import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

const scope = { organizationId: "org-1", companyId: "co-1" };

function seed(company: Record<string, unknown> = {}, extra: Record<string, unknown[]> = {}): FakeDb {
  return createFakeDb({
    companies: [
      {
        id: "co-1",
        organization_id: "org-1",
        ai_settings: {},
        review_settings: {},
        sales_call_settings: {},
        brand_review_url: null,
        agent_persona: {},
        industry_pack: { id: "plumbing", version: 1 },
        owner_phone_e164: "+17055550111",
        owner_phone_verified_at: null,
        updated_at: "2026-10-30T10:00:00.000Z",
        ...company,
      },
    ],
    organizations: [{ id: "org-1", platform_brand: "everdoer", crankleads_tier: null }],
    voice_numbers: [],
    service_catalog_items: [],
    agent_blueprint_applications: [],
    ...extra,
  });
}

let db: FakeDb;
const admin = () => db.client as never;
// The default blueprint (tested in agent-blueprints.test.ts): here it records an application.
const applyBlueprint = vi.fn(async (_admin: unknown, input: { scope: typeof scope; packId: string | null }) => {
  db.tables.agent_blueprint_applications.push({ id: `app-${db.tables.agent_blueprint_applications.length + 1}`, organization_id: input.scope.organizationId, company_id: input.scope.companyId });
  return { applied: true, blueprint: `${input.packId} default v1`, changes: 3 };
});

beforeEach(() => {
  resync.mockClear();
  applyBlueprint.mockClear();
  db = seed();
});

describe("setUpYourAi", () => {
  it("applies the trade's defaults, saves the name + tone, and turns texts (ask me first) and calls on", async () => {
    const result = await setUpYourAi(admin(), scope, { name: "Sam", tone: "friendly", autonomy: "ask_first" }, { applyBlueprint });
    expect(applyBlueprint).toHaveBeenCalledWith(expect.anything(), { scope, packId: "plumbing", appliedBy: "self_serve_onboarding" });
    expect(result?.blueprint).toMatchObject({ applied: true, blueprint: "plumbing default v1" });

    const company = db.tables.companies[0];
    expect(company.agent_persona).toMatchObject({ name: "Sam", tone: "friendly" });
    expect((company.ai_settings as Record<string, unknown>).sms_agent).toMatchObject({ enabled: true, autonomy: "ask_first" });
    expect((company.ai_settings as Record<string, unknown>).call_answering).toMatchObject({ mode: "ai" });
    expect(result?.view.switches.find((s) => s.key === "texts")).toMatchObject({ on: true, choice: "ask_first" });
    expect(result?.view.switches.find((s) => s.key === "calls")).toMatchObject({ on: true });
    expect(resync).toHaveBeenCalledTimes(1); // the persona changed → the phone receptionist picks it up
  });

  it("'On its own' is honoured; the defaults are applied once, never again", async () => {
    await setUpYourAi(admin(), scope, { name: null, tone: null, autonomy: "ask_first" }, { applyBlueprint });
    const again = await setUpYourAi(admin(), scope, { name: null, tone: "casual", autonomy: "standard" }, { applyBlueprint });
    expect(applyBlueprint).toHaveBeenCalledTimes(1);
    expect(again?.blueprint).toEqual({ applied: false, reason: "already applied" });
    expect((db.tables.companies[0].ai_settings as Record<string, unknown>).sms_agent).toMatchObject({ enabled: true, autonomy: "standard" });
  });

  it("an owner who chose voicemail keeps it; other settings are untouched", async () => {
    db = seed({ ai_settings: { call_answering: { mode: "voicemail" }, weekly_report: { enabled: true } } });
    await setUpYourAi(admin(), scope, { name: null, tone: null, autonomy: "ask_first" }, { applyBlueprint });
    const ai = db.tables.companies[0].ai_settings as Record<string, unknown>;
    expect(ai.call_answering).toEqual({ mode: "voicemail" });
    expect(ai.weekly_report).toEqual({ enabled: true });
  });

  it("no industry pack → no blueprint, the rest still happens", async () => {
    db = seed({ industry_pack: null });
    const result = await setUpYourAi(admin(), scope, { name: null, tone: null, autonomy: "ask_first" }, { applyBlueprint });
    expect(applyBlueprint).not.toHaveBeenCalled();
    expect(result?.blueprint).toEqual({ applied: false, reason: "no pack" });
    expect((db.tables.companies[0].ai_settings as Record<string, unknown>).sms_agent).toMatchObject({ enabled: true });
  });

  it("another org's company → null, nothing written", async () => {
    expect(await setUpYourAi(admin(), { organizationId: "org-2", companyId: "co-1" }, { name: "Sam", tone: null, autonomy: "ask_first" }, { applyBlueprint })).toBeNull();
    expect(db.tables.companies[0].ai_settings).toEqual({});
  });
});

describe("readiness", () => {
  it("counts what the AI still needs", async () => {
    db = seed(
      { owner_phone_verified_at: "2026-11-01T00:00:00Z" },
      {
        voice_numbers: [{ organization_id: "org-1", company_id: "co-1", provider: "twilio", mode: "missed_call_catcher", active: true, phone_e164: "+17055550199" }],
        service_catalog_items: [
          { organization_id: "org-1", company_id: "co-1", active: true, rate_cents: 14900 },
          { organization_id: "org-1", company_id: "co-1", active: true, rate_cents: 0 },
          { organization_id: "org-1", company_id: "co-1", active: false, rate_cents: 0 },
        ],
      },
    );
    const step = await getYourAiStep(admin(), scope);
    expect(step?.readiness).toEqual({ ownerCellConfirmed: true, hasNumber: true, pricedServices: 1, unpricedServices: 1 });
  });

  it("readinessGaps: number, then cell, then prices — each pointing at the step that fixes it", () => {
    expect(readinessGaps({ ownerCellConfirmed: false, hasNumber: false, pricedServices: 0, unpricedServices: 4 }).map((g) => [g.key, g.step])).toEqual([
      ["number", "phone"],
      ["cell", "business"],
      ["prices", "services"],
    ]);
    expect(readinessGaps({ ownerCellConfirmed: true, hasNumber: true, pricedServices: 3, unpricedServices: 1 })).toEqual([
      { key: "prices", step: "services", text: "1 service has no price yet — it won't quote that one." },
    ]);
    expect(readinessGaps({ ownerCellConfirmed: true, hasNumber: true, pricedServices: 3, unpricedServices: 0 })).toEqual([]);
  });

  it("the wizard has the Your AI step right after Phone", () => {
    expect(ONBOARDING_STEPS.indexOf("ai")).toBe(ONBOARDING_STEPS.indexOf("phone") + 1);
    expect(nextOnboardingStep(["business", "services", "phone"])).toBe("ai");
  });
});
