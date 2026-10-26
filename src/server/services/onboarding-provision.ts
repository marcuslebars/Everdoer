import { UserFacingError } from "@/server/errors";
import type { Tables } from "@/server/db/database.types";
import type { TenantServiceContext } from "@/server/services/shared";
import { upsertCompanyVoiceProfile } from "@/server/services/company-voice-profiles";
import { getPack, packReceptionistNotes } from "@/server/services/packs";
import { parseAppliedIndustryPack } from "@/server/services/packs/types";
import { buildReceptionistTools, RECEPTIONIST_ANALYSIS_FIELDS } from "@/server/services/retell/receptionist-tools";
import { retellCountryFor } from "@/server/services/voice/canada";
import { hoursToText, loadCompanyFacts } from "@/server/services/voice/company-facts";
import {
  buildReceptionistPrompt,
  createRetellClient,
  getRetellApiKey,
  provisionRetellAgent,
  type ProvisionResult,
  type RetellClient,
} from "@/server/services/retell/provision";

/**
 * Phone step orchestration (Task 13): build Marina's prompt from the company + catalog,
 * provision the Retell LLM/agent/number (idempotent via the ids we stored last time), then
 * persist voice_numbers (inbound routing reads provider_agent_id here) + the voice profile.
 * The Retell client is injectable for tests; secrets stay server-side.
 */

export interface ProvisionPhoneInput {
  companyId: string;
  areaCode?: number | null;
  attachNumber?: string | null;
  transferNumber?: string | null;
  /** Ids from a previous run (onboarding_progress data) → update instead of create. */
  existing?: { llmId?: string | null; agentId?: string | null; phoneNumber?: string | null };
  /** Persist each Retell id as soon as it's created (see ProvisionInput.onCreated). */
  onCreated?: (ids: { llmId?: string; agentId?: string; phoneNumber?: string }) => Promise<void>;
}

// hoursToText + the company/catalog loader live in voice/company-facts.ts (shared with outbound calls).
export { hoursToText };

async function upsertRetellVoiceNumber(
  context: TenantServiceContext,
  companyId: string,
  phoneE164: string,
  agentId: string,
  brandLabel: string,
): Promise<void> {
  const { data: existing } = await context.supabase
    .from("voice_numbers")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("company_id", companyId)
    .eq("provider", "retell")
    .limit(1)
    .maybeSingle();

  if (existing && (existing as { id: string }).id) {
    const { error } = await context.supabase
      .from("voice_numbers")
      .update({ phone_e164: phoneE164, provider_agent_id: agentId, active: true, brand_label: brandLabel })
      .eq("id", (existing as { id: string }).id);
    if (error) throw error;
    return;
  }
  const { error } = await context.supabase.from("voice_numbers").insert({
    organization_id: context.organizationId,
    company_id: companyId,
    phone_e164: phoneE164,
    provider: "retell",
    provider_agent_id: agentId,
    brand_label: brandLabel,
    active: true,
  });
  if (error) throw error;
}

/** A1-style marine company: the marine pack, or a shrink-wrap price list. */
export function isMarineCompany(packId: string | null, serviceKeys: Array<string | null | undefined>): boolean {
  return packId === "marine" || serviceKeys.some((key) => typeof key === "string" && /^shrink_?wrap/.test(key));
}

export async function provisionPhoneForCompany(
  context: TenantServiceContext,
  input: ProvisionPhoneInput,
  client?: RetellClient,
): Promise<ProvisionResult> {
  const apiKey = getRetellApiKey();
  const retell = client ?? (apiKey ? createRetellClient(apiKey) : null);
  if (!retell) {
    console.error("[onboarding] RETELL_API_KEY is not set — can't provision a number.");
    throw new UserFacingError("Phone setup isn't available right now. Please contact support.", { status: 503, code: "voice_not_configured" });
  }

  // Services (with a price only when the owner or their site gave one), hours, service area and
  // booking link — the same facts outbound calls are built from (voice/company-facts.ts).
  const facts = await loadCompanyFacts(context, input.companyId);
  const { company, items, services, bookingUrl } = facts;
  const baseUrl = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/api/retell/webhook`;

  // The company's industry pack (if one was applied) adds trade FAQs / urgency keywords.
  const appliedPack = parseAppliedIndustryPack(company.industry_pack);
  const pack = appliedPack ? getPack(appliedPack.id) : null;

  // Tools (docs/front-desk-ai.md → "## Phone answering"): wired only when the deployment can
  // serve them (public base URL + the shared function secret). Marine keeps its own quote tool.
  const functionSecret = process.env.RETELL_FUNCTION_SECRET?.trim() || null;
  const marine = isMarineCompany(appliedPack?.id ?? null, items.map((i) => i.service_key));
  const tools = baseUrl && functionSecret ? buildReceptionistTools({ baseUrl, functionSecret, marine }) : null;
  if (!tools) console.warn("[onboarding] APP_BASE_URL or RETELL_FUNCTION_SECRET unset — receptionist provisioned WITHOUT tools.");

  const prompt = buildReceptionistPrompt(
    {
      companyName: company.name,
      services,
      hoursText: facts.hoursText,
      bookingUrl,
      serviceArea: company.service_area,
      transferNumber: input.transferNumber ?? company.owner_phone_e164,
      tools: tools ? (marine ? "marine" : "price_list") : null,
    },
    pack ? packReceptionistNotes(pack) : null,
  );

  const result = await provisionRetellAgent(retell, {
    companyName: company.name,
    prompt,
    voiceId: undefined,
    webhookUrl: webhookUrl || null,
    inboundWebhookUrl: baseUrl ? `${baseUrl}/api/retell/inbound` : null,
    areaCode: input.areaCode ?? null,
    countryCode: retellCountryFor(input.areaCode ?? null, company.brand_reply_phone, company.owner_phone_e164),
    generalTools: tools,
    postCallAnalysisData: RECEPTIONIST_ANALYSIS_FIELDS,
    attachNumber: input.attachNumber ?? null,
    existing: input.existing,
    onCreated: input.onCreated,
  });

  await upsertRetellVoiceNumber(context, input.companyId, result.phoneNumber, result.agentId, company.name);

  // Record the profile (prompt + from number). The inbound agent id lives on voice_numbers.
  await upsertCompanyVoiceProfile(context, {
    companyId: input.companyId,
    systemPrompt: prompt,
    brandLabel: company.name,
    fromNumber: result.phoneNumber,
    active: true,
  });

  return result;
}
