/**
 * What was last pushed to a company's receptionist (voice/receptionist-drift.ts). Kept in its OWN
 * onboarding_progress row (step "receptionist_sync", status "in_progress" — not a wizard step,
 * never "complete", so it doesn't count toward setup) so these writes can never race the Phone
 * step's data, which holds the Retell ids. Only the server writes it (the progress route refuses
 * unknown steps).
 */
import type { Json } from "@/server/db/database.types";
import type { TenantServiceContext } from "@/server/services/shared";

export const RECEPTIONIST_SYNC_STEP = "receptionist_sync";

export interface ReceptionistSyncState {
  fingerprint?: string | null;
  syncedAt?: string | null;
  checkedAt?: string | null;
  failedAt?: string | null;
  failures?: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function parseSyncState(data: unknown): ReceptionistSyncState {
  const d = record(data);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    fingerprint: str(d.fingerprint),
    syncedAt: str(d.syncedAt),
    checkedAt: str(d.checkedAt),
    failedAt: str(d.failedAt),
    failures: typeof d.failures === "number" ? d.failures : 0,
  };
}

/** Merge `patch` into the company's sync state (creating the row the first time). */
export async function writeSyncState(ctx: TenantServiceContext, companyId: string, patch: ReceptionistSyncState): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("onboarding_progress")
    .select("id, data")
    .eq("organization_id", ctx.organizationId)
    .eq("company_id", companyId)
    .eq("step", RECEPTIONIST_SYNC_STEP)
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; data: unknown } | null;
  const next = { ...parseSyncState(row?.data), ...patch } as unknown as Json;
  if (row) {
    const { error: writeError } = await ctx.supabase.from("onboarding_progress").update({ data: next }).eq("organization_id", ctx.organizationId).eq("id", row.id);
    if (writeError) throw writeError;
    return;
  }
  const { error: insertError } = await ctx.supabase
    .from("onboarding_progress")
    .insert({ organization_id: ctx.organizationId, company_id: companyId, step: RECEPTIONIST_SYNC_STEP, status: "in_progress", data: next });
  if (insertError) throw insertError;
}
