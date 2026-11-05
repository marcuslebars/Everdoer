/**
 * Keeping the phone receptionist up to date (voice/receptionist-drift.ts): a change to what it's
 * built from (prices, hours, area, pack, persona) is pushed to Retell on the next sweep; nothing
 * is pushed when nothing changed; failures back off; companies without a receptionist are skipped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "./fake-supabase";

vi.mock("@/server/services/company-voice-profiles", () => ({ upsertCompanyVoiceProfile: async () => ({}) }));

import { driftConfigured, inBackoff, RECEPTIONIST_DRIFT_INTERVAL_MS, resetReceptionistDriftThrottle, sweepReceptionistDrift } from "@/server/services/voice/receptionist-drift";
import { receptionistFingerprint } from "@/server/services/onboarding-provision";
import { resyncReceptionistForContext } from "@/server/services/voice/resync";
import type { RetellClient } from "@/server/services/retell/provision";
import type { TenantServiceContext } from "@/server/services/shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const CO = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-11-05T15:00:00Z");
const HOUR = 3_600_000;
const ENV = { RETELL_API_KEY: "key_test", APP_BASE_URL: "https://app.everdoer.test", RETELL_FUNCTION_SECRET: "fn-secret" };

let db: FakeDb;
function seed(opts: { plan?: string; phoneData?: Record<string, unknown> | null; agentOnNumber?: string | null; dedicated?: boolean } = {}) {
  db = createFakeDb({
    organizations: [{ id: ORG, plan: opts.plan ?? "front_desk", crankleads_tier: null }],
    companies: [
      { id: CO, organization_id: ORG, name: "Northshore Plumbing", slug: "northshore", hours: { summary: "Mon–Fri 8–5" }, service_area: "Barrie", quote_public_base_url: null, industry_pack: null, owner_phone_e164: "+17055550111", brand_reply_phone: null, agent_persona: {} },
    ],
    service_catalog_items: [
      { id: "sci-1", organization_id: ORG, company_id: CO, service_key: "drain_clear", label: "Drain clearing", pricing_type: "flat", rate_cents: 14900, minimum_cents: 0, sort_order: 0, active: true },
    ],
    onboarding_progress:
      opts.phoneData === null ? [] : [{ id: "op-1", organization_id: ORG, company_id: CO, step: "phone", status: "complete", data: opts.phoneData ?? { mode: "missed_call_catcher", catcherAgent: { llmId: "llm_fd", agentId: "agent_fd" } } }],
    voice_numbers: [
      { id: "vn-1", organization_id: ORG, company_id: CO, provider: "twilio", mode: "missed_call_catcher", active: true, phone_e164: "+17055550199", provider_agent_id: opts.agentOnNumber === undefined ? "agent_fd" : opts.agentOnNumber },
      ...(opts.dedicated ? [{ id: "vn-2", organization_id: ORG, company_id: CO, provider: "retell", mode: "ai_receptionist", active: true, phone_e164: "+17055550100", provider_agent_id: "agent_old" }] : []),
    ],
  });
}
const syncState = () => (db.tables.onboarding_progress.find((r) => r.step === "receptionist_sync")?.data ?? {}) as Record<string, unknown>;

function mockRetell(calls: string[]): RetellClient {
  return {
    createLlm: async () => (calls.push("createLlm"), { llm_id: "llm_new" }),
    updateLlm: async (id) => (calls.push(`updateLlm:${id}`), { llm_id: id }),
    createAgent: async () => (calls.push("createAgent"), { agent_id: "agent_new" }),
    updateAgent: async (id) => (calls.push(`updateAgent:${id}`), { agent_id: id }),
    createPhoneNumber: async () => (calls.push("createPhoneNumber"), { phone_number: "+15555550000" }),
    updatePhoneNumber: async (n) => (calls.push(`updatePhoneNumber:${n}`), { phone_number: n }),
    listPhoneNumbers: async () => [],
  };
}

beforeEach(() => {
  resetReceptionistDriftThrottle();
  Object.assign(process.env, ENV);
});

describe("sweepReceptionistDrift", () => {
  it("a changed price (or hours, area, pack…) → one re-sync on the next pass, then quiet", async () => {
    seed();
    const calls: string[] = [];
    const resync = (ctx: TenantServiceContext, companyId: string) => resyncReceptionistForContext(ctx, companyId, mockRetell(calls));

    // First look: nothing recorded yet → push once, and remember it (in its own row, not the Phone step's).
    expect(await sweepReceptionistDrift(db.client as never, T0, { resync, env: ENV })).toMatchObject({ checked: 1, resynced: 1 });
    expect(calls).toEqual(["updateLlm:llm_fd", "updateAgent:agent_fd"]);
    const first = syncState().fingerprint;
    expect(typeof first).toBe("string");
    expect(db.tables.onboarding_progress.find((r) => r.step === "receptionist_sync")).toMatchObject({ status: "in_progress" });
    expect(db.tables.onboarding_progress.find((r) => r.step === "phone")?.data).toEqual({ mode: "missed_call_catcher", catcherAgent: { llmId: "llm_fd", agentId: "agent_fd" } });

    // Nothing changed → nothing pushed.
    calls.length = 0;
    expect(await sweepReceptionistDrift(db.client as never, T0 + RECEPTIONIST_DRIFT_INTERVAL_MS, { resync, env: ENV })).toMatchObject({ checked: 1, resynced: 0 });
    expect(calls).toEqual([]);

    // The owner changes a price → the prompt changes → pushed on the next pass.
    db.tables.service_catalog_items[0].rate_cents = 17900;
    expect(await sweepReceptionistDrift(db.client as never, T0 + 2 * RECEPTIONIST_DRIFT_INTERVAL_MS, { resync, env: ENV })).toMatchObject({ resynced: 1 });
    expect(calls).toEqual(["updateLlm:llm_fd", "updateAgent:agent_fd"]);
    expect(syncState().fingerprint).not.toBe(first);
  });

  it("only receptionists we built on the company's own number — never a dedicated line, another agent, or a non-Front-Desk org", async () => {
    const resync = vi.fn(async () => ({ status: "resynced" as const, llmId: "l", agentId: "a", phoneNumber: "+1" }));
    const run = async () => {
      resetReceptionistDriftThrottle();
      return sweepReceptionistDrift(db.client as never, T0, { resync, fingerprint: async () => "fp", env: ENV });
    };
    seed({ dedicated: true }); // also has an active dedicated Retell line (may be hand-tuned)
    expect(await run()).toMatchObject({ checked: 0 });
    seed({ agentOnNumber: "agent_someone_else" }); // the number's agent isn't the one we built
    expect(await run()).toMatchObject({ checked: 0 });
    seed({ plan: "operate" }); // downgraded: the message agent answers, not this one
    expect(await run()).toMatchObject({ checked: 0 });
    seed({ phoneData: { llmId: "l", agentId: "a", phoneNumber: "+17055550100" }, agentOnNumber: null }); // dedicated-line ids only
    expect(await run()).toMatchObject({ checked: 0 });
    expect(resync).not.toHaveBeenCalled();
  });

  it("does nothing when Retell isn't configured on this deployment", async () => {
    seed();
    const resync = vi.fn();
    expect(await sweepReceptionistDrift(db.client as never, T0, { resync, fingerprint: async () => "fp", env: { ...ENV, RETELL_API_KEY: "" } })).toEqual({ checked: 0, resynced: 0, failed: 0 });
    expect(driftConfigured(ENV)).toBe(true);
    expect(driftConfigured({ ...ENV, RETELL_FUNCTION_SECRET: " " })).toBe(false);
    expect(resync).not.toHaveBeenCalled();
  });

  it("throttled to once per interval per process", async () => {
    seed();
    const resync = vi.fn(async () => ({ status: "resynced" as const, llmId: "l", agentId: "a", phoneNumber: "+1" }));
    await sweepReceptionistDrift(db.client as never, T0, { resync, fingerprint: async () => "fp-1", env: ENV });
    expect(await sweepReceptionistDrift(db.client as never, T0 + 60_000, { resync, fingerprint: async () => "fp-2", env: ENV })).toEqual({ checked: 0, resynced: 0, failed: 0 });
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("failures back off: 1 h, then 4 h, then a day", async () => {
    seed();
    const resync = vi.fn(async () => {
      throw new Error("retell down");
    });
    const pass = async (at: number) => {
      resetReceptionistDriftThrottle();
      return sweepReceptionistDrift(db.client as never, at, { resync, fingerprint: async () => "fp-new", env: ENV });
    };
    expect(await pass(T0)).toMatchObject({ failed: 1 });
    expect(syncState()).toMatchObject({ failures: 1, failedAt: new Date(T0).toISOString() });
    expect(await pass(T0 + HOUR - 1)).toMatchObject({ checked: 0 });
    expect(await pass(T0 + HOUR)).toMatchObject({ failed: 1 });
    expect(await pass(T0 + HOUR + 4 * HOUR - 1)).toMatchObject({ checked: 0 });
    expect(await pass(T0 + 5 * HOUR)).toMatchObject({ failed: 1 });
    expect(syncState()).toMatchObject({ failures: 3 });
    expect(inBackoff({ failures: 3, failedAt: new Date(T0 + 5 * HOUR).toISOString() }, T0 + 5 * HOUR + 23 * HOUR)).toBe(true);
    expect(inBackoff({ failures: 3, failedAt: new Date(T0 + 5 * HOUR).toISOString() }, T0 + 5 * HOUR + 24 * HOUR)).toBe(false);
  });

  it("the fingerprint follows what the receptionist is built from — and only that", async () => {
    seed();
    const ctx: TenantServiceContext = { organizationId: ORG, actorProfileId: null, supabase: db.client as never };
    const a = await receptionistFingerprint(ctx, CO);
    expect(await receptionistFingerprint(ctx, CO)).toBe(a);
    db.tables.companies[0].service_area = "Barrie and Orillia";
    const b = await receptionistFingerprint(ctx, CO);
    expect(b).not.toBe(a);
    db.tables.companies[0].agent_persona = { name: "Sam", tone: "friendly" };
    expect(await receptionistFingerprint(ctx, CO)).not.toBe(b);
  });
});

describe("health check sees a receptionist pinned on the company's own number", () => {
  it("receptionistLines: Retell numbers + a catcher with an agent; a plain catcher isn't one", async () => {
    const { receptionistLines } = await import("@/server/services/retell/health");
    expect(
      receptionistLines([
        { phone_e164: "+17055550100", provider: "retell", mode: "ai_receptionist", provider_agent_id: "agent_old" },
        { phone_e164: "+17055550199", provider: "twilio", mode: "missed_call_catcher", provider_agent_id: "agent_fd" },
        { phone_e164: "+17055550198", provider: "twilio", mode: "missed_call_catcher", provider_agent_id: null },
      ]),
    ).toEqual([
      { phone_e164: "+17055550100", provider_agent_id: "agent_old" },
      { phone_e164: "+17055550199", provider_agent_id: "agent_fd", pinned: true },
    ]);
  });

  it("a pinned line checks the agent and its tools, not a Retell number", async () => {
    const { receptionistHealth } = await import("@/server/services/retell/health");
    const getPhoneNumber = vi.fn();
    const report = await receptionistHealth({
      company: { name: "Northshore", owner_phone_e164: "+17055550111", stripe_charges_enabled: true, booking_policy: null },
      numbers: [{ phone_e164: "+17055550199", provider_agent_id: "agent_fd", pinned: true }],
      hasCatalog: true,
      baseUrl: "https://api.everdoer.test",
      env: { RETELL_INTAKE_ENABLED: "1", RETELL_API_KEY: "k", RETELL_FUNCTION_SECRET: "s" },
      smsConfigured: true,
      retell: {
        getPhoneNumber,
        getAgent: async () => ({ agent_id: "agent_fd", is_published: true, version: 1, webhook_url: "https://api.everdoer.test/api/retell/webhook", response_engine: { llm_id: "llm_fd" } }),
        getLlm: async () => ({ general_tools: [] }),
      } as never,
    });
    expect(getPhoneNumber).not.toHaveBeenCalled();
    expect(report.checks.find((c) => c.name === "+17055550199 answers with the agent")).toMatchObject({ ok: true });
    expect(report.checks.find((c) => c.name === "+17055550199 post-call webhook")).toMatchObject({ ok: true });
  });
});
