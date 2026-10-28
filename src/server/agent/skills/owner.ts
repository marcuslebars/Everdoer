/**
 * Reaching the owner in real time from a call, and what the owner told the agent to know.
 *
 *   message_owner  — "can you get Dave to call me about…": texts (and emails) the owner now with
 *                    who's calling, their number and the message. At most 2 per call.
 *   alert_owner    — an emergency: the same, marked URGENT. Once per call.
 *   business_notes — the notes the owner saved about the business ("closed Dec 24 – Jan 2"),
 *                    for answering callers (the texting agent has them in its prompt already).
 *
 * The caller's number is the call's caller ID (trusted), never one the model passes in; a
 * different callback number is added as "callback:" next to it.
 */
import { listNotes } from "@/server/agent/memory";
import type { Tables } from "@/server/db/database.types";
import { normalizePhoneLast10 } from "@/server/services/lead-intake/matching";
import { consumeLimit } from "@/server/services/owner-channel/common";
import { deliverMessage, resolveOwnerContacts } from "@/server/services/workflow-engine/messaging";

import { str, type Skill, type SkillContext } from "./types";

export const MAX_OWNER_MESSAGES_PER_CALL = 2;

function pretty(phone: string | null): string {
  const d = (phone ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone ?? "a private number";
}

/** The owner text for a caller's message. PURE. */
export function ownerMessageBody(input: {
  companyName: string;
  urgent: boolean;
  callerName: string | null;
  callerPhone: string | null;
  callback: string | null;
  message: string;
  where: string | null;
  bestTime: string | null;
}): string {
  const who = `${input.callerName ? `${input.callerName} · ` : ""}${pretty(input.callerPhone)}`;
  const callback = input.callback && normalizePhoneLast10(input.callback) !== normalizePhoneLast10(input.callerPhone) ? ` Callback: ${pretty(input.callback)}.` : "";
  const when = input.bestTime ? ` Best time: ${input.bestTime}.` : "";
  const where = input.where ? ` at ${input.where}` : "";
  return input.urgent
    ? `🚨 URGENT call right now for ${input.companyName}: ${who} — ${input.message}${where}.${callback} Call them back now.`
    : `📞 Caller for ${input.companyName} asked for you: ${who} — "${input.message}"${where}.${callback}${when}`;
}

async function sendToOwner(ctx: SkillContext, input: { urgent: boolean; args: Record<string, unknown> }): Promise<boolean> {
  const { data } = await ctx.admin
    .from("companies")
    .select("id, name, owner_email, owner_phone_e164")
    .eq("organization_id", ctx.scope.organizationId)
    .eq("id", ctx.scope.companyId)
    .maybeSingle();
  const company = data as Pick<Tables<"companies">, "id" | "name" | "owner_email" | "owner_phone_e164"> | null;
  if (!company) return false;
  const context = { organizationId: ctx.scope.organizationId, actorProfileId: null, supabase: ctx.admin };
  const owner = await resolveOwnerContacts(context, company);
  const body = ownerMessageBody({
    companyName: company.name,
    urgent: input.urgent,
    callerName: str(input.args.caller_name, 60) ?? ctx.caller.name,
    callerPhone: ctx.caller.phone,
    callback: str(input.args.callback_number, 30),
    message: str(input.args.message ?? input.args.what, 300) ?? (input.urgent ? "an urgent problem" : "please call them back"),
    where: str(input.args.address, 120),
    bestTime: str(input.args.best_time, 60),
  });
  let sent = false;
  if (owner.phone) {
    sent = (await deliverMessage({ context, channel: "sms", to: owner.phone, body, companyId: company.id, contactId: null, consentContact: null })).status === "sent";
  }
  if (owner.email) {
    const r = await deliverMessage({
      context,
      channel: "email",
      to: owner.email,
      subject: input.urgent ? `🚨 Urgent call for ${company.name}` : `Caller asked for you — ${company.name}`,
      body,
      companyId: company.id,
      contactId: null,
      consentContact: null,
    });
    sent = sent || r.status === "sent";
  }
  return sent;
}

export const messageOwner: Skill = {
  name: "message_owner",
  description:
    "Get a message to the owner RIGHT NOW (by text) while the caller waits — when they ask for the owner or a person, want a callback about something you can't handle, or a transfer didn't connect. Not for emergencies (use alert_owner).",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "What the caller needs, in a sentence." },
      caller_name: { type: "string" },
      callback_number: { type: "string", description: "Only if different from the number they're calling from." },
      best_time: { type: "string", description: "When they'd like the call back, if they said." },
    },
    required: ["message"],
  },
  channels: ["voice"],
  voice: { speakDuring: "Say you're sending the message now.", timeoutMs: 10_000 },
  async run(ctx, input) {
    const key = `voice_owner_msg:${ctx.callId ?? ctx.caller.phone ?? "unknown"}`;
    if (!(await consumeLimit(ctx.admin, key, MAX_OWNER_MESSAGES_PER_CALL, 3_600))) {
      return { ok: true, sent: false, say: "I've already passed your message on — they'll call you back as soon as they can." };
    }
    const sent = await sendToOwner(ctx, { urgent: false, args: input });
    return sent
      ? { ok: true, sent: true, say: "I've sent your message to the owner just now. They'll call you back as soon as they can." }
      : { ok: false, reason: "not_sent", say: "I've noted your message, and the team will get back to you as soon as they can." };
  },
};

export const alertOwner: Skill = {
  name: "alert_owner",
  description: "Alert the owner RIGHT NOW about an emergency while the caller is on the line. Call it once.",
  parameters: {
    type: "object",
    properties: {
      what: { type: "string", description: "What's happening" },
      address: { type: "string", description: "Address or town" },
      caller_name: { type: "string", description: "Caller's name" },
      callback_number: { type: "string", description: "Callback number if different" },
    },
    required: ["what"],
  },
  channels: ["voice"],
  voice: { speakDuring: "Tell the caller you're alerting the team now.", timeoutMs: 8_000 },
  async run(ctx, input) {
    const said = "I've alerted the team — someone will call you right back. If anyone is in danger, please hang up and call 9-1-1.";
    const key = `voice_urgent:${ctx.callId ?? ctx.caller.phone ?? "unknown"}`;
    if (!(await consumeLimit(ctx.admin, key, 1, 3_600))) return { ok: true, alerted: true, say: said };
    const sent = await sendToOwner(ctx, { urgent: true, args: input });
    return sent
      ? { ok: true, alerted: true, say: said }
      : { ok: false, reason: "not_sent", say: "I'm flagging this as urgent for the team right now. If anyone is in danger, please hang up and call 9-1-1." };
  },
};

export const businessNotes: Skill = {
  name: "business_notes",
  description:
    "Notes the owner saved about the business (holiday closures, policies, what to tell callers). Check them when a caller asks something the facts above don't cover. Use them to answer; don't read them out word for word.",
  parameters: { type: "object", properties: {} },
  channels: ["voice"],
  voice: { timeoutMs: 6_000 },
  async run(ctx) {
    const notes = await listNotes(ctx.admin, ctx.scope, { limit: 20 });
    return { ok: true, notes: notes.map((n) => n.body) };
  },
};
