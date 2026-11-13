// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): the owner line runs from the Twilio voice webhook, the
// Retell inbound webhook and Retell function calls — none has a user session. The TENANT is the
// company whose number was CALLED; the caller is treated as its owner only when caller ID equals
// that company's VERIFIED owner cell (companies.owner_phone_verified_at). Both are carried to
// Retell in the call's metadata with an HMAC token, re-verified on every function call. Caller
// ID alone never unlocks business data or actions: see "Who is really calling" below.
// docs/owner-line.md.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The owner line: when the OWNER calls their own business number, they get their assistant —
 * not the receptionist. It answers anything (general knowledge, advice, current information via
 * web_lookup) and, through the `business` tool, does everything the owner can do by text
 * (owner-channel/agent.ts: today's schedule, who's waiting, look up a customer, move or cancel
 * a booking, text or call a customer, turn the AI on or off, remember a note).
 *
 * One shared Retell agent (voice/owner-agent.ts) whose prompt is the `{{system_prompt}}`
 * passthrough; each call carries its own prompt, built here from the company's facts.
 *
 * Who is really calling. Caller ID can be forged, so:
 *   • general questions and web lookups need nothing more — they expose nothing;
 *   • the `business` tool needs a VERIFIED caller: the carrier vouched for the number
 *     (Twilio StirVerstat "TN-Validation-Passed-A"), or the caller read back a six-digit code
 *     we texted to the owner's verified cell during this call;
 *   • changes (move, cancel, text or call a customer) are still confirmed by a code texted to
 *     that cell, exactly as they are by text. Nothing is changed from the call alone.
 *
 * Off unless RETELL_OWNER_AGENT_ID is set AND the company's organization is listed in
 * OWNER_LINE_ORG_IDS ("*" = every organization). With it off, no call does any extra work.
 */
import crypto from "node:crypto";

import { recordTurn } from "@/server/agent/memory";
import { toneLine, voiceName } from "@/server/agent/profile";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { normalizePhoneLast10 } from "@/server/services/lead-intake/matching";
import { runOwnerCommandAgent } from "@/server/services/owner-channel/agent";
import { consumeLimit, findOwnerCompanies, sendOwnerSms, type OwnerCompany } from "@/server/services/owner-channel/common";
import { getRetellConfig } from "@/server/services/retell/config";
import type { RetellFunctionRequest } from "@/server/services/retell/functions";
import { resolveRetellTenant } from "@/server/services/retell/tenant";
import { loadBusinessFacts, type BusinessFacts } from "@/server/services/sms-agent/facts";
import { factSheet } from "@/server/services/sms-agent/prompt";
import { resolveCatcherTenant } from "@/server/services/twilio/missed-call";
import { getAiAnswerConfig, registerRetellCall, retellSipUri, type FetchLike } from "@/server/services/voice/ai-answer";
import {
  buildOwnerLineMetadata,
  carrierVerified,
  isOwnerLineClaims,
  readOwnerLineMetadata,
  spokenDigits,
  unlockCode,
  type OwnerLineClaims,
} from "@/server/services/voice/owner-line-token";
import { ownerWebLookup } from "@/server/services/voice/owner-web-lookup";

export * from "@/server/services/voice/owner-line-token";

/** Shares the owner's text-command budget (owner-channel/entry.ts OWNER_AI_PER_HOUR). */
const OWNER_AI_PER_HOUR = 20;
const WEB_LOOKUPS_PER_HOUR = 30;
/**
 * Code checks per call, right or wrong (the code rides along on every business request once
 * read out). Caps a guesser at 40 tries in a million; an owner never gets near it.
 */
const UNLOCK_CHECKS_PER_CALL = 40;
const TWILIO_CALL_SID = /^CA[0-9a-f]{32}$/i;
/** How long a customer's call may wait on "is this the owner?" before it is treated as a no. */
const OWNER_CHECK_BUDGET_MS = 1500;

// ── Configuration ─────────────────────────────────────────────────────────────

export interface OwnerLineConfig {
  /** Everything needed is set; with this false no call does any owner-line work. */
  enabled: boolean;
  agentId: string | null;
  apiKey: string | null;
  tokenSecret: string | null;
  /** Organizations it is switched on for ("all" = OWNER_LINE_ORG_IDS=*). */
  orgIds: ReadonlySet<string> | "all";
  /** OWNER_LINE_TRUST_CALLER_ID=1: treat a matching caller ID as verified (a pilot's own risk). */
  trustCallerId: boolean;
  sipDomain: string;
  ringTimeoutSeconds: number;
  registerTimeoutMs: number;
  maxCallSeconds: number;
}

export function getOwnerLineConfig(env: Record<string, string | undefined> = process.env): OwnerLineConfig {
  const answer = getAiAnswerConfig();
  const agentId = env.RETELL_OWNER_AGENT_ID?.trim() || null;
  const listed = (env.OWNER_LINE_ORG_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const orgIds: OwnerLineConfig["orgIds"] = listed.includes("*") ? "all" : new Set(listed);
  const minutes = Number.parseInt(env.OWNER_LINE_MAX_CALL_MINUTES ?? "", 10);
  return {
    enabled: Boolean(answer.enabled && agentId && answer.apiKey && answer.tokenSecret && (orgIds === "all" || orgIds.size > 0)),
    agentId,
    apiKey: answer.apiKey,
    tokenSecret: answer.tokenSecret,
    orgIds,
    trustCallerId: env.OWNER_LINE_TRUST_CALLER_ID === "1",
    sipDomain: answer.sipDomain,
    ringTimeoutSeconds: answer.ringTimeoutSeconds,
    registerTimeoutMs: answer.registerTimeoutMs,
    maxCallSeconds: (Number.isFinite(minutes) ? Math.min(60, Math.max(2, minutes)) : 20) * 60,
  };
}

export function ownerLineAllowed(config: Pick<OwnerLineConfig, "orgIds">, organizationId: string): boolean {
  return config.orgIds === "all" || config.orgIds.has(organizationId);
}

// ── The prompt ────────────────────────────────────────────────────────────────

export interface OwnerLinePromptInput {
  facts: BusinessFacts;
  now: Date;
  /** Business tools are open from the start of the call. */
  callerVerified: boolean;
}

/** What the assistant says first. PURE. */
export function ownerLineOpening(facts: Pick<BusinessFacts, "ownerFirstName" | "persona">): string {
  const name = voiceName(facts.persona);
  return facts.ownerFirstName ? `Hi ${facts.ownerFirstName}, it's ${name}. What do you need?` : `Hi, it's ${name}. What do you need?`;
}

/** The per-call system prompt for the owner's own assistant. PURE. */
export function buildOwnerLinePrompt(input: OwnerLinePromptInput): string {
  const { facts } = input;
  const name = voiceName(facts.persona);
  const owner = facts.ownerFirstName ?? "the owner";
  const localNow = input.now.toLocaleString("en-CA", { timeZone: facts.timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  return [
    `You are ${name}, the AI assistant of ${owner === "the owner" ? "the owner" : owner}, who owns ${facts.businessName}. ${owner === "the owner" ? "The owner" : owner} is calling you from their own phone. This is NOT a customer call: you are talking to your boss.`,
    `It is ${localNow} (${facts.timeZone}).`,
    `Open with exactly: "${ownerLineOpening(facts)}"`,
    "",
    "What you are for:",
    "- Anything they ask. General knowledge, how things work, advice, a second opinion, maths, wording for a message, business and pricing strategy, brainstorming, planning. Answer from what you know, the way a sharp, well-read colleague would. You are not limited to this business.",
    "- Their business. Questions about it and things they want done in it.",
    "",
    "How to talk:",
    `- ${toneLine(facts.persona) ?? "Be warm, direct and concise."} This is a phone call: speak in plain sentences, no lists, no markdown, no reading out links or symbols.`,
    "- Lead with the answer. One to three sentences unless they ask for detail, then go as deep as they want and check in now and then.",
    "- If a question is unclear, ask one short question instead of guessing.",
    "- Be honest about what you don't know. For medical, legal or tax questions give your best understanding and say plainly when a professional should confirm it.",
    "- If asked, say honestly that you are an AI assistant.",
    "",
    "Your tools:",
    "- web_lookup: for anything current or that may have changed (news, weather, prices, another business's hours, sports, events, rules, product details) and whenever you are not sure of a fact. Don't guess at current facts; look them up. Say you're checking, then give the answer in a sentence or two.",
    "- business: for anything about THIS business's own records or anything they want done: today's or any day's jobs, who is waiting on them, looking up a customer, open times, moving or cancelling a booking, texting or calling a customer, turning the AI on or off, pausing texts, remembering a note. Pass their request in their own words in `request`, including names and times exactly as said. Read back what it returns.",
    "- A change is never done from this call alone: the business tool texts a code to their phone and they confirm by texting it back. Say that; never say something was changed unless the tool says so.",
    input.callerVerified
      ? "- The business tool is ready to use on this call."
      : "- The first time you use the business tool on this call it texts a six-digit security code to their phone. Ask them to read it out, then call the tool again with the same request and the digits in `unlock_code`. Keep passing that code on later business requests in this call.",
    "- end_call: when they say goodbye or they're done.",
    "",
    "Quick answers about the business can come straight from these facts (prices are before HST). For anything about specific customers, bookings or money owed, use the business tool; never invent a customer, a booking, a time or an amount.",
    "",
    "Business facts:",
    factSheet(facts),
  ].join("\n");
}

/** The per-call variables for the shared owner agent (strings only). PURE. */
export function buildOwnerLineVariables(input: OwnerLinePromptInput): Record<string, string> {
  return {
    system_prompt: buildOwnerLinePrompt(input),
    company_name: input.facts.businessName,
    owner_name: input.facts.ownerFirstName ?? "",
  };
}

// ── Recognising the owner ─────────────────────────────────────────────────────

export interface OwnerLineDeps {
  config?: OwnerLineConfig;
  now?: Date;
  fetchImpl?: FetchLike;
  findOwnerCompanies?: typeof findOwnerCompanies;
  loadFacts?: (admin: AdminClient, companyId: string) => Promise<BusinessFacts>;
}

/** The dialled company, if the caller owns it and the owner line is switched on for it. PURE. */
export function ownedDialledCompany(candidates: OwnerCompany[], config: Pick<OwnerLineConfig, "orgIds">, dialled: { organizationId: string; companyId: string }): OwnerCompany | null {
  if (!ownerLineAllowed(config, dialled.organizationId)) return null;
  return candidates.find((c) => c.organizationId === dialled.organizationId && c.companyId === dialled.companyId) ?? null;
}

export type OwnerLineStart = { kind: "none" } | { kind: "owner"; sipUri: string; ringTimeoutSeconds: number; timeLimitSeconds: number };

/**
 * A call to a company's own Twilio number (the missed-call catcher). If the caller is that
 * company's verified owner and the owner line is on for them, register the call with the owner
 * agent and return the SIP URI to dial. Anything else — off, not the owner, any failure — is
 * { kind: "none" } and the call carries on exactly as before. Never throws.
 */
export async function startOwnerLineFromTwilio(
  admin: AdminClient,
  input: { from: string | null; to: string | null; callSid: string; stirVerstat?: string | null },
  deps: OwnerLineDeps = {},
): Promise<OwnerLineStart> {
  const config = deps.config ?? getOwnerLineConfig();
  if (!config.enabled || !config.agentId || !config.tokenSecret || !input.from || !input.to) return { kind: "none" };
  try {
    // Cheapest check first: almost every caller is a customer, and this is one indexed lookup.
    // It runs before the missed call is stored, so it gets a short budget: a slow lookup means
    // "not the owner" and the call is stored and answered as usual.
    const candidates = await Promise.race([
      (deps.findOwnerCompanies ?? findOwnerCompanies)(admin, input.from),
      new Promise<OwnerCompany[]>((resolve) => setTimeout(() => resolve([]), OWNER_CHECK_BUDGET_MS)),
    ]);
    if (candidates.length === 0) return { kind: "none" };
    const tenant = await resolveCatcherTenant(admin as Parameters<typeof resolveCatcherTenant>[0], input.to);
    if (!tenant) return { kind: "none" };
    const company = ownedDialledCompany(candidates, config, tenant);
    if (!company) return { kind: "none" };

    const now = deps.now ?? new Date();
    const facts = await (deps.loadFacts ?? loadBusinessFacts)(admin, company.companyId);
    const callerVerified = carrierVerified(input.stirVerstat) || config.trustCallerId;
    const claims: OwnerLineClaims = { organizationId: company.organizationId, companyId: company.companyId, callRef: input.callSid, callerVerified, issuedAt: Math.floor(now.getTime() / 1000) };
    const callId = await registerRetellCall(
      {
        agentId: config.agentId,
        fromNumber: input.from,
        toNumber: input.to,
        metadata: buildOwnerLineMetadata(claims, config.tokenSecret),
        dynamicVariables: buildOwnerLineVariables({ facts, now, callerVerified }),
      },
      config,
      deps.fetchImpl,
    );
    // PII discipline: no names or numbers in the log line.
    console.log(`[owner-line] owner call registered (${callerVerified ? "caller verified" : "caller unverified"})`);
    return { kind: "owner", sipUri: retellSipUri(callId, config.sipDomain), ringTimeoutSeconds: config.ringTimeoutSeconds, timeLimitSeconds: config.maxCallSeconds };
  } catch (err) {
    console.error("[owner-line] could not start (falling back to the normal call path):", err instanceof Error ? err.message : err);
    return { kind: "none" };
  }
}

export interface OwnerLineInboundOverride {
  override_agent_id: string;
  dynamic_variables: Record<string, string>;
  metadata: Record<string, string>;
}

/**
 * A call to a company's dedicated Retell number (Retell's inbound webhook). Same rule as
 * above; the answer is the per-call override Retell applies. There is no carrier attestation
 * on this path, so the caller starts unverified (the business tool texts a code) unless the
 * pilot override is on. Null = not an owner call; carry on as before. Never throws.
 */
export async function ownerLineForRetellInbound(
  admin: AdminClient,
  input: { from: string | null; to: string | null; agentId: string | null; callId: string | null },
  deps: OwnerLineDeps = {},
): Promise<OwnerLineInboundOverride | null> {
  const config = deps.config ?? getOwnerLineConfig();
  if (!config.enabled || !config.agentId || !config.tokenSecret || !input.from || !input.callId) return null;
  try {
    const candidates = await (deps.findOwnerCompanies ?? findOwnerCompanies)(admin, input.from);
    if (candidates.length === 0) return null;
    const tenant = await resolveRetellTenant(admin as Parameters<typeof resolveRetellTenant>[0], { toNumber: input.to, agentId: input.agentId, legacySourceSite: getRetellConfig().sourceSite });
    // Never the legacy env guess: the company must be the one actually dialled.
    if (!tenant.organizationId || !tenant.companyId || tenant.resolvedBy === "legacy") return null;
    const company = ownedDialledCompany(candidates, config, { organizationId: tenant.organizationId, companyId: tenant.companyId });
    if (!company) return null;

    const now = deps.now ?? new Date();
    const facts = await (deps.loadFacts ?? loadBusinessFacts)(admin, company.companyId);
    const callerVerified = config.trustCallerId;
    const claims: OwnerLineClaims = { organizationId: company.organizationId, companyId: company.companyId, callRef: input.callId, callerVerified, issuedAt: Math.floor(now.getTime() / 1000) };
    console.log(`[owner-line] owner call on a Retell number (${callerVerified ? "caller verified" : "caller unverified"})`);
    return {
      override_agent_id: config.agentId,
      dynamic_variables: buildOwnerLineVariables({ facts, now, callerVerified }),
      metadata: buildOwnerLineMetadata(claims, config.tokenSecret),
    };
  } catch (err) {
    console.error("[owner-line] inbound check failed (answering as a normal call):", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── The tools ─────────────────────────────────────────────────────────────────

export interface OwnerLineToolResult {
  ok: boolean;
  /** What the assistant should say (Retell hands the whole body to the model). */
  say: string;
  reason?: string;
}

export const SAY_OWNER_LINE_UNAVAILABLE = "I can't reach the business records on this call. Text me instead and I'll sort it out.";

export interface OwnerLineToolDeps {
  config?: OwnerLineConfig;
  nowMs?: number;
  findOwnerCompanies?: typeof findOwnerCompanies;
  runAgent?: typeof runOwnerCommandAgent;
  sendSms?: typeof sendOwnerSms;
  consume?: typeof consumeLimit;
  webLookup?: typeof ownerWebLookup;
  loadFacts?: (admin: AdminClient, companyId: string) => Promise<BusinessFacts>;
}

function readCallObject(raw: unknown): Record<string, unknown> {
  const call = raw && typeof raw === "object" ? (raw as Record<string, unknown>).call : undefined;
  return call && typeof call === "object" ? (call as Record<string, unknown>) : {};
}

/** Text a confirmation prompt the way the owner channel would, minus the "Reply …" already in it. */
function spokenConfirmation(sent: boolean): string {
  return sent
    ? "I've texted you the details with a code. Text that code back to confirm. Nothing changes until you do."
    : "I set that up but couldn't text you the confirmation code, so nothing was changed. Try asking me again in a minute.";
}

/**
 * Run a tool call from the owner agent. The company comes ONLY from the call's signed metadata
 * and the caller must still be that company's verified owner number; the model's arguments
 * never choose either. Never throws; always returns something to say.
 */
export async function runOwnerLineTool(admin: AdminClient, req: RetellFunctionRequest<Record<string, unknown>>, deps: OwnerLineToolDeps = {}): Promise<OwnerLineToolResult> {
  const config = deps.config ?? getOwnerLineConfig();
  const nowMs = deps.nowMs ?? Date.now();
  const consume = deps.consume ?? consumeLimit;
  try {
    const call = readCallObject(req.raw);
    const claims = readOwnerLineMetadata(call.metadata, config.tokenSecret, nowMs);
    if (!config.enabled || !config.tokenSecret || !isOwnerLineClaims(claims) || !ownerLineAllowed(config, claims.organizationId)) {
      return { ok: false, reason: "unsupported", say: SAY_OWNER_LINE_UNAVAILABLE };
    }
    // A call on a Retell number is bound to Retell's own call id (a Twilio call to its CallSid,
    // which Retell never sees — its token and the owner-number check below cover it).
    if (!TWILIO_CALL_SID.test(claims.callRef) && claims.callRef !== req.call.callId) {
      return { ok: false, reason: "unsupported", say: SAY_OWNER_LINE_UNAVAILABLE };
    }
    // Still the owner: the number may have been changed or un-verified since the call began.
    const owned = req.call.fromNumber ? await (deps.findOwnerCompanies ?? findOwnerCompanies)(admin, req.call.fromNumber) : [];
    const company = owned.find((c) => c.organizationId === claims.organizationId && c.companyId === claims.companyId);
    if (!company) return { ok: false, reason: "not_owner", say: SAY_OWNER_LINE_UNAVAILABLE };
    const last10 = normalizePhoneLast10(company.ownerPhone) ?? company.ownerPhone;

    if (req.name === "web_lookup") {
      const question = typeof req.args.question === "string" ? req.args.question.trim().slice(0, 600) : "";
      if (!question) return { ok: false, reason: "invalid", say: "What should I look up?" };
      if (!(await consume(admin, `owner_line_web:${last10}`, WEB_LOOKUPS_PER_HOUR, 3600))) {
        return { ok: false, reason: "rate_limited", say: "I've done a lot of lookups in the last hour. Give me a few minutes." };
      }
      const facts = await (deps.loadFacts ?? loadBusinessFacts)(admin, company.companyId).catch(() => null);
      return await (deps.webLookup ?? ownerWebLookup)({
        question,
        organizationId: company.organizationId,
        companyId: company.companyId,
        timeZone: company.timeZone,
        near: facts?.serviceArea ?? facts?.businessAddress ?? null,
        nowMs,
      });
    }

    if (req.name !== "business") return { ok: false, reason: "unsupported", say: "I can't do that from here." };

    const request = typeof req.args.request === "string" ? req.args.request.trim().slice(0, 1000) : "";
    if (!request) return { ok: false, reason: "invalid", say: "Tell me what you want done." };

    // Who is really calling: an unverified caller reads back the code texted to the owner's cell.
    if (!claims.callerVerified) {
      const given = spokenDigits(req.args.unlock_code);
      if (!given) {
        const first = await consume(admin, `owner_line_code:${claims.callRef}`, 1, 3600);
        if (first) {
          const sent = await (deps.sendSms ?? sendOwnerSms)(admin, {
            to: company.ownerPhone,
            body: `Your code for this call is ${unlockCode(claims, config.tokenSecret)}. Only say it if you're the one on the phone with your assistant.`,
            organizationId: company.organizationId,
            companyId: company.companyId,
            platformBrand: company.platformBrand,
          });
          if (sent.status !== "sent") return { ok: false, reason: "locked", say: "I need to check it's really you, but I couldn't text your phone a code. Text me your request instead." };
        }
        return { ok: false, reason: "locked", say: `For security, I've ${first ? "just " : "already "}texted a six-digit code to your phone. Read it to me and I'll carry on.` };
      }
      if (!(await consume(admin, `owner_line_unlock:${claims.callRef}`, UNLOCK_CHECKS_PER_CALL, 3600))) {
        return { ok: false, reason: "locked", say: "That's too many tries on this call. Text me your request instead." };
      }
      const expected = Buffer.from(unlockCode(claims, config.tokenSecret));
      const got = Buffer.from(given);
      if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
        return { ok: false, reason: "locked", say: "That code doesn't match the one I texted. Check the text and read it once more." };
      }
    }

    if (!(await consume(admin, `owner_ai:${last10}`, OWNER_AI_PER_HOUR, 3600))) {
      return { ok: false, reason: "rate_limited", say: "That's a lot at once. Give me a few minutes and ask again." };
    }
    const agent = await (deps.runAgent ?? runOwnerCommandAgent)({
      admin,
      scope: { organizationId: company.organizationId, companyId: company.companyId, companyName: company.name, timeZone: company.timeZone },
      ownerPhone: company.ownerPhone,
      body: request,
      nowMs,
    });

    let say = agent.reply;
    if (agent.confirmationId) {
      // The code that confirms a change goes to the owner's phone, never down the call.
      const sent = await (deps.sendSms ?? sendOwnerSms)(admin, {
        to: company.ownerPhone,
        body: agent.reply,
        organizationId: company.organizationId,
        companyId: company.companyId,
        platformBrand: company.platformBrand,
      });
      say = spokenConfirmation(sent.status === "sent");
    }
    // One memory for calls and texts: a later text can say "actually make it 4" about this call.
    await recordTurn(admin, {
      organizationId: company.organizationId,
      companyId: company.companyId,
      channel: "owner_sms",
      threadKey: company.ownerPhone,
      userText: request,
      reply: agent.reply,
      intent: agent.confirmationId ? "command_confirm" : "command",
      actions: agent.memoryActions,
      sourceRef: null,
      atMs: nowMs,
    });
    return { ok: true, say };
  } catch (err) {
    console.error("[owner-line] tool failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "error", say: "Sorry, I couldn't do that just now. Try again in a minute, or text me." };
  }
}
