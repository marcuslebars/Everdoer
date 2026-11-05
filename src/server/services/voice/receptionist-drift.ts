// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): the scheduler's receptionist drift sweep (worker, no
// session). Every company is handled with a context pinned to its OWN organization_id, read
// from its onboarding_progress row; all writes go through resyncReceptionistForContext.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Keep the phone receptionist in step with the business (docs/front-desk-ai.md → "Keeping the
 * receptionist up to date"). Its prompt is built from the price list, hours, service area,
 * industry pack, booking link and persona — and used to be a snapshot from setup day. This sweep
 * compares a fingerprint of what the receptionist WOULD be built from now
 * (receptionistFingerprint) with what was last pushed (phone step data
 * `receptionistFingerprint`), and re-syncs the ones that changed. It catches every way those
 * facts change (Settings, the pack card, an owner text, an import) without hooking each one.
 *
 * Throttled: at most once per RECEPTIONIST_DRIFT_INTERVAL_MS per process, RECEPTIONIST_DRIFT_BATCH
 * companies per pass (the least recently checked first), and a company whose re-sync failed is
 * left alone for RECEPTIONIST_DRIFT_RETRY_MS. Never throws.
 */
import type { Json } from "@/server/db/database.types";
import { receptionistFingerprint } from "@/server/services/onboarding-provision";
import type { TenantServiceContext } from "@/server/services/shared";
import { resyncReceptionistForContext, type ResyncOutcome } from "@/server/services/voice/resync";
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const RECEPTIONIST_DRIFT_INTERVAL_MS = 15 * 60_000;
export const RECEPTIONIST_DRIFT_BATCH = 25;
export const RECEPTIONIST_DRIFT_RETRY_MS = 60 * 60_000;

export interface DriftDeps {
  fingerprint?: (ctx: TenantServiceContext, companyId: string) => Promise<string>;
  resync?: (ctx: TenantServiceContext, companyId: string) => Promise<ResyncOutcome>;
}

export interface DriftResult {
  checked: number;
  resynced: number;
  failed: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Does this phone step data name a receptionist (a dedicated line, or one pinned on the number)? PURE. */
export function hasReceptionist(data: unknown): boolean {
  const d = record(data);
  const pinned = record(d.catcherAgent);
  return Boolean((str(d.llmId) && str(d.agentId) && str(d.phoneNumber)) || (str(pinned.llmId) && str(pinned.agentId)));
}

let lastRunMs = 0;
/** Test hook: forget the per-process throttle. */
export function resetReceptionistDriftThrottle(): void {
  lastRunMs = 0;
}

export async function sweepReceptionistDrift(admin: AdminClient, nowMs: number, deps: DriftDeps = {}): Promise<DriftResult> {
  const result: DriftResult = { checked: 0, resynced: 0, failed: 0 };
  if (nowMs - lastRunMs < RECEPTIONIST_DRIFT_INTERVAL_MS) return result;
  lastRunMs = nowMs;
  try {
    const { data, error } = await admin.from("onboarding_progress").select("id, organization_id, company_id, data").eq("step", "phone");
    if (error) throw error;
    const rows = ((data ?? []) as Array<{ id: string; organization_id: string; company_id: string; data: unknown }>)
      .filter((r) => hasReceptionist(r.data))
      .filter((r) => {
        const failedAt = Date.parse(String(record(r.data).receptionistSyncFailedAt ?? ""));
        return !Number.isFinite(failedAt) || nowMs - failedAt >= RECEPTIONIST_DRIFT_RETRY_MS;
      })
      .sort((a, b) => String(record(a.data).receptionistCheckedAt ?? "").localeCompare(String(record(b.data).receptionistCheckedAt ?? "")))
      .slice(0, RECEPTIONIST_DRIFT_BATCH);

    const fingerprint = deps.fingerprint ?? receptionistFingerprint;
    const resync = deps.resync ?? ((ctx: TenantServiceContext, companyId: string) => resyncReceptionistForContext(ctx, companyId));
    const nowIso = new Date(nowMs).toISOString();

    for (const row of rows) {
      const ctx: TenantServiceContext = { organizationId: row.organization_id, actorProfileId: null, supabase: admin };
      result.checked += 1;
      const stamp: Record<string, Json> = { receptionistCheckedAt: nowIso };
      try {
        const now = await fingerprint(ctx, row.company_id);
        if (now !== record(row.data).receptionistFingerprint) {
          const outcome = await resync(ctx, row.company_id);
          if (outcome.status === "resynced") {
            result.resynced += 1;
            // resyncReceptionistForContext records the fingerprint itself; stamp it here too in
            // case a test / caller's resync doesn't.
            stamp.receptionistFingerprint = now;
            stamp.receptionistSyncedAt = nowIso;
            stamp.receptionistSyncFailedAt = null;
          }
        }
      } catch (err) {
        result.failed += 1;
        stamp.receptionistSyncFailedAt = nowIso;
        console.error(`[receptionist-drift] company ${row.company_id} re-sync failed (retry in an hour):`, err instanceof Error ? err.message : err);
      }
      await stampRow(admin, row, stamp).catch((err: unknown) =>
        console.error("[receptionist-drift] couldn't stamp the phone step:", err instanceof Error ? err.message : err),
      );
    }
    if (result.resynced || result.failed) console.log(`[receptionist-drift] checked=${result.checked} resynced=${result.resynced} failed=${result.failed}`);
  } catch (err) {
    console.error("[receptionist-drift] sweep failed:", err instanceof Error ? err.message : err);
  }
  return result;
}

/** Merge the stamp into the row's data as it is NOW (re-read: a re-sync may have just written it). */
async function stampRow(admin: AdminClient, row: { id: string; organization_id: string }, stamp: Record<string, Json>): Promise<void> {
  const { data, error } = await admin.from("onboarding_progress").select("data").eq("id", row.id).eq("organization_id", row.organization_id).maybeSingle();
  if (error) throw error;
  const current = record((data as { data: unknown } | null)?.data) as Record<string, Json>;
  const { error: writeError } = await admin
    .from("onboarding_progress")
    .update({ data: { ...current, ...stamp } as Json })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id);
  if (writeError) throw writeError;
}
