/**
 * "Your AI" (docs/your-ai.md): one page of plain-language switches over the AI staff's settings,
 * for an owner who doesn't want to learn what a dispatcher or an estimator is.
 *
 * Every switch maps onto a setting that already exists and is read by the role that acts on it,
 * through that role's own reader (defaults included) and merge function. Nothing new is stored:
 * flipping "Follow up on quotes" here is exactly the estimator's follow-up switch in Settings.
 * The details (cadences, hours, wording) stay in Settings → AI front desk ("Customize").
 *
 * SANCTIONED EXCEPTION (service role): the route checks membership (owner/admin to change) and
 * that the company is the org's on the caller's RLS client first; only then does this read and
 * write that one company with the service role (ai_settings isn't client-writable).
 */
import type { Json } from "@/server/db/database.types";
import { toJson } from "@/server/db/json";
import { UserFacingError } from "@/server/errors";
import { isDoneForYou } from "@/lib/product-line";
import { parsePersona, savePersona, DEFAULT_VOICE_NAME, type AgentPersona } from "@/server/agent/profile";
import { updateAiSettings, type AiSettings } from "@/server/services/front-desk/ai-settings-write";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { parseReviewSettings } from "@/server/services/reviews/rules";
import { parseSalesCallSettings, saveSalesCallSettings } from "@/server/services/sales-calls/settings";
import { mergeSmsAgentSettings, readSmsAgentSettings, smsAgentActive, type SmsAgentAutonomy } from "@/server/services/sms-agent/settings";
import { mergeCollectionsSettings, readCollectionsSettings } from "@/server/services/staff/bookkeeper/settings";
import { mergeCustomerCareSettings, readCustomerCareSettings } from "@/server/services/staff/customer-care/settings";
import { mergeDispatchSettings, readDispatchSettings } from "@/server/services/staff/dispatcher/settings";
import { sendsSms } from "@/server/services/staff/dispatcher/on-our-way";
import { QUOTE_FOLLOW_UP_RECIPE } from "@/server/services/staff/estimator/follow-up";
import { isRetellOutboundActive } from "@/server/services/voice";
import { hasReceptionistPlan } from "@/server/services/voice/minutes";
import { salesAgentId } from "@/server/services/voice/sales-agent";
import { followUpsActive, mergeEstimatorSettings, readEstimatorSettings } from "@/server/services/staff/estimator/settings";
import { mergeMarketingSettings, readMarketingSettings } from "@/server/services/staff/marketer/settings";
import { mergeOfficeManagerSettings, readOfficeManagerSettings } from "@/server/services/staff/office-manager/settings";
import { ORG_STAFF_COLUMNS, orgTier, type StaffOrg } from "@/server/services/staff/tiers";
import { mergeCallAnsweringSettings, readCallAnsweringSettings } from "@/server/services/voice/answering-settings";
import { resyncReceptionistAgent } from "@/server/services/voice/resync";
import { mergeWeeklyReportSettings, parseWeeklyReportSettings } from "@/server/services/weekly-report/settings";

export const SWITCH_KEYS = [
  "texts",
  "calls",
  "lead_calls",
  "quote_follow_ups",
  "chase_invoices",
  "weather",
  "on_our_way",
  "check_ins",
  "reviews",
  "win_back",
  "morning_briefing",
  "weekly_report",
] as const;
export type SwitchKey = (typeof SWITCH_KEYS)[number];

export type SwitchGroup = "customers" | "paid" | "jobs" | "growing" | "posted";

export const SWITCH_GROUPS: Array<{ id: SwitchGroup; title: string }> = [
  { id: "customers", title: "Talking to customers" },
  { id: "paid", title: "Getting paid" },
  { id: "jobs", title: "Running jobs" },
  { id: "growing", title: "Growing" },
  { id: "posted", title: "Keeping you posted" },
];

export interface SwitchChoice {
  value: string;
  label: string;
}

export interface SwitchDef {
  key: SwitchKey;
  group: SwitchGroup;
  label: string;
  description: string;
  /** Where the details live (Settings), or null when there's nothing more to set there. */
  customize: string | null;
  /** A second, plain choice shown while the switch is on (texts: on its own / ask me first). */
  choices?: SwitchChoice[];
}

const FRONT_DESK = (focus: string) => `/settings?section=front-desk&focus=${focus}`;

export const SWITCHES: SwitchDef[] = [
  {
    key: "texts",
    group: "customers",
    label: "Answer customer texts",
    description: "Replies to customers by text, answers questions, quotes from your price list and books jobs.",
    customize: FRONT_DESK("texts"),
    choices: [
      { value: "standard", label: "On its own" },
      { value: "ask_first", label: "Ask me first" },
    ],
  },
  {
    key: "calls",
    group: "customers",
    label: "Answer your phone",
    description: "Picks up calls you can't get to. Off means callers get voicemail.",
    customize: FRONT_DESK("call-answering"),
  },
  {
    key: "lead_calls",
    group: "customers",
    label: "Call new leads right away",
    description: "Phones a web lead a few minutes after they ask to be called, to answer questions and book them.",
    customize: null,
  },
  {
    key: "quote_follow_ups",
    group: "paid",
    label: "Follow up on quotes",
    description: "Texts customers who haven't booked a few days after your AI sent them a quote.",
    customize: FRONT_DESK("estimator"),
  },
  {
    key: "chase_invoices",
    group: "paid",
    label: "Chase unpaid invoices",
    description: "Texts customers when an invoice is past due, and tells you who's late. Reminder emails are set in Settings → Invoices.",
    customize: FRONT_DESK("bookkeeper"),
  },
  {
    key: "weather",
    group: "jobs",
    label: "Reschedule for bad weather",
    description: "Checks the forecast for outdoor jobs and offers customers a new time when it looks bad.",
    customize: FRONT_DESK("dispatcher"),
  },
  {
    key: "on_our_way",
    group: "jobs",
    label: "Text customers when you're on the way",
    description: "Lets the customer know when the crew heads out.",
    customize: FRONT_DESK("dispatcher"),
  },
  {
    key: "check_ins",
    group: "jobs",
    label: "Check in after each job",
    description: "Asks customers a few days later if everything went well, and flags any problem to you.",
    customize: FRONT_DESK("customer-care"),
  },
  {
    key: "reviews",
    group: "growing",
    label: "Ask for reviews",
    description: "Asks happy customers for a Google review after the job.",
    customize: "/settings?section=reviews",
  },
  {
    key: "win_back",
    group: "growing",
    label: "Bring back past customers",
    description: "Reaches out to customers you haven't seen in a while with a friendly check-in.",
    customize: FRONT_DESK("marketer"),
  },
  {
    key: "morning_briefing",
    group: "posted",
    label: "Morning briefing",
    description: "A short text each morning: today's jobs and what needs you.",
    customize: FRONT_DESK("office-manager"),
  },
  {
    key: "weekly_report",
    group: "posted",
    label: "Weekly report",
    description: "Every Monday: what your AI handled last week and what it was worth.",
    customize: FRONT_DESK("weekly-report"),
  },
];

/** What the readers need about one company. */
export interface CompanySnapshot {
  aiSettings: AiSettings;
  reviewSettings: unknown;
  salesCallSettings: unknown;
  hasReviewLink: boolean;
  hasAiNumber: boolean;
  /** A verified owner cell (the morning briefing goes there). */
  hasOwnerCell: boolean;
  /** Whether outbound AI calls are in this business's plan and set up (lead calls). */
  leadCalls: "enabled" | "not_in_plan" | "not_set_up";
  /** The trade hints the dispatcher uses to pick weather-sensitive jobs by default. */
  dispatch?: { industryPack?: unknown; hints?: Array<string | null | undefined> };
  /** Active automations that also do a switch's job, by switch (shown so "off" isn't a surprise). */
  automations?: Partial<Record<SwitchKey, string>>;
  org: StaffOrg;
}

export interface SwitchState {
  key: SwitchKey;
  on: boolean;
  /** The current choice, for a switch with choices. */
  choice?: string;
  /** Something missing for it to work, in plain words (it can still be switched on). */
  needs?: string;
  /** An automation that also does this, so switching it off here doesn't stop that one. */
  alsoDoneBy?: string;
}

function asRecord(value: unknown): AiSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as AiSettings) } : {};
}

/** Every switch's current state, through each role's own reader (defaults included). PURE. */
export function readSwitches(s: CompanySnapshot): SwitchState[] {
  const ai = s.aiSettings;
  const sms = readSmsAgentSettings(ai, s.org);
  const textsOn = smsAgentActive(sms);
  const dispatch = readDispatchSettings(ai, { ...s.org, ...(s.dispatch ?? {}) });
  const care = readCustomerCareSettings(ai, s.org);
  const collections = readCollectionsSettings(ai, s.org);
  const needsTexts = textsOn ? undefined : "Works only with “Answer customer texts” on";
  const leadCallsNeeds =
    s.leadCalls === "not_in_plan"
      ? "Part of the Front Desk plan"
      : s.leadCalls === "not_set_up"
        ? "Not set up for your business yet"
        : s.hasAiNumber
          ? undefined
          : "Needs your AI phone number";
  const state: Record<SwitchKey, SwitchState> = {
    texts: { key: "texts", on: textsOn, choice: sms.autonomy === "ask_first" ? "ask_first" : "standard" },
    calls: { key: "calls", on: readCallAnsweringSettings(ai, s.org).mode === "ai" },
    lead_calls: { key: "lead_calls", on: parseSalesCallSettings(s.salesCallSettings).enabled, needs: leadCallsNeeds },
    // Follow-ups are for quotes the AI sent by text, so they need texting on.
    quote_follow_ups: { key: "quote_follow_ups", on: followUpsActive(readEstimatorSettings(ai, s.org)), needs: needsTexts },
    // The Bookkeeper's reminders are texts: off when its reminder texts are.
    chase_invoices: { key: "chase_invoices", on: collections.enabled && collections.textReminders },
    weather: {
      key: "weather",
      on: dispatch.weather.enabled,
      needs:
        dispatch.weather.sensitive === "none" || (Array.isArray(dispatch.weather.sensitive) && dispatch.weather.sensitive.length === 0)
          ? "Choose which jobs depend on the weather (Customize)"
          : undefined,
    },
    on_our_way: { key: "on_our_way", on: dispatch.onOurWay.enabled },
    // Customer care only runs while the texting assistant is on (careWorks).
    check_ins: { key: "check_ins", on: care.enabled && care.checkins.enabled, needs: needsTexts },
    reviews: {
      key: "reviews",
      on: parseReviewSettings(s.reviewSettings).enabled,
      needs: s.hasReviewLink ? undefined : "Add your review link first",
    },
    win_back: { key: "win_back", on: readMarketingSettings(ai, s.org).winBack.enabled },
    morning_briefing: {
      key: "morning_briefing",
      on: readOfficeManagerSettings(ai, s.org).enabled,
      needs: s.hasOwnerCell ? undefined : "Needs your verified cell number (Settings → AI front desk)",
    },
    weekly_report: { key: "weekly_report", on: parseWeeklyReportSettings(toJson(ai) as Json, s.org.doneForYou).enabled },
  };
  for (const [key, name] of Object.entries(s.automations ?? {}) as Array<[SwitchKey, string]>) {
    if (state[key] && name) state[key].alsoDoneBy = name;
  }
  for (const st of Object.values(state)) if (st.needs === undefined) delete st.needs;
  return SWITCH_KEYS.map((k) => state[k]);
}

/**
 * How flipping a switch changes companies.ai_settings, through the role's own merge. Turning on a
 * switch that sits inside a role also turns the role on (quote follow-ups need the estimator,
 * check-ins need customer care); turning it off leaves the rest of the role alone. PURE.
 * Null for the two switches stored in their own columns (reviews, lead calls).
 */
export function aiSettingsMutation(key: SwitchKey, on: boolean, choice?: string): ((current: AiSettings) => AiSettings) | null {
  switch (key) {
    case "texts":
      return (current) => {
        const autonomy: SmsAgentAutonomy | undefined =
          choice === "ask_first" || choice === "standard"
            ? choice
            : on && readSmsAgentSettings(current, { doneForYou: false }).autonomy === "off"
              ? "standard"
              : undefined;
        return mergeSmsAgentSettings(current, { enabled: on, ...(autonomy ? { autonomy } : {}) });
      };
    case "calls":
      return (current) => mergeCallAnsweringSettings(current, { mode: on ? "ai" : "voicemail" });
    case "quote_follow_ups":
      return (current) => mergeEstimatorSettings(current, on ? { enabled: true, followUps: true } : { followUps: false });
    case "chase_invoices":
      return (current) => mergeCollectionsSettings(current, on ? { enabled: true, textReminders: true } : { enabled: false });
    case "weather":
      return (current) => mergeDispatchSettings(current, { weather: { enabled: on } });
    case "on_our_way":
      return (current) => mergeDispatchSettings(current, { onOurWay: { enabled: on } });
    case "check_ins":
      return (current) => mergeCustomerCareSettings(current, on ? { enabled: true, checkins: { enabled: true } } : { checkins: { enabled: false } });
    case "win_back":
      return (current) => mergeMarketingSettings(current, { winBack: { enabled: on } });
    case "morning_briefing":
      return (current) => mergeOfficeManagerSettings(current, { enabled: on });
    case "weekly_report":
      return (current) => asRecord(mergeWeeklyReportSettings(toJson(current) as Json, { enabled: on }));
    case "reviews":
    case "lead_calls":
      return null;
  }
}

type Scope = { organizationId: string; companyId: string };

export interface YourAiView {
  companyId: string;
  persona: { name: string | null; tone: AgentPersona["tone"]; defaultName: string };
  switches: Array<SwitchDef & SwitchState>;
}

/** Automations that also do a switch's job (the switch's "off" doesn't stop them). PURE. */
export function overlappingAutomations(
  flows: Array<{ company_id: string | null; name: string | null; slug: string | null; trigger_event: string | null; definition: unknown }>,
  companyId: string,
): Partial<Record<SwitchKey, string>> {
  const out: Partial<Record<SwitchKey, string>> = {};
  for (const f of flows) {
    if (f.company_id && f.company_id !== companyId) continue;
    const name = f.name?.trim() || f.slug || "An automation";
    if (f.slug === QUOTE_FOLLOW_UP_RECIPE) out.quote_follow_ups ??= name;
    if (f.slug === "review-request") out.reviews ??= name;
    if (f.trigger_event === "booking.en_route" && (f.slug === "crew-on-the-way" || sendsSms(f.definition))) out.on_our_way ??= name;
  }
  return out;
}

async function leadCallsAvailability(admin: AdminClient, organizationId: string): Promise<CompanySnapshot["leadCalls"]> {
  if (!isRetellOutboundActive() || !salesAgentId()) return "not_set_up";
  try {
    return (await hasReceptionistPlan(admin, organizationId)) ? "enabled" : "not_in_plan";
  } catch {
    return "not_in_plan";
  }
}

async function loadSnapshot(admin: AdminClient, scope: Scope): Promise<{ snapshot: CompanySnapshot; persona: AgentPersona } | null> {
  const [{ data: company, error }, { data: org }, { data: number }, { data: flows }] = await Promise.all([
    admin
      .from("companies")
      .select("id, name, industry_pack, ai_settings, review_settings, sales_call_settings, brand_review_url, agent_persona, owner_phone_e164, owner_phone_verified_at")
      .eq("organization_id", scope.organizationId)
      .eq("id", scope.companyId)
      .maybeSingle(),
    admin.from("organizations").select(ORG_STAFF_COLUMNS).eq("id", scope.organizationId).maybeSingle(),
    admin
      .from("voice_numbers")
      .select("phone_e164")
      .eq("organization_id", scope.organizationId)
      .eq("company_id", scope.companyId)
      .eq("provider", "retell")
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    admin.from("workflows").select("company_id, name, slug, trigger_event, definition").eq("organization_id", scope.organizationId).eq("status", "active").limit(500),
  ]);
  if (error) throw error;
  if (!company) return null;
  const row = company as {
    name: string | null;
    industry_pack: unknown;
    ai_settings: Json;
    review_settings: Json;
    sales_call_settings: Json;
    brand_review_url: string | null;
    agent_persona: Json;
    owner_phone_e164: string | null;
    owner_phone_verified_at: string | null;
  };
  const orgRow = org as { platform_brand: string | null } | null;
  return {
    snapshot: {
      aiSettings: asRecord(row.ai_settings),
      reviewSettings: row.review_settings,
      salesCallSettings: row.sales_call_settings,
      hasReviewLink: Boolean(row.brand_review_url?.trim()),
      hasAiNumber: Boolean(number),
      hasOwnerCell: Boolean(row.owner_phone_e164?.trim() && row.owner_phone_verified_at),
      leadCalls: await leadCallsAvailability(admin, scope.organizationId),
      dispatch: { industryPack: row.industry_pack, hints: [row.name] },
      automations: overlappingAutomations((flows ?? []) as Parameters<typeof overlappingAutomations>[0], scope.companyId),
      org: { doneForYou: isDoneForYou(orgRow?.platform_brand), tier: orgTier(org) },
    },
    persona: parsePersona(row.agent_persona),
  };
}

export async function getYourAiView(admin: AdminClient, scope: Scope): Promise<YourAiView | null> {
  const loaded = await loadSnapshot(admin, scope);
  if (!loaded) return null;
  const states = new Map(readSwitches(loaded.snapshot).map((s) => [s.key, s]));
  return {
    companyId: scope.companyId,
    persona: { name: loaded.persona.name, tone: loaded.persona.tone, defaultName: DEFAULT_VOICE_NAME },
    switches: SWITCHES.map((def) => ({ ...def, ...(states.get(def.key) as SwitchState) })),
  };
}

/** Flip one switch (owner/admin). Returns the fresh view; null → no such company. */
export async function setSwitch(admin: AdminClient, scope: Scope, input: { key: SwitchKey; on: boolean; choice?: string }): Promise<YourAiView | null> {
  if (input.key === "reviews") {
    const { data, error } = await admin.from("companies").select("brand_review_url, review_settings").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as { brand_review_url: string | null; review_settings: Json };
    if (input.on && !row.brand_review_url?.trim()) {
      throw new UserFacingError("Add your Google review link first (Customize), then switch this on.");
    }
    const next = { ...asRecord(row.review_settings), enabled: input.on };
    const { error: writeError } = await admin.from("companies").update({ review_settings: toJson(next) as Json }).eq("organization_id", scope.organizationId).eq("id", scope.companyId);
    if (writeError) throw writeError;
  } else if (input.key === "lead_calls") {
    if (input.on) {
      const availability = await leadCallsAvailability(admin, scope.organizationId);
      if (availability === "not_in_plan") throw new UserFacingError("Calling new leads is part of the Front Desk plan.");
      if (availability === "not_set_up") throw new UserFacingError("Calling new leads isn't set up for your business yet.");
    }
    await saveSalesCallSettings(admin, scope, { enabled: input.on });
  } else {
    const mutate = aiSettingsMutation(input.key, input.on, input.choice);
    if (!mutate) throw new UserFacingError("Unknown switch.");
    const written = await updateAiSettings(admin, scope, mutate);
    if (!written) return null;
  }
  return getYourAiView(admin, scope);
}

/** Change the assistant's name and tone; the phone receptionist picks it up straight away. */
export async function setYourAiPersona(admin: AdminClient, scope: Scope, persona: AgentPersona): Promise<YourAiView | null> {
  const loaded = await loadSnapshot(admin, scope);
  if (!loaded) return null;
  const saved = await savePersona(admin, scope, persona);
  if (saved.name !== loaded.persona.name || saved.tone !== loaded.persona.tone) {
    try {
      await resyncReceptionistAgent(admin, scope.companyId);
    } catch (err) {
      console.error("[your-ai] receptionist resync failed (it updates on its next sync):", err instanceof Error ? err.message : err);
    }
  }
  return getYourAiView(admin, scope);
}
