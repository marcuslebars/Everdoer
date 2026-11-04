// ─────────────────────────────────────────────────────────────────────────────
// "One number for everything" — the self-serve Phone step (docs/front-desk-ai.md →
// "## Phone answering" → One number for everything).
//
// Every new business gets ONE local Twilio number that:
//   • customers can text (the texting agent answers from it — inbound-sms resolves the
//     tenant by the number texted, and resolveCompanySmsFrom sends from it);
//   • the business line forwards missed calls to (conditional forwarding);
//   • hands those calls to the AI at the level the plan includes: the company's own quoting /
//     booking receptionist on Front Desk (an agent pinned on this number, no Retell number),
//     the shared message-taking agent otherwise.
// It is the missed-call catcher number (voice_numbers mode missed_call_catcher), so the
// forwarding test, the text-back, AI answering and the minutes all work exactly as before.
// Runs under the caller's RLS client (owner/admin route).
// ─────────────────────────────────────────────────────────────────────────────
import type { Json } from "@/server/db/database.types";
import { ValidationError } from "@/server/organizations/context";
import { getOnboardingProgress, recordOnboardingEvent, upsertOnboardingStep } from "@/server/services/onboarding";
import { provisionCatcherReceptionist } from "@/server/services/onboarding-provision";
import type { RetellClient } from "@/server/services/retell/provision";
import { assertCompanyInOrganization, type TenantServiceContext } from "@/server/services/shared";
import { CATCHER_MODE } from "@/server/services/twilio/missed-call";
import {
  getMissedCallCatcherStatus,
  provisionMissedCallCatcher,
  type ProvisionCatcherResult,
  type ProvisionDeps,
} from "@/server/services/twilio/provision";
import { readSmsAgentSettings, smsAgentActive } from "@/server/services/sms-agent/settings";
import { isFrontDeskOrg } from "@/server/services/voice/ai-answer";
import { mergeCallAnsweringSettings, readCallAnsweringSettings } from "@/server/services/voice/answering-settings";
import { isDoneForYou } from "@/lib/product-line";

/** Who answers a forwarded call on this number ("voicemail": the owner turned AI answering off). */
export type AnsweringLevel = "receptionist" | "message" | "voicemail";

export type ReceptionistSetup =
  | { status: "ready"; agentId: string }
  /** The company already has a dedicated AI line (a Retell number) — that receptionist answers. */
  | { status: "dedicated_line" }
  /** The plan answers with the message-taking agent (not Front Desk). */
  | { status: "not_included" }
  /** Couldn't build it (Retell not configured / an API error): the message agent answers meanwhile. */
  | { status: "failed"; message: string };

export interface BusinessNumberResult {
  number: ProvisionCatcherResult;
  answering: AnsweringLevel;
  receptionist: ReceptionistSetup;
  /** True when this run switched AI call answering on (it was still the default, not a choice). */
  answeringTurnedOn: boolean;
}

export interface BusinessNumberInput {
  companyId: string;
  /** Owner-chosen area code. Default: the business line's own area code, then any. */
  areaCode?: number | null;
  /** Attach a number already in the Twilio account instead of buying one. */
  attachNumber?: string | null;
}

export interface BusinessNumberDeps extends ProvisionDeps {
  retell?: RetellClient;
  /** Injectable for tests (orgCan-free): the org's plan facts. */
  loadOrg?: (ctx: TenantServiceContext) => Promise<OrgFacts>;
}

interface OrgFacts {
  plan: string | null;
  crankleads_tier: string | null;
  platform_brand: string | null;
}

const NON_GEOGRAPHIC = new Set([800, 833, 844, 855, 866, 877, 888, 900, 976, 600, 500, 700]);

/** The NANP area code of a phone we can buy a local number in, or null. PURE. */
export function localAreaCode(raw: string | null | undefined): number | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10 || !/^[2-9]\d\d$/.test(ten.slice(0, 3)) || ten[1] === "9") return null;
  const npa = Number(ten.slice(0, 3));
  return NON_GEOGRAPHIC.has(npa) ? null : npa;
}

async function defaultLoadOrg(ctx: TenantServiceContext): Promise<OrgFacts> {
  const { data, error } = await ctx.supabase
    .from("organizations")
    .select("plan, crankleads_tier, platform_brand")
    .eq("id", ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  const row = data as OrgFacts | null;
  return { plan: row?.plan ?? null, crankleads_tier: row?.crankleads_tier ?? null, platform_brand: row?.platform_brand ?? null };
}

function objectData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Buy (or re-check) the company's number, switch AI call answering on unless the owner chose
 * voicemail, and — on Front Desk — build the receptionist on it. Idempotent: a second run keeps
 * the same number and updates the same receptionist. Records the wizard's Phone step.
 */
export async function setUpBusinessNumber(
  ctx: TenantServiceContext,
  input: BusinessNumberInput,
  deps: BusinessNumberDeps = {},
): Promise<BusinessNumberResult> {
  await assertCompanyInOrganization(ctx, input.companyId);

  const { data: company, error: companyError } = await ctx.supabase
    .from("companies")
    .select("brand_reply_phone, owner_phone_e164, ai_settings")
    .eq("organization_id", ctx.organizationId)
    .eq("id", input.companyId)
    .maybeSingle();
  if (companyError) throw companyError;
  const facts = company as { brand_reply_phone: string | null; owner_phone_e164: string | null; ai_settings: unknown } | null;

  // 1) The number. Area code: the owner's choice, else the business line's own (customers see a
  //    local number), else whatever Twilio has.
  const chosenArea = input.areaCode ?? null;
  const ownArea = chosenArea ?? localAreaCode(facts?.brand_reply_phone) ?? localAreaCode(facts?.owner_phone_e164);
  let number: ProvisionCatcherResult;
  try {
    number = await provisionMissedCallCatcher(ctx, { companyId: input.companyId, areaCode: ownArea, attachNumber: input.attachNumber ?? null }, deps);
  } catch (err) {
    // A guessed area code with nothing left shouldn't strand the owner: take any local number.
    if (chosenArea !== null || ownArea === null || input.attachNumber || !(err instanceof ValidationError) || !/No numbers available/.test(err.message)) throw err;
    number = await provisionMissedCallCatcher(ctx, { companyId: input.companyId, areaCode: null }, deps);
  }

  // 2) AI answers the calls it catches — unless the owner (or an operator) chose voicemail.
  const org = await (deps.loadOrg ?? defaultLoadOrg)(ctx);
  const answering = readCallAnsweringSettings(facts?.ai_settings, { doneForYou: isDoneForYou(org.platform_brand) });
  let answeringTurnedOn = false;
  if (!answering.modeExplicit) {
    const { error } = await ctx.supabase
      .from("companies")
      .update({ ai_settings: mergeCallAnsweringSettings(facts?.ai_settings, { mode: "ai" }) as Json })
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.companyId);
    if (error) throw error;
    answeringTurnedOn = true;
  }

  // 3) Front Desk: the company's own receptionist, on this number.
  const progress = await getOnboardingProgress(ctx, input.companyId);
  const prior = objectData(progress.find((p) => p.step === "phone")?.data);
  const pinned = objectData(prior.catcherAgent);
  let catcherAgent: { llmId?: string; agentId?: string } = {
    ...(typeof pinned.llmId === "string" ? { llmId: pinned.llmId } : {}),
    ...(typeof pinned.agentId === "string" ? { agentId: pinned.agentId } : {}),
  };
  const writeStep = async (completed: boolean) => {
    const data: Json = {
      ...(prior as Record<string, Json>),
      mode: CATCHER_MODE,
      setup: "one_number",
      catcherNumber: number.phoneNumber,
      catcherNumberSid: number.numberSid,
      ...(catcherAgent.agentId ? { catcherAgent } : {}),
    };
    await upsertOnboardingStep(ctx, input.companyId, "phone", { completed, data });
  };

  let receptionist: ReceptionistSetup;
  // A dedicated AI line = an active Retell number with its agent (what decideCallAnswering prefers).
  const { data: retellRows, error: retellError } = await ctx.supabase
    .from("voice_numbers")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("company_id", input.companyId)
    .eq("provider", "retell")
    .eq("active", true)
    .not("provider_agent_id", "is", null)
    .limit(1);
  if (retellError) throw retellError;
  const dedicatedLine = (retellRows ?? []).length > 0;
  if (!isFrontDeskOrg(org)) {
    receptionist = { status: "not_included" };
  } else if (dedicatedLine) {
    receptionist = { status: "dedicated_line" };
  } else {
    try {
      const built = await provisionCatcherReceptionist(
        ctx,
        {
          companyId: input.companyId,
          existing: catcherAgent,
          // Persist each Retell id the moment it exists, so a retry updates instead of duplicating.
          onCreated: async (ids) => {
            catcherAgent = { ...catcherAgent, ...ids };
            await writeStep(true);
          },
        },
        deps.retell,
      );
      catcherAgent = { llmId: built.llmId, agentId: built.agentId };
      receptionist = { status: "ready", agentId: built.agentId };
    } catch (err) {
      console.error("[onboarding-number] receptionist setup failed (message agent answers meanwhile):", errorMessage(err));
      receptionist = { status: "failed", message: errorMessage(err) };
      await recordOnboardingEvent(ctx, { companyId: input.companyId, step: "phone", event: "error", metadata: { setup: "one_number", receptionist: errorMessage(err) } });
    }
  }

  await writeStep(true);
  return {
    number,
    answering:
      answering.modeExplicit && answering.mode === "voicemail"
        ? "voicemail"
        : receptionist.status === "ready" || receptionist.status === "dedicated_line"
          ? "receptionist"
          : "message",
    receptionist,
    answeringTurnedOn,
  };
}

export interface BusinessNumberStatus {
  /** Twilio + the webhook base URL are configured on the server. */
  configured: boolean;
  number: { phoneNumber: string; phoneNumberPretty: string } | null;
  answering: AnsweringLevel;
  /** The plan includes the quoting / booking receptionist (Front Desk). */
  receptionistIncluded: boolean;
  /** The company has a dedicated AI line (a Retell number) from before. */
  dedicatedLine: boolean;
  /** "Answer customer texts" is on (the texting agent replies on this number). */
  textsOn: boolean;
  forwardingVerifiedAt: string | null;
}

/** What the Phone step shows (RLS client; members). */
export async function getBusinessNumberStatus(
  ctx: TenantServiceContext,
  companyId: string,
  deps: Pick<BusinessNumberDeps, "loadOrg"> = {},
): Promise<BusinessNumberStatus> {
  await assertCompanyInOrganization(ctx, companyId);
  const [{ data: company, error: companyError }, { data: numbers, error: numbersError }, org] = await Promise.all([
    ctx.supabase.from("companies").select("ai_settings").eq("organization_id", ctx.organizationId).eq("id", companyId).maybeSingle(),
    ctx.supabase
      .from("voice_numbers")
      .select("phone_e164, provider, mode, provider_agent_id, forwarding_verified_at, created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: false }),
    (deps.loadOrg ?? defaultLoadOrg)(ctx),
  ]);
  if (companyError) throw companyError;
  if (numbersError) throw numbersError;
  const rows = (numbers ?? []) as Array<{ phone_e164: string; provider: string; mode: string | null; provider_agent_id: string | null; forwarding_verified_at: string | null }>;
  const catcher = rows.find((r) => r.provider === "twilio" && r.mode === CATCHER_MODE) ?? null;
  const dedicatedLine = rows.some((r) => r.provider === "retell" && r.provider_agent_id);
  const receptionistIncluded = isFrontDeskOrg(org);
  const aiSettings = (company as { ai_settings: unknown } | null)?.ai_settings;
  const settings = readCallAnsweringSettings(aiSettings, { doneForYou: isDoneForYou(org.platform_brand) });
  const textsOn = smsAgentActive(readSmsAgentSettings(aiSettings, { doneForYou: isDoneForYou(org.platform_brand) }));
  const ownReceptionist = receptionistIncluded && (dedicatedLine || Boolean(catcher?.provider_agent_id));
  const catcherStatus = await getMissedCallCatcherStatus(ctx, companyId);
  return {
    configured: catcherStatus.configured,
    number: catcher ? { phoneNumber: catcher.phone_e164, phoneNumberPretty: catcherStatus.number?.phoneNumberPretty ?? catcher.phone_e164 } : null,
    answering: settings.mode === "voicemail" ? "voicemail" : ownReceptionist ? "receptionist" : "message",
    receptionistIncluded,
    dedicatedLine,
    textsOn,
    forwardingVerifiedAt: catcher?.forwarding_verified_at ?? null,
  };
}
