// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): the wizard's "Your AI" step. The route checks membership
// (owner/admin) and that the company belongs to the org on the caller's RLS client FIRST; only
// then does this write that one company with the service role (companies.ai_settings and
// agent_persona are not client-writable), through the same services the Your AI page uses.
// docs/your-ai.md → "Set up in onboarding".
// ─────────────────────────────────────────────────────────────────────────────
/**
 * One step turns the agent on for a new self-serve business, the way done-for-you does it:
 *   1. the trade's default blueprint (tuning only, unattended — applyDefaultBlueprintForPack),
 *      once per company, BEFORE the owner's own choices so theirs win;
 *   2. the owner's name + tone for the assistant (setYourAiPersona — re-syncs the receptionist);
 *   3. "Answer customer texts" ON, with the owner's autonomy (default: ask me first);
 *   4. "Answer your phone" ON unless the owner already chose voicemail.
 * Plus what's still missing for it all to work (readiness), shown in the step.
 */
import type { AiReadiness } from "@/lib/ai-readiness";
import type { AgentPersona } from "@/server/agent/profile";
import { applyDefaultBlueprintForPack } from "@/server/agent/blueprints/service";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { parseAppliedIndustryPack } from "@/server/services/packs/types";
import { getYourAiView, setSwitch, setYourAiPersona, type YourAiView } from "@/server/services/your-ai/switches";
import { readCallAnsweringSettings } from "@/server/services/voice/answering-settings";
import { readSmsAgentSettings, smsAgentActive } from "@/server/services/sms-agent/settings";
import { isDoneForYou } from "@/lib/product-line";

type Scope = { organizationId: string; companyId: string };

export type { AiReadiness };

export type TextAutonomy = "ask_first" | "standard";

export interface YourAiStepView {
  view: YourAiView;
  readiness: AiReadiness;
}

export interface SetUpYourAiInput {
  name: string | null;
  tone: AgentPersona["tone"];
  autonomy: TextAutonomy;
}

export interface SetUpYourAiResult extends YourAiStepView {
  blueprint: { applied: boolean; blueprint?: string; reason?: string };
}

export interface SetUpYourAiDeps {
  applyBlueprint?: typeof applyDefaultBlueprintForPack;
}

export async function loadAiReadiness(admin: AdminClient, scope: Scope): Promise<AiReadiness> {
  const [company, org, numbers, items] = await Promise.all([
    admin.from("companies").select("owner_phone_e164, owner_phone_verified_at, ai_settings").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle(),
    admin.from("organizations").select("platform_brand").eq("id", scope.organizationId).maybeSingle(),
    admin.from("voice_numbers").select("forwarding_verified_at").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).eq("provider", "twilio").eq("active", true),
    admin.from("service_catalog_items").select("rate_cents").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).eq("active", true),
  ]);
  for (const r of [company, org, numbers, items]) if (r.error) throw r.error;
  const row = company.data as { owner_phone_e164: string | null; owner_phone_verified_at: string | null; ai_settings: unknown } | null;
  const doneForYou = isDoneForYou((org.data as { platform_brand: string | null } | null)?.platform_brand ?? null);
  const twilio = (numbers.data ?? []) as Array<{ forwarding_verified_at: string | null }>;
  const rates = ((items.data ?? []) as Array<{ rate_cents: number | null }>).map((i) => i.rate_cents ?? 0);
  return {
    ownerCellConfirmed: Boolean(row?.owner_phone_e164 && row.owner_phone_verified_at),
    hasNumber: twilio.length > 0,
    forwardingVerified: twilio.some((n) => Boolean(n.forwarding_verified_at)),
    textsOn: smsAgentActive(readSmsAgentSettings(row?.ai_settings, { doneForYou })),
    callsOn: readCallAnsweringSettings(row?.ai_settings, { doneForYou }).mode === "ai",
    pricedServices: rates.filter((c) => c > 0).length,
    unpricedServices: rates.filter((c) => c <= 0).length,
  };
}

export async function getYourAiStep(admin: AdminClient, scope: Scope): Promise<YourAiStepView | null> {
  const view = await getYourAiView(admin, scope);
  if (!view) return null;
  return { view, readiness: await loadAiReadiness(admin, scope) };
}

/** Has this company ever had a blueprint applied (by anyone)? Then the default isn't re-applied. */
async function hasBlueprintApplication(admin: AdminClient, scope: Scope): Promise<boolean> {
  const { data, error } = await admin
    .from("agent_blueprint_applications")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

export async function setUpYourAi(admin: AdminClient, scope: Scope, input: SetUpYourAiInput, deps: SetUpYourAiDeps = {}): Promise<SetUpYourAiResult | null> {
  const { data, error } = await admin.from("companies").select("industry_pack, ai_settings").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const company = data as { industry_pack: unknown; ai_settings: unknown };

  // 1) The trade's defaults (once). Never fails the step.
  let blueprint: SetUpYourAiResult["blueprint"] = { applied: false, reason: "no pack" };
  const pack = parseAppliedIndustryPack(company.industry_pack);
  if (pack) {
    blueprint = (await hasBlueprintApplication(admin, scope))
      ? { applied: false, reason: "already applied" }
      : await (deps.applyBlueprint ?? applyDefaultBlueprintForPack)(admin, { scope, packId: pack.id, appliedBy: "self_serve_onboarding" });
  }

  // 2) Name + tone (re-syncs the phone receptionist when it changes).
  await setYourAiPersona(admin, scope, { name: input.name, tone: input.tone });

  // 3) Texts on, with the owner's autonomy.
  await setSwitch(admin, scope, { key: "texts", on: true, choice: input.autonomy });

  // 4) Calls on — unless the owner already chose voicemail (re-read: the blueprint may have set it).
  const { data: fresh, error: freshError } = await admin.from("companies").select("ai_settings").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
  if (freshError) throw freshError;
  const answering = readCallAnsweringSettings((fresh as { ai_settings: unknown } | null)?.ai_settings ?? company.ai_settings, { doneForYou: false });
  if (!answering.modeExplicit) await setSwitch(admin, scope, { key: "calls", on: true });

  const step = await getYourAiStep(admin, scope);
  if (!step) return null;
  return { ...step, blueprint };
}
