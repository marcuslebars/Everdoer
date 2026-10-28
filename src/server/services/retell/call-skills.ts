// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION #4 (Retell voice routes, see tenant.ts): the phone receptionist's
// skills run with the service role — Retell has no user session. The TENANT comes only from the
// call (signed AI-answer metadata, else the dialled number → agent id; never the legacy env
// guess) and the CALLER only from caller ID, matched to a contact of that company. The model's
// arguments never pick an organization, a company or a customer.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The one Retell function route for skills (docs/agent-kernel.md → "Skills"):
 * POST /api/retell/functions/skill with Retell's { name, args, call } envelope → the skill named
 * `name`, run for the call's tenant and caller.
 */
import { runSkill, SAY_SKILL_FAILED } from "@/server/agent/skills/registry";
import type { SkillCaller, SkillResult } from "@/server/agent/skills/types";
import { answerCallMatches, isVerifiedAnswerTenant, readAnswerMetadata } from "@/server/services/voice/ai-answer";
import { getRetellConfig } from "./config";
import type { RetellFunctionRequest } from "./functions";
import { normalizePhoneLast10, toE164 } from "./payload";
import { createRetellAdminClient, pinnedRetellTenant, resolveRetellTenant, type RetellAdminClient, type RetellTenant } from "./tenant";

function readCall(raw: unknown): Record<string, unknown> {
  const call = raw && typeof raw === "object" ? (raw as Record<string, unknown>).call : undefined;
  return call && typeof call === "object" ? (call as Record<string, unknown>) : {};
}

/**
 * The company a Retell function call is for: signed + fresh AI-answer metadata for THIS call,
 * else the dialled number → agent id. Null when the metadata doesn't verify.
 */
export async function resolveCallTenant(admin: RetellAdminClient, req: RetellFunctionRequest<unknown>): Promise<RetellTenant | null> {
  const answered = readAnswerMetadata(readCall(req.raw).metadata);
  if (answered) {
    if (!isVerifiedAnswerTenant(answered) || !(await answerCallMatches(admin, answered, req.call.callId))) return null;
    return pinnedRetellTenant(admin, answered.organizationId, answered.companyId);
  }
  return resolveRetellTenant(admin, { toNumber: req.call.toNumber, agentId: req.call.agentId, legacySourceSite: getRetellConfig().sourceSite });
}

/** The caller as a contact of this company, by caller ID (most recently updated match). */
export async function callerFor(admin: RetellAdminClient, tenant: { organizationId: string; companyId: string }, fromNumber: string | null): Promise<SkillCaller> {
  const phone = toE164(fromNumber) ?? null;
  const last10 = normalizePhoneLast10(fromNumber);
  if (!last10) return { contactId: null, phone, name: null };
  const { data } = await admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("organization_id", tenant.organizationId)
    .eq("company_id", tenant.companyId)
    .eq("phone_last10", last10)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; first_name: string | null; last_name: string | null } | null;
  const name = row ? [row.first_name, row.last_name].filter(Boolean).join(" ") || null : null;
  return { contactId: row?.id ?? null, phone, name };
}

export interface VoiceSkillDeps {
  admin: () => RetellAdminClient;
  resolveTenant: (admin: RetellAdminClient, req: RetellFunctionRequest<unknown>) => Promise<RetellTenant | null>;
  now: () => number;
}

export const defaultVoiceSkillDeps: VoiceSkillDeps = { admin: createRetellAdminClient, resolveTenant: resolveCallTenant, now: Date.now };

/** Run the skill a Retell function call names. Never throws; always has a `say` on failure. */
export async function runVoiceSkill(req: RetellFunctionRequest<unknown>, deps: VoiceSkillDeps = defaultVoiceSkillDeps): Promise<SkillResult> {
  try {
    const admin = deps.admin();
    const tenant = await deps.resolveTenant(admin, req);
    // Never act for a guessed company (the legacy env fallback) or an unverified call.
    if (!tenant?.organizationId || !tenant.companyId || tenant.resolvedBy === "legacy") {
      return { ok: false, reason: "unsupported", say: SAY_SKILL_FAILED };
    }
    const scope = { organizationId: tenant.organizationId, companyId: tenant.companyId };
    const caller = await callerFor(admin, scope, req.call.fromNumber);
    return await runSkill({ admin, channel: "voice", scope, caller, nowMs: deps.now(), callId: req.call.callId }, req.name, req.args);
  } catch (err) {
    console.error("[retell:skill] failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "error", say: SAY_SKILL_FAILED };
  }
}
