/**
 * The owner command agent's tools. Each one runs against ONE company — the scope resolved from
 * the owner's phone before the model is called. The model never chooses a company; booking and
 * contact ids it passes are re-checked against that scope (wrong company → "not found").
 * Changes to bookings only PROPOSE (an owner_command approval the owner confirms with "Y").
 */
import { roleOwnerTools } from "@/server/services/staff/registry";
import type { RoleOwnerTool } from "@/server/services/staff/types";
import type Anthropic from "@anthropic-ai/sdk";

import type { Tables } from "@/server/db/database.types";
import { addDays, localDate, zonedInstant } from "@/server/services/booking-windows";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { toPlainText } from "@/server/services/sms-agent/guard";
import { setConversationAi } from "@/server/services/sms-agent/takeover";
import { createApproval, ensureShortCodes, listPendingApprovals } from "./approvals";
import { attachApproval, briefInputSchema, cancelCallRequest, createCallRequest, failureMessage, openCallRequestFor, ownerCallsDailyCap, resolveCallTime, toE164 } from "./calls";
import { consumeLimit, shortWhen } from "./common";
import {
  callCustomerProposal,
  cancelProposal,
  newConfirmation,
  OWNER_COMMAND_KIND,
  pauseAllTexts,
  rescheduleProposal,
  resumeAllTexts,
  setBusinessAi,
  textCustomerProposal,
  type OwnerCommandPayload,
} from "./owner-commands";
import { contactName, findScopedBooking, findScopedContact, openTimesForBooking, type CompanyScope } from "./schedule";
import { formatNanp } from "@/server/services/dfy/intake";
import { requireReceptionistMinutes } from "@/server/services/voice/minutes";
import { addNote, forgetNote, listNotes } from "@/server/agent/memory";
import { findCallConsent, isDoNotCall, nextCallableAt } from "@/server/services/sales-calls/compliance";
import { salesCallProposal } from "@/server/services/sales-calls/owner-request";
import { cancelSalesCall, openSalesCallFor } from "@/server/services/sales-calls/queue";
import { loadSalesCallSettings, saveSalesCallSettings } from "@/server/services/sales-calls/settings";

export interface ToolRunState {
  admin: AdminClient;
  scope: CompanyScope;
  ownerPhone: string;
  nowMs: number;
  /** Set when a tool created a confirmation the owner must answer with its 4-digit code. */
  confirmation: Tables<"owner_approvals"> | null;
  /** The code for `confirmation` (only ever sent back to the phone that texted). */
  confirmationCode?: string | null;
  actions: Array<{ tool: string; ok: boolean; detail?: Record<string, unknown> }>;
  /** The AI staff owner tools for this company (staff/registry.ts activeRolesFor); unset → all roles'. */
  roleOwnerTools?: RoleOwnerTool[];
  /** Marina can place calls for this owner (Retell outbound on + the plan has marina_reception). */
  callsEnabled?: boolean;
  /** Sales calls are set up too (callsEnabled + the shared sales agent, docs/sales-calls.md). */
  salesCallsEnabled?: boolean;
  /** Earlier confirmations this run's proposal replaced (same action, same booking / customer). */
  superseded?: number;
}

const CONFIRM_MINUTES = 30;
/** text_customer: the whole message is echoed to the owner for confirmation, so keep it short. */
const MAX_OWNER_TEXT = 300;

/** Every destructive command waits for "Reply 4821 to confirm" (owner-commands.ts). */
async function proposeConfirmation(state: ToolRunState, contactId: string | null, proposal: { summary: string; payload: OwnerCommandPayload }) {
  const confirm = newConfirmation();
  state.confirmation = await createApproval(state.admin, {
    organizationId: state.scope.organizationId,
    companyId: state.scope.companyId,
    contactId,
    kind: OWNER_COMMAND_KIND,
    summary: proposal.summary,
    payload: { ...proposal.payload, confirmSalt: confirm.salt, confirmHash: confirm.hash, confirmAttempts: 0 },
    requestedBy: "owner_command",
    expiresInMinutes: CONFIRM_MINUTES,
    notifiedTo: state.ownerPhone,
  });
  state.confirmationCode = confirm.code;
  state.superseded = (state.superseded ?? 0) + (await supersedeEarlier(state, proposal.payload, state.confirmation.id));
}

/** The booking / customer a proposal is about (what "the same thing again" means). PURE. */
export function proposalTarget(payload: Partial<OwnerCommandPayload> | Record<string, unknown>): string | null {
  const p = payload as Record<string, unknown>;
  if (p.action === "reschedule" || p.action === "cancel") return typeof p.bookingId === "string" ? `booking:${p.bookingId}` : null;
  if (p.action === "text_customer") return typeof p.contactId === "string" ? `text:${p.contactId}` : null;
  return null; // calls: one open call per customer (cancel_customer_call), never superseded here
}

/**
 * "Actually make it 4pm": a new proposal for the same booking (move/cancel) or the same customer
 * (text) replaces the confirmation still waiting for this owner, so only the latest code works.
 * Returns how many were replaced. Never throws (a failure leaves both waiting).
 */
async function supersedeEarlier(state: ToolRunState, payload: OwnerCommandPayload, keepId: string): Promise<number> {
  const target = proposalTarget(payload);
  if (!target) return 0;
  try {
    const { data } = await state.admin
      .from("owner_approvals")
      .select("id, payload")
      .eq("organization_id", state.scope.organizationId)
      .eq("company_id", state.scope.companyId)
      .eq("kind", OWNER_COMMAND_KIND)
      .eq("status", "pending")
      .eq("notified_to", state.ownerPhone)
      .limit(20);
    const ids = ((data ?? []) as Array<{ id: string; payload: Record<string, unknown> }>)
      .filter((r) => r.id !== keepId && proposalTarget(r.payload ?? {}) === target)
      .map((r) => r.id);
    if (ids.length === 0) return 0;
    const { data: done } = await state.admin
      .from("owner_approvals")
      .update({ status: "superseded", decided_at: new Date(state.nowMs).toISOString(), decided_via: "sms", decided_by: state.ownerPhone, result: { superseded_by: keepId } })
      .in("id", ids)
      .eq("status", "pending")
      .select("id");
    return ((done ?? []) as unknown[]).length;
  } catch (err) {
    console.error("[owner-channel] superseding an earlier confirmation failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

export const OWNER_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "list_bookings",
    description: "List this business's bookings (not cancelled) for a day or range, with customer names and times.",
    input_schema: {
      type: "object",
      properties: {
        when: { type: "string", enum: ["today", "tomorrow", "this_week", "next_week", "date"] },
        date: { type: "string", description: "YYYY-MM-DD when `when` is 'date'." },
      },
      required: ["when"],
    },
  },
  {
    name: "waiting_on_me",
    description: "What's waiting on the owner: open approvals (with their reply codes), conversations the AI handed over, and customer texts with no reply yet.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_customer",
    description: "Look up customers by name or phone. Returns ids, phone, and their next booking.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "find_open_times",
    description: "Open times on the calendar (for moving a booking). Optionally for one booking (its length) and/or one date.",
    input_schema: {
      type: "object",
      properties: { booking_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } },
    },
  },
  {
    name: "propose_reschedule",
    description:
      "Ask the owner to confirm moving a booking to an open time. Nothing changes until they reply with the confirmation code. Give the local date and either the local time (HH:MM, 24h) or the booking window key.",
    input_schema: {
      type: "object",
      properties: {
        booking_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD (local)" },
        time: { type: "string", description: "HH:MM 24h local" },
        window_key: { type: "string" },
      },
      required: ["booking_id", "date"],
    },
  },
  {
    name: "propose_cancel",
    description: "Ask the owner to confirm cancelling a booking. Nothing changes until they reply with the confirmation code.",
    input_schema: { type: "object", properties: { booking_id: { type: "string" } }, required: ["booking_id"] },
  },
  {
    name: "text_customer",
    description:
      "Text a customer from the business's number on the owner's behalf, with the owner's message (lightly tidied, same meaning, under 300 characters). The owner is shown the exact message and must confirm with a code before it goes; the AI then stays out of that conversation.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" }, message: { type: "string" } },
      required: ["contact_id", "message"],
    },
  },
  {
    name: "set_ai_for_customer",
    description: "Turn the AI texting assistant on or off for one customer.",
    input_schema: { type: "object", properties: { contact_id: { type: "string" }, on: { type: "boolean" } }, required: ["contact_id", "on"] },
  },
  {
    name: "set_ai_for_business",
    description: "Turn the AI texting assistant on or off for the whole business.",
    input_schema: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] },
  },
  {
    name: "pause_all_texts",
    description: "Pause everything that texts customers: the AI assistant and automations that send texts.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "resume_all_texts",
    description: "Undo pause_all_texts.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "remember",
    description:
      "Save a note the owner asked you to keep: about one customer (give contact_id) or the business (no contact_id). One fact per note, in plain words (\"Prefers mornings; gate code is with the neighbour\", \"Closed Dec 24 - Jan 2\"). Used later by you and by the customer texting assistant.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string", description: "The fact, under 500 characters." }, contact_id: { type: "string" } },
      required: ["note"],
    },
  },
  {
    name: "list_notes",
    description: "The notes saved about one customer (contact_id) or, without contact_id, about the business. Newest first, with note ids.",
    input_schema: { type: "object", properties: { contact_id: { type: "string" } } },
  },
  {
    name: "forget_note",
    description: "Forget (archive) one saved note by its note_id (from list_notes).",
    input_schema: { type: "object", properties: { note_id: { type: "string" } }, required: ["note_id"] },
  },
];

/** Tools that place calls (docs/owner-call-requests.md); listed only when ToolRunState.callsEnabled. */
export const CALL_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "call_customer",
    description:
      "Have Marina phone a customer on the owner's behalf: say the owner's message and, optionally, get one question answered. The owner is shown exactly what will be said and must confirm with a code; nothing is dialed until then. Put the owner's message in purpose (their words, tidied, same meaning) and one question in ask_for only if they asked one. Use when='now' only if the owner said now / right away; otherwise leave when blank unless they gave a time.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        purpose: { type: "string", description: "What to tell them, in the owner's words." },
        ask_for: { type: "string", description: "The one question to get answered (optional)." },
        when: { type: "string", description: "'now', or YYYY-MM-DD HH:MM local, or blank for the next calling hours." },
        if_voicemail: { type: "string", enum: ["leave_message", "hang_up"] },
      },
      required: ["contact_id", "purpose"],
    },
  },
  {
    name: "cancel_customer_call",
    description: "Cancel a call to a customer that is waiting for confirmation or scheduled for later. Nothing to confirm; a call already in progress can't be cancelled.",
    input_schema: { type: "object", properties: { contact_id: { type: "string" } }, required: ["contact_id"] },
  },
];

/** Sales calls (docs/sales-calls.md); listed only when ToolRunState.salesCallsEnabled. */
export const SALES_CALL_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "sales_call",
    description:
      "Have the AI call a customer to sell: answer their questions, recommend a service, quote from the price list and book. Use when the owner says to call a lead/customer to follow up, close, quote or book them (not for passing on a specific message - that's call_customer). The customer must have agreed to automated calls; set customer_asked=true ONLY if the owner says the customer asked to be called. The owner confirms with a code.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        focus: { type: "string", description: "What the call should focus on, in the owner's words (optional, max 200 chars)." },
        customer_asked: { type: "boolean", description: "True only if the owner says the customer asked to be called." },
        when: { type: "string", description: "'now', or YYYY-MM-DD HH:MM local, or blank for the next calling hours." },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "cancel_sales_call",
    description: "Cancel a sales call that's waiting to be placed for a customer.",
    input_schema: { type: "object", properties: { contact_id: { type: "string" } }, required: ["contact_id"] },
  },
  {
    name: "lead_call_settings",
    description:
      "Turn automatic new-lead calls on or off, or change them: the AI calls web leads who ticked 'you can call me' this many minutes after they enquire, with this many tries. Leave out what the owner didn't mention. Applied right away.",
    input_schema: {
      type: "object",
      properties: {
        on: { type: "boolean" },
        delay_minutes: { type: "integer", minimum: 1, maximum: 1440 },
        attempts: { type: "integer", minimum: 1, maximum: 3 },
      },
    },
  },
];

export function ownerToolsFor(state: Pick<ToolRunState, "callsEnabled" | "salesCallsEnabled">): Anthropic.Messages.Tool[] {
  if (!state.callsEnabled) return OWNER_TOOLS;
  return state.salesCallsEnabled ? [...OWNER_TOOLS, ...CALL_TOOLS, ...SALES_CALL_TOOLS] : [...OWNER_TOOLS, ...CALL_TOOLS];
}

type Input = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rangeFor(when: string, date: string | null, scope: CompanyScope, nowMs: number): { from: string; to: string } | null {
  const today = localDate(new Date(nowMs), scope.timeZone);
  let start = today;
  let days = 1;
  if (when === "tomorrow") start = addDays(today, 1);
  else if (when === "this_week") days = 7;
  else if (when === "next_week") {
    start = addDays(today, 7);
    days = 7;
  } else if (when === "date") {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    start = date;
  }
  return {
    from: zonedInstant(start, "00:00", scope.timeZone).toISOString(),
    to: zonedInstant(addDays(start, days), "00:00", scope.timeZone).toISOString(),
  };
}

async function namesFor(state: ToolRunState, ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map();
  const { data } = await state.admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("organization_id", state.scope.organizationId)
    .eq("company_id", state.scope.companyId)
    .in("id", unique);
  return new Map(((data ?? []) as Array<Pick<Tables<"contacts">, "id" | "first_name" | "last_name">>).map((c) => [c.id, contactName(c)]));
}

async function listBookingsTool(state: ToolRunState, input: Input) {
  const range = rangeFor(str(input.when) ?? "today", str(input.date), state.scope, state.nowMs);
  if (!range) return { error: "Give a date as YYYY-MM-DD." };
  const { data, error } = await state.admin
    .from("bookings")
    .select("id, contact_id, title, scheduled_for, duration_minutes, status, location")
    .eq("organization_id", state.scope.organizationId)
    .eq("company_id", state.scope.companyId)
    .neq("status", "cancelled")
    .gte("scheduled_for", range.from)
    .lt("scheduled_for", range.to)
    .order("scheduled_for", { ascending: true })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as Array<Pick<Tables<"bookings">, "id" | "contact_id" | "title" | "scheduled_for" | "duration_minutes" | "status" | "location">>;
  const names = await namesFor(state, rows.map((r) => r.contact_id));
  return {
    bookings: rows.map((r) => ({
      booking_id: r.id,
      when: shortWhen(r.scheduled_for, state.scope.timeZone),
      customer: r.contact_id ? names.get(r.contact_id) ?? "Unknown" : null,
      job: r.title,
      status: r.status,
      location: r.location,
    })),
  };
}

async function waitingOnMeTool(state: ToolRunState) {
  const { scope, admin } = state;
  await ensureShortCodes(admin, scope.companyId);
  const approvals = (await listPendingApprovals(admin, [scope.companyId])).filter((a) => a.organization_id === scope.organizationId);
  const { data: handoffs } = await admin
    .from("sms_conversations")
    .select("contact_id, summary, last_inbound_at, state")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("state", "owner")
    .order("last_inbound_at", { ascending: false })
    .limit(10);
  const { data: unanswered } = await admin
    .from("ui_inbox_v")
    .select("contact_id, contact_name, snippet, last_inbound_at")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("needs_reply", true)
    .order("last_inbound_at", { ascending: false })
    .limit(10);
  const handoffRows = (handoffs ?? []) as Array<{ contact_id: string; summary: string | null; last_inbound_at: string | null }>;
  const names = await namesFor(state, handoffRows.map((h) => h.contact_id));
  return {
    approvals: approvals.map((a) => ({ reply_code: a.short_code, summary: a.summary, expires: a.expires_at ? shortWhen(a.expires_at, scope.timeZone) : null })),
    handed_to_you: handoffRows.map((h) => ({ contact_id: h.contact_id, customer: names.get(h.contact_id) ?? "Unknown", summary: h.summary })),
    unanswered_texts: ((unanswered ?? []) as Array<{ contact_id: string | null; contact_name: string | null; snippet: string | null; last_inbound_at: string | null }>).map((u) => ({
      contact_id: u.contact_id,
      customer: u.contact_name,
      last_message: u.snippet,
      at: u.last_inbound_at ? shortWhen(u.last_inbound_at, scope.timeZone) : null,
    })),
  };
}

async function findCustomerTool(state: ToolRunState, input: Input) {
  const q = str(input.query);
  if (!q) return { error: "Who should I look up?" };
  const { scope, admin } = state;
  const digits = q.replace(/\D/g, "");
  let query = admin
    .from("contacts")
    .select("id, first_name, last_name, phone")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId);
  query = digits.length >= 7 ? query.like("phone_last10", `%${digits.slice(-10)}%`) : query.ilike("search_text", `%${q.toLowerCase().replace(/[%_,()]/g, " ").trim()}%`);
  const { data, error } = await query.limit(5);
  if (error) throw error;
  const contacts = (data ?? []) as Array<Pick<Tables<"contacts">, "id" | "first_name" | "last_name" | "phone">>;
  const ids = contacts.map((c) => c.id);
  const next = new Map<string, { booking_id: string; when: string; job: string }>();
  if (ids.length > 0) {
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, contact_id, title, scheduled_for")
      .eq("organization_id", scope.organizationId)
      .eq("company_id", scope.companyId)
      .in("contact_id", ids)
      .neq("status", "cancelled")
      .gte("scheduled_for", new Date(state.nowMs - 12 * 3_600_000).toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(20);
    for (const b of (bookings ?? []) as Array<Pick<Tables<"bookings">, "id" | "contact_id" | "title" | "scheduled_for">>) {
      if (b.contact_id && !next.has(b.contact_id)) next.set(b.contact_id, { booking_id: b.id, when: shortWhen(b.scheduled_for, scope.timeZone), job: b.title });
    }
  }
  return { customers: contacts.map((c) => ({ contact_id: c.id, name: contactName(c), phone: c.phone, next_booking: next.get(c.id) ?? null })) };
}

async function findOpenTimesTool(state: ToolRunState, input: Input) {
  const bookingId = str(input.booking_id);
  const booking = bookingId ? await findScopedBooking(state.admin, state.scope, bookingId) : null;
  if (bookingId && !booking) return { error: "No such booking for this business." };
  const date = str(input.date);
  const open = await openTimesForBooking(state.admin, state.scope, booking, state.nowMs);
  const picked = (date ? open.filter((t) => t.day === date) : open).slice(0, 8);
  return { open_times: picked.map((t) => ({ date: t.day, time: localHhmm(t.startsAt, state.scope.timeZone), window_key: t.windowKey, label: `${t.dayLabel}, ${t.label}` })) };
}

function localHhmm(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

async function proposeRescheduleTool(state: ToolRunState, input: Input) {
  const booking = await findScopedBooking(state.admin, state.scope, input.booking_id);
  if (!booking || booking.status === "cancelled") return { error: "No such booking for this business." };
  const date = str(input.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Give the new date as YYYY-MM-DD." };
  const time = str(input.time);
  const windowKey = str(input.window_key);
  const open = await openTimesForBooking(state.admin, state.scope, booking, state.nowMs);
  const onDay = open.filter((t) => t.day === date);
  const slot = onDay.find((t) => (windowKey ? t.windowKey === windowKey : time ? localHhmm(t.startsAt, state.scope.timeZone) === time.padStart(5, "0") : onDay.length === 1));
  if (!slot) {
    const alternatives = (onDay.length > 0 ? onDay : open).slice(0, 4).map((t) => `${t.dayLabel}, ${t.label}`);
    return { ok: false, reason: "That time isn't open.", open_alternatives: alternatives };
  }
  const contact = booking.contact_id ? await findScopedContact(state.admin, state.scope, booking.contact_id) : null;
  const proposal = rescheduleProposal(booking, contactName(contact), { startsAt: slot.startsAt, windowKey: slot.windowKey }, state.scope.timeZone);
  await proposeConfirmation(state, booking.contact_id, proposal);
  return { ok: true, asked_owner: proposal.summary };
}

async function proposeCancelTool(state: ToolRunState, input: Input) {
  const booking = await findScopedBooking(state.admin, state.scope, input.booking_id);
  if (!booking || booking.status === "cancelled") return { error: "No such booking for this business." };
  const contact = booking.contact_id ? await findScopedContact(state.admin, state.scope, booking.contact_id) : null;
  const proposal = cancelProposal(booking, contactName(contact), state.scope.timeZone);
  await proposeConfirmation(state, booking.contact_id, proposal);
  return { ok: true, asked_owner: proposal.summary };
}

async function textCustomerTool(state: ToolRunState, input: Input) {
  const contact = await findScopedContact(state.admin, state.scope, input.contact_id);
  if (!contact) return { error: "No such customer for this business." };
  const raw = str(input.message);
  if (!raw) return { error: "What should I say?" };
  if (!contact.phone) return { ok: false, reason: `${contactName(contact)} has no phone number on file.` };
  if (contact.sms_opt_out_at) return { ok: false, reason: `${contactName(contact)} has opted out of texts.` };
  const message = toPlainText(raw).replace(/\s+/g, " ").trim();
  if (message.length > MAX_OWNER_TEXT) return { error: `That's ${message.length} characters - keep it under ${MAX_OWNER_TEXT} (the owner confirms it word for word).` };
  // Nothing goes out yet: the owner sees the exact message and confirms with a code.
  await proposeConfirmation(state, contact.id, textCustomerProposal(contact.id, contactName(contact), message));
  return { ok: true, asked_owner: "Confirmation sent; nothing is sent to the customer until the owner confirms." };
}

async function callCustomerTool(state: ToolRunState, input: Input) {
  if (!state.callsEnabled) return { error: "Calling customers isn't available for this business." };
  const contact = await findScopedContact(state.admin, state.scope, input.contact_id);
  if (!contact) return { error: "No such customer for this business." };
  const who = contactName(contact);
  if (!contact.phone) return { ok: false, reason: `${who} has no phone number on file.` };
  const phone = toE164(contact.phone);
  if (!phone) return { ok: false, reason: `${who}'s number on file isn't a callable phone number.` };

  const parsed = briefInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Tell me what Marina should say." };
  const when = resolveCallTime(parsed.data.when, state.nowMs, state.scope.timeZone);
  if ("error" in when) return { error: when.error };

  const open = await openCallRequestFor(state.admin, state.scope, contact.id);
  if (open) return { ok: false, reason: `A call to ${who} is already ${open.status === "scheduled" ? "scheduled" : "waiting"}. Say "cancel the call to ${who.split(" ")[0]}" first.` };
  // Plan + this month's minutes, checked now so the owner isn't asked to confirm a call that
  // can't be placed (checked again at placement).
  try {
    await requireReceptionistMinutes(state.admin, state.scope.organizationId);
  } catch (err) {
    return { ok: false, reason: `The call can't be placed - ${failureMessage(err)}.` };
  }

  const brief = { purpose: parsed.data.purpose, askFor: parsed.data.ask_for, ifVoicemail: parsed.data.if_voicemail ?? ("leave_message" as const), who };
  const request = await createCallRequest(state.admin, { scope: state.scope, contactId: contact.id, brief, runAtMs: when.runAtMs, ownerPhone: state.ownerPhone });
  if (request === "already_open") return { ok: false, reason: `A call to ${who} is already waiting. Say "cancel the call to ${who.split(" ")[0]}" first.` };
  // The daily cap counts proposals that got this far (a refused one is cancelled, not counted twice).
  const day = localDate(new Date(state.nowMs), state.scope.timeZone);
  if (!(await consumeLimit(state.admin, `owner_calls:${state.scope.companyId}:${day}`, ownerCallsDailyCap(), 86_400))) {
    await cancelCallRequest(state.admin, request.id);
    return { ok: false, reason: "That's the daily limit on calls I can place for this business - try again tomorrow." };
  }

  // Nothing is dialed yet: the owner sees exactly what Marina will say and confirms with a code.
  const proposal = callCustomerProposal(request, who, formatNanp(phone), brief, when.label);
  await proposeConfirmation(state, contact.id, proposal);
  if (state.confirmation) await attachApproval(state.admin, request.id, state.confirmation.id);
  return { ok: true, asked_owner: "Confirmation sent; nothing is dialed until the owner confirms." };
}

async function cancelCustomerCallTool(state: ToolRunState, input: Input) {
  const contact = await findScopedContact(state.admin, state.scope, input.contact_id);
  if (!contact) return { error: "No such customer for this business." };
  const who = contactName(contact);
  const open = await openCallRequestFor(state.admin, state.scope, contact.id);
  if (!open) return { ok: false, reason: `No call to ${who} is waiting or scheduled.` };
  if (open.status === "dialing") return { ok: false, reason: `The call to ${who} is already being placed.` };
  const cancelled = await cancelCallRequest(state.admin, open.id);
  if (!cancelled) return { ok: false, reason: `The call to ${who} was already handled.` };
  if (open.approval_id) {
    // The confirmation it was waiting on no longer applies.
    await state.admin.from("owner_approvals").update({ status: "rejected", decided_at: new Date(state.nowMs).toISOString(), decided_via: "sms", decided_by: state.ownerPhone }).eq("id", open.approval_id).eq("status", "pending");
  }
  return { ok: true, cancelled: who };
}

// ── Sales calls (docs/sales-calls.md) ─────────────────────────────────────────

async function salesCallTool(state: ToolRunState, input: Input) {
  if (!state.salesCallsEnabled) return { error: "Sales calls aren't available for this business." };
  const contact = await findScopedContact(state.admin, state.scope, input.contact_id);
  if (!contact) return { error: "No such customer for this business." };
  const who = contactName(contact);
  const phone = contact.phone ? toE164(contact.phone) : null;
  if (!phone) return { ok: false, reason: `${who} has no callable phone number on file.` };
  if (await isDoNotCall(state.admin, state.scope, phone, state.nowMs)) return { ok: false, reason: `${who} is on the do-not-call list.` };
  const customerAsked = input.customer_asked === true;
  if (!customerAsked && !(await findCallConsent(state.admin, state.scope, contact))) {
    return {
      ok: false,
      reason: `${who} hasn't agreed to automated calls. Only if they asked to be called can the owner say so (then propose again with customer_asked). Otherwise offer to text them, or the owner can call them personally.`,
    };
  }
  if (await openSalesCallFor(state.admin, state.scope, contact.id)) return { ok: false, reason: `A sales call to ${who} is already lined up. Say "cancel the sales call to ${who.split(" ")[0]}" first.` };
  try {
    await requireReceptionistMinutes(state.admin, state.scope.organizationId);
  } catch (err) {
    return { ok: false, reason: `The call can't be placed - ${failureMessage(err)}.` };
  }
  const when = resolveCallTime(str(input.when), state.nowMs, state.scope.timeZone);
  if ("error" in when) return { error: when.error };
  const focus = str(input.focus) ? toPlainText(str(input.focus) as string).replace(/\s+/g, " ").slice(0, 200) : null;
  const runAtMs = nextCallableAt(when.runAtMs, state.scope.timeZone);
  const whenLabel = runAtMs <= state.nowMs ? "now" : shortWhen(new Date(runAtMs).toISOString(), state.scope.timeZone);
  const proposal = salesCallProposal({ who, phone: formatNanp(phone), focus, customerAsked, whenLabel });
  await proposeConfirmation(state, contact.id, {
    summary: proposal.summary,
    payload: { ...proposal.payload, contactId: contact.id, runAtMs: when.immediate ? null : runAtMs, ownerPhone: state.ownerPhone },
  });
  return { ok: true, asked_owner: "Confirmation sent; nothing is dialed until the owner confirms." };
}

async function cancelSalesCallTool(state: ToolRunState, input: Input) {
  const contact = await findScopedContact(state.admin, state.scope, input.contact_id);
  if (!contact) return { error: "No such customer for this business." };
  const who = contactName(contact);
  const open = await openSalesCallFor(state.admin, state.scope, contact.id);
  if (!open) return { ok: false, reason: `No sales call to ${who} is waiting.` };
  if (open.status !== "scheduled") return { ok: false, reason: `The call to ${who} is already under way.` };
  if (!(await cancelSalesCall(state.admin, open.id))) return { ok: false, reason: `The call to ${who} was already handled.` };
  return { ok: true, cancelled: who };
}

async function leadCallSettingsTool(state: ToolRunState, input: Input) {
  if (!state.salesCallsEnabled) return { error: "Sales calls aren't available for this business." };
  const patch = {
    ...(typeof input.on === "boolean" ? { enabled: input.on } : {}),
    ...(typeof input.delay_minutes === "number" ? { delayMinutes: input.delay_minutes } : {}),
    ...(typeof input.attempts === "number" ? { maxAttempts: input.attempts } : {}),
  };
  if (Object.keys(patch).length === 0) {
    const current = await loadSalesCallSettings(state.admin, state.scope);
    return { ok: true, lead_calls: current.enabled ? "on" : "off", delay_minutes: current.delayMinutes, attempts: current.maxAttempts };
  }
  const next = await saveSalesCallSettings(state.admin, state.scope, patch);
  return {
    ok: true,
    lead_calls: next.enabled ? "on" : "off",
    delay_minutes: next.delayMinutes,
    attempts: next.maxAttempts,
    note: "Only leads who tick the automated call-back box on the website form are called, and only during calling hours (weekdays 9-9:30, weekends 10-6).",
  };
}

async function setAiForCustomerTool(state: ToolRunState, input: Input) {
  const contact = await findScopedContact(state.admin, state.scope, input.contact_id);
  if (!contact) return { error: "No such customer for this business." };
  const on = input.on === true;
  await setConversationAi(state.admin, { companyId: state.scope.companyId, contactId: contact.id, on });
  return { ok: true, customer: contactName(contact), ai: on ? "on" : "off" };
}

// ── Memory (agent/memory.ts) ──────────────────────────────────────────────────

async function rememberTool(state: ToolRunState, input: Input) {
  const contactId = str(input.contact_id);
  const contact = contactId ? await findScopedContact(state.admin, state.scope, contactId) : null;
  if (contactId && !contact) return { error: "No such customer for this business." };
  const saved = await addNote(state.admin, state.scope, { contactId: contact?.id ?? null, body: input.note, source: "owner_sms", createdBy: state.ownerPhone });
  if (!saved.ok || !saved.note) return { ok: false, reason: saved.reason ?? "Couldn't save that." };
  return { ok: true, saved: saved.note.body, about: contact ? contactName(contact) : "the business", note_id: saved.note.id };
}

async function listNotesTool(state: ToolRunState, input: Input) {
  const contactId = str(input.contact_id);
  const contact = contactId ? await findScopedContact(state.admin, state.scope, contactId) : null;
  if (contactId && !contact) return { error: "No such customer for this business." };
  const notes = await listNotes(state.admin, state.scope, { contactId: contact?.id, limit: 20 });
  return {
    about: contact ? contactName(contact) : "the business",
    notes: notes.map((n) => ({ note_id: n.id, note: n.body, saved: shortWhen(n.createdAt, state.scope.timeZone) })),
  };
}

async function forgetNoteTool(state: ToolRunState, input: Input) {
  const ok = await forgetNote(state.admin, state.scope, input.note_id, state.nowMs);
  return ok ? { ok: true } : { ok: false, reason: "No such note (check list_notes)." };
}

/** Run one tool call. Returns a JSON-able result for the model (never throws). */
export async function runOwnerTool(state: ToolRunState, name: string, input: Input): Promise<Record<string, unknown>> {
  try {
    let result: Record<string, unknown>;
    switch (name) {
      case "list_bookings":
        result = await listBookingsTool(state, input);
        break;
      case "waiting_on_me":
        result = await waitingOnMeTool(state);
        break;
      case "find_customer":
        result = await findCustomerTool(state, input);
        break;
      case "find_open_times":
        result = await findOpenTimesTool(state, input);
        break;
      case "propose_reschedule":
        result = await proposeRescheduleTool(state, input);
        break;
      case "propose_cancel":
        result = await proposeCancelTool(state, input);
        break;
      case "text_customer":
        result = await textCustomerTool(state, input);
        break;
      case "call_customer":
        result = await callCustomerTool(state, input);
        break;
      case "cancel_customer_call":
        result = await cancelCustomerCallTool(state, input);
        break;
      case "sales_call":
        result = await salesCallTool(state, input);
        break;
      case "cancel_sales_call":
        result = await cancelSalesCallTool(state, input);
        break;
      case "lead_call_settings":
        result = await leadCallSettingsTool(state, input);
        break;
      case "set_ai_for_customer":
        result = await setAiForCustomerTool(state, input);
        break;
      case "set_ai_for_business":
        await setBusinessAi(state.admin, state.scope, input.on === true);
        result = { ok: true, ai: input.on === true ? "on" : "off" };
        break;
      case "pause_all_texts":
        result = { ok: true, ...(await pauseAllTexts(state.admin, state.scope)) };
        break;
      case "resume_all_texts":
        result = { ok: true, ...(await resumeAllTexts(state.admin, state.scope)) };
        break;
      case "remember":
        result = await rememberTool(state, input);
        break;
      case "list_notes":
        result = await listNotesTool(state, input);
        break;
      case "forget_note":
        result = await forgetNoteTool(state, input);
        break;
      default: {
        const roleTool = (state.roleOwnerTools ?? roleOwnerTools()).find((t) => t.tool.name === name);
        result = roleTool ? await roleTool.run(state, input) : { error: `Unknown tool ${name}.` };
      }
    }
    state.actions.push({ tool: name, ok: !("error" in result) && result.ok !== false });
    return result;
  } catch (err) {
    console.error(`[owner-channel] tool ${name} failed:`, err instanceof Error ? err.message : err);
    state.actions.push({ tool: name, ok: false });
    return { error: "That didn't work on our side." };
  }
}
