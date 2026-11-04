// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): re-sync a company's Front Desk receptionist in Retell.
// Called by the done-for-you switch-on (worker, no session) and the concierge console (operator
// only, via runConciergeAction). The context is pinned to the company's OWN organization_id,
// read from the company row; every write goes through provisionPhoneForCompany (tenant-scoped).
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Re-push the receptionist's prompt + tools + post-call analysis to its EXISTING Retell LLM /
 * agent / number (ids from the onboarding Phone step) — or, for a receptionist reached through
 * the company's own Twilio number, to its LLM / agent (phone data `catcherAgent`). Idempotent: only ever UPDATEs — it never
 * buys a number or creates an agent; with no stored ids it reports "not_provisioned".
 * docs/front-desk-ai.md → "## Phone answering" → Front Desk tools.
 */
import { getOnboardingProgress } from "@/server/services/onboarding";
import { provisionCatcherReceptionist, provisionPhoneForCompany } from "@/server/services/onboarding-provision";
import type { RetellClient } from "@/server/services/retell/provision";
import type { TenantServiceContext } from "@/server/services/shared";
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type ResyncOutcome =
  | { status: "resynced"; llmId: string; agentId: string; phoneNumber: string }
  | { status: "not_provisioned" }
  | { status: "company_not_found" };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The stored Retell ids for the company, or null when the receptionist was never provisioned. */
export async function storedReceptionistIds(
  ctx: TenantServiceContext,
  companyId: string,
): Promise<{ llmId: string; agentId: string; phoneNumber: string } | null> {
  const progress = await getOnboardingProgress(ctx, companyId);
  const data = progress.find((p) => p.step === "phone")?.data;
  const prior = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const llmId = str(prior.llmId);
  const agentId = str(prior.agentId);
  const phoneNumber = str(prior.phoneNumber);
  return llmId && agentId && phoneNumber ? { llmId, agentId, phoneNumber } : null;
}

/**
 * The receptionist pinned on the company's own Twilio number (one number for everything:
 * phone step data `catcherAgent`, written by onboarding-number.ts), or null.
 */
export async function storedCatcherReceptionistIds(
  ctx: TenantServiceContext,
  companyId: string,
): Promise<{ llmId: string; agentId: string } | null> {
  const progress = await getOnboardingProgress(ctx, companyId);
  const data = progress.find((p) => p.step === "phone")?.data;
  const prior = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const agent = prior.catcherAgent && typeof prior.catcherAgent === "object" && !Array.isArray(prior.catcherAgent) ? (prior.catcherAgent as Record<string, unknown>) : {};
  const llmId = str(agent.llmId);
  const agentId = str(agent.agentId);
  return llmId && agentId ? { llmId, agentId } : null;
}

async function hasActiveDedicatedLine(ctx: TenantServiceContext, companyId: string): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from("voice_numbers")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("company_id", companyId)
    .eq("provider", "retell")
    .eq("active", true)
    .not("provider_agent_id", "is", null)
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

export async function resyncReceptionistForContext(
  ctx: TenantServiceContext,
  companyId: string,
  retell?: RetellClient,
): Promise<ResyncOutcome> {
  const ids = await storedReceptionistIds(ctx, companyId);
  const pinned = await storedCatcherReceptionistIds(ctx, companyId);
  // The receptionist that actually answers decides: an active dedicated line (a Retell number with
  // its agent) wins — decideCallAnswering prefers it too; otherwise the one pinned on the number.
  if (ids && (!pinned || (await hasActiveDedicatedLine(ctx, companyId)))) {
    const result = await provisionPhoneForCompany(ctx, { companyId, existing: ids }, retell);
    return { status: "resynced", llmId: result.llmId, agentId: result.agentId, phoneNumber: result.phoneNumber };
  }
  if (!pinned) return { status: "not_provisioned" };
  const result = await provisionCatcherReceptionist(ctx, { companyId, existing: pinned }, retell);
  return { status: "resynced", llmId: result.llmId, agentId: result.agentId, phoneNumber: result.catcherNumber };
}

/** Re-sync by company id alone (the org is read from the company row). */
export async function resyncReceptionistAgent(
  admin: AdminClient,
  companyId: string,
  deps: { retell?: RetellClient } = {},
): Promise<ResyncOutcome> {
  const { data, error } = await admin.from("companies").select("organization_id").eq("id", companyId).maybeSingle();
  if (error) throw error;
  const organizationId = (data as { organization_id: string } | null)?.organization_id;
  if (!organizationId) return { status: "company_not_found" };
  const ctx: TenantServiceContext = { organizationId, actorProfileId: null, supabase: admin };
  return resyncReceptionistForContext(ctx, companyId, deps.retell);
}
