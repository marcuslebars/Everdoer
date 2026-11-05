// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): the scheduler's receptionist drift sweep (worker, no
// session). Every company is handled with a context pinned to its OWN organization_id, read
// from its voice_numbers row; all writes go through resyncReceptionistForContext (tenant-scoped)
// and the company's own sync-state row.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Keep the phone receptionist in step with the business (docs/front-desk-ai.md → "Keeping the
 * receptionist up to date"). Its prompt is built from the price list, hours, service area,
 * industry pack, booking link and persona, and used to be a snapshot from setup day. This sweep
 * compares a fingerprint of what the receptionist WOULD be built from now
 * (receptionistFingerprint) with what was last pushed (receptionist-sync-state.ts) and re-syncs
 * the ones that changed — catching every way those facts change without hooking each one.
 *
 * Scope: ONLY receptionists we built on the company's own number (one number for everything —
 * an agent pinned on its active Twilio catcher row, on a Front Desk plan). Those are entirely ours:
 * a re-sync only updates their Retell LLM + agent. Dedicated Retell lines are left alone — they
 * may be hand-tuned (voice, number bindings, outbound profile) and are re-synced as before by the
 * done-for-you switch-on, the concierge and a persona change.
 *
 * Throttled: at most once per RECEPTIONIST_DRIFT_INTERVAL_MS per process, RECEPTIONIST_DRIFT_BATCH
 * companies a pass (least recently checked first). A failed re-sync backs off (1 h, 4 h, then a
 * day) and is logged. Does nothing when Retell isn't configured. Never throws.
 */
import { isFrontDeskOrg } from "@/server/services/voice/ai-answer";
import { receptionistFingerprint } from "@/server/services/onboarding-provision";
import type { TenantServiceContext } from "@/server/services/shared";
import { parseSyncState, RECEPTIONIST_SYNC_STEP, writeSyncState, type ReceptionistSyncState } from "@/server/services/voice/receptionist-sync-state";
import { resyncReceptionistForContext, type ResyncOutcome } from "@/server/services/voice/resync";
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const RECEPTIONIST_DRIFT_INTERVAL_MS = 15 * 60_000;
export const RECEPTIONIST_DRIFT_BATCH = 10;
/** Back-off after the nth consecutive failure (1-based); the last applies from then on. */
export const RECEPTIONIST_DRIFT_BACKOFF_MS = [60 * 60_000, 4 * 60 * 60_000, 24 * 60 * 60_000];

/** twilio/missed-call.ts CATCHER_MODE (not imported: missed-call imports ai-answer → this graph). */
const CATCHER_MODE = "missed_call_catcher";

export interface DriftDeps {
  fingerprint?: (ctx: TenantServiceContext, companyId: string) => Promise<string>;
  resync?: (ctx: TenantServiceContext, companyId: string) => Promise<ResyncOutcome>;
  env?: Record<string, string | undefined>;
}

export interface DriftResult {
  checked: number;
  resynced: number;
  failed: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Can a re-sync work at all on this deployment? (Without these every push would fail.) PURE. */
export function driftConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.RETELL_API_KEY?.trim() && env.APP_BASE_URL?.trim() && env.RETELL_FUNCTION_SECRET?.trim());
}

/** Is a company in back-off after failures? PURE. */
export function inBackoff(state: ReceptionistSyncState, nowMs: number): boolean {
  if (!state.failedAt || !state.failures) return false;
  const failedAt = Date.parse(state.failedAt);
  if (!Number.isFinite(failedAt)) return false;
  const wait = RECEPTIONIST_DRIFT_BACKOFF_MS[Math.min(state.failures, RECEPTIONIST_DRIFT_BACKOFF_MS.length) - 1];
  return nowMs - failedAt < wait;
}

let lastRunMs = 0;
/** Test hook: forget the per-process throttle. */
export function resetReceptionistDriftThrottle(): void {
  lastRunMs = 0;
}

interface Candidate {
  organizationId: string;
  companyId: string;
  state: ReceptionistSyncState;
}

/** Companies with a receptionist pinned on their active number, on a Front Desk plan, matching the stored ids. */
async function candidates(admin: AdminClient): Promise<Candidate[]> {
  const { data: numbers, error } = await admin
    .from("voice_numbers")
    .select("organization_id, company_id, provider_agent_id")
    .eq("provider", "twilio")
    .eq("mode", CATCHER_MODE)
    .eq("active", true)
    .not("provider_agent_id", "is", null);
  if (error) throw error;
  const pinned = (numbers ?? []) as Array<{ organization_id: string; company_id: string; provider_agent_id: string }>;
  if (pinned.length === 0) return [];

  const companyIds = [...new Set(pinned.map((n) => n.company_id))];
  const orgIds = [...new Set(pinned.map((n) => n.organization_id))];
  const [{ data: orgs, error: orgError }, { data: progress, error: progressError }, { data: lines, error: linesError }] = await Promise.all([
    admin.from("organizations").select("id, plan, crankleads_tier").in("id", orgIds),
    admin.from("onboarding_progress").select("organization_id, company_id, step, data").in("company_id", companyIds).in("step", ["phone", RECEPTIONIST_SYNC_STEP]),
    // A company that ALSO has an active dedicated line: re-sync would push that one — leave it alone.
    admin.from("voice_numbers").select("company_id").in("company_id", companyIds).eq("provider", "retell").eq("active", true).not("provider_agent_id", "is", null),
  ]);
  if (orgError) throw orgError;
  if (progressError) throw progressError;
  if (linesError) throw linesError;
  const dedicated = new Set(((lines ?? []) as Array<{ company_id: string }>).map((l) => l.company_id));
  const frontDesk = new Set(((orgs ?? []) as Array<{ id: string; plan: string | null; crankleads_tier: string | null }>).filter((o) => isFrontDeskOrg(o)).map((o) => o.id));
  const rows = (progress ?? []) as Array<{ organization_id: string; company_id: string; step: string; data: unknown }>;
  const find = (n: { organization_id: string; company_id: string }, step: string) => rows.find((r) => r.organization_id === n.organization_id && r.company_id === n.company_id && r.step === step);

  const out: Candidate[] = [];
  for (const n of pinned) {
    if (!frontDesk.has(n.organization_id) || dedicated.has(n.company_id)) continue;
    // The agent on the number must be the one we built (phone step `catcherAgent`), so we only
    // ever update our own agent.
    const agent = record(record(find(n, "phone")?.data).catcherAgent);
    if (agent.agentId !== n.provider_agent_id || typeof agent.llmId !== "string") continue;
    out.push({ organizationId: n.organization_id, companyId: n.company_id, state: parseSyncState(find(n, RECEPTIONIST_SYNC_STEP)?.data) });
  }
  return out;
}

export async function sweepReceptionistDrift(admin: AdminClient, nowMs: number, deps: DriftDeps = {}): Promise<DriftResult> {
  const result: DriftResult = { checked: 0, resynced: 0, failed: 0 };
  if (nowMs - lastRunMs < RECEPTIONIST_DRIFT_INTERVAL_MS) return result;
  lastRunMs = nowMs;
  if (!driftConfigured(deps.env ?? process.env)) return result;
  try {
    const due = (await candidates(admin))
      .filter((c) => !inBackoff(c.state, nowMs))
      .sort((a, b) => (a.state.checkedAt ?? "").localeCompare(b.state.checkedAt ?? ""))
      .slice(0, RECEPTIONIST_DRIFT_BATCH);

    const fingerprint = deps.fingerprint ?? receptionistFingerprint;
    const resync = deps.resync ?? ((ctx: TenantServiceContext, companyId: string) => resyncReceptionistForContext(ctx, companyId));
    const nowIso = new Date(nowMs).toISOString();

    for (const c of due) {
      const ctx: TenantServiceContext = { organizationId: c.organizationId, actorProfileId: null, supabase: admin };
      result.checked += 1;
      const patch: ReceptionistSyncState = { checkedAt: nowIso };
      try {
        const now = await fingerprint(ctx, c.companyId);
        if (now !== c.state.fingerprint) {
          const outcome = await resync(ctx, c.companyId);
          if (outcome.status === "resynced") {
            result.resynced += 1;
            Object.assign(patch, { fingerprint: now, syncedAt: nowIso, failedAt: null, failures: 0 });
          }
        }
      } catch (err) {
        result.failed += 1;
        Object.assign(patch, { failedAt: nowIso, failures: (c.state.failures ?? 0) + 1 });
        console.error(
          `[receptionist-drift] company ${c.companyId} re-sync failed (attempt ${(c.state.failures ?? 0) + 1}; backing off):`,
          err instanceof Error ? err.message : err,
        );
      }
      await writeSyncState(ctx, c.companyId, patch).catch((err: unknown) =>
        console.error("[receptionist-drift] couldn't record the sync state:", err instanceof Error ? err.message : err),
      );
    }
    if (result.resynced || result.failed) console.log(`[receptionist-drift] checked=${result.checked} resynced=${result.resynced} failed=${result.failed}`);
  } catch (err) {
    console.error("[receptionist-drift] sweep failed:", err instanceof Error ? err.message : err);
  }
  return result;
}
