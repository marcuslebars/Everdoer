/**
 * The rules every sales call passes before it is dialed (docs/sales-calls.md → "Compliance"):
 *
 *   - Calling hours (CRTC Unsolicited Telecommunications Rules): weekdays 9:00–21:30, weekends
 *     10:00–18:00, in the business's time zone (its customers are local). A call is only started
 *     with at least CALL_END_MARGIN_MIN left in the window.
 *   - Express consent to automated calls to THIS number (call_consents): an AI voice that calls
 *     to sell is treated as an automatic dialing-announcing device, which needs express consent.
 *   - The internal do-not-call list (do_not_call): a "don't call me" is kept 3 years + 14 days.
 *
 * Pure helpers are exported for tests; the DB helpers never trust an id without the scope.
 */
import type { Tables } from "@/server/db/database.types";
import { addDays, localDate, zonedInstant } from "@/server/services/booking-windows";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { normalizePhoneLast10 } from "@/server/services/lead-intake/matching";

type Scope = { organizationId: string; companyId: string };

// ── Calling hours ─────────────────────────────────────────────────────────────

/** Minutes since local midnight. */
export const CALLING_WINDOWS = {
  weekday: { startMin: 9 * 60, endMin: 21 * 60 + 30 },
  weekend: { startMin: 10 * 60, endMin: 18 * 60 },
} as const;

/** Don't start a call this close to the end of the window. */
export const CALL_END_MARGIN_MIN = 15;

function localMinutes(nowMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(nowMs));
  const [h, m] = parts.split(":").map(Number);
  return (h % 24) * 60 + m;
}

function windowFor(day: string): { startMin: number; endMin: number } {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6 ? CALLING_WINDOWS.weekend : CALLING_WINDOWS.weekday;
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Is `nowMs` inside the calling window (with the end margin)? `nextOpenMs` is when calls may start:
 * `nowMs` itself when open, else the next opening. PURE given the time zone.
 */
export function callingWindow(nowMs: number, timeZone: string): { open: boolean; nextOpenMs: number } {
  const today = localDate(new Date(nowMs), timeZone);
  const minutes = localMinutes(nowMs, timeZone);
  const w = windowFor(today);
  if (minutes >= w.startMin && minutes < w.endMin - CALL_END_MARGIN_MIN) return { open: true, nextOpenMs: nowMs };
  const day = minutes < w.startMin ? today : addDays(today, 1);
  const at = zonedInstant(day, hhmm(windowFor(day).startMin), timeZone);
  return { open: false, nextOpenMs: at.getTime() };
}

/** `atMs` if the window is open then, else the next opening. PURE. */
export function nextCallableAt(atMs: number, timeZone: string): number {
  return callingWindow(atMs, timeZone).nextOpenMs;
}

// ── Consent ───────────────────────────────────────────────────────────────────

export type CallConsentRow = Tables<"call_consents">;
export type ConsentSource = "form_optin" | "owner_attested" | "customer_request";

/** The unrevoked consent for this contact's CURRENT number, if any. */
export async function findCallConsent(admin: AdminClient, scope: Scope, contact: { id: string; phone: string | null }): Promise<CallConsentRow | null> {
  const last10 = normalizePhoneLast10(contact.phone);
  if (!last10) return null;
  const { data, error } = await admin
    .from("call_consents")
    .select("*")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("contact_id", contact.id)
    .eq("phone_last10", last10)
    .is("revoked_at", null)
    .order("captured_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as CallConsentRow[])[0] ?? null;
}

/** Record consent (evidence kept verbatim, clipped to 600). Null when the number isn't usable. */
export async function recordCallConsent(
  admin: AdminClient,
  input: { scope: Scope; contactId: string; phone: string | null; source: ConsentSource; evidence: string; sourceRef?: string | null; capturedAt?: string | null },
): Promise<CallConsentRow | null> {
  const last10 = normalizePhoneLast10(input.phone);
  const evidence = input.evidence.replace(/\s+/g, " ").trim().slice(0, 600);
  if (!last10 || !evidence) return null;
  const { data, error } = await admin
    .from("call_consents")
    .insert({
      organization_id: input.scope.organizationId,
      company_id: input.scope.companyId,
      contact_id: input.contactId,
      phone_last10: last10,
      source: input.source,
      evidence,
      source_ref: input.sourceRef ?? null,
      captured_at: input.capturedAt ?? new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CallConsentRow;
}

// ── Do not call ───────────────────────────────────────────────────────────────

/** 3 years + 14 days (CRTC), as the migration's default. */
const DNC_KEEP_MS = (3 * 365 + 1 + 14) * 86_400_000;

export async function isDoNotCall(admin: AdminClient, scope: Scope, phone: string | null, nowMs: number = Date.now()): Promise<boolean> {
  const last10 = normalizePhoneLast10(phone);
  if (!last10) return false;
  const { data, error } = await admin
    .from("do_not_call")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("phone_last10", last10)
    .gt("expires_at", new Date(nowMs).toISOString())
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

/**
 * Put a number on the company's do-not-call list (a repeat request renews it), revoke its call consents and
 * cancel any sales call still waiting for it. Returns false when the number isn't usable.
 */
export async function addDoNotCall(
  admin: AdminClient,
  input: { scope: Scope; phone: string | null; source: "call" | "owner" | "sms_stop"; contactId?: string | null; note?: string | null; nowMs?: number },
): Promise<boolean> {
  const last10 = normalizePhoneLast10(input.phone);
  if (!last10) return false;
  const now = new Date(input.nowMs ?? Date.now()).toISOString();
  const { error } = await admin.from("do_not_call").upsert(
    {
      organization_id: input.scope.organizationId,
      company_id: input.scope.companyId,
      phone_last10: last10,
      contact_id: input.contactId ?? null,
      source: input.source,
      note: input.note ? input.note.slice(0, 300) : null,
      created_at: now,
      // A new request (including one after an old entry expired) restarts the 3 years + 14 days.
      expires_at: new Date(Date.parse(now) + DNC_KEEP_MS).toISOString(),
    },
    { onConflict: "company_id,phone_last10" },
  );
  if (error) throw error;
  await admin
    .from("call_consents")
    .update({ revoked_at: now })
    .eq("organization_id", input.scope.organizationId)
    .eq("company_id", input.scope.companyId)
    .eq("phone_last10", last10)
    .is("revoked_at", null);
  if (input.contactId) {
    await admin
      .from("sales_calls")
      .update({ status: "cancelled", skip_reason: "do_not_call" })
      .eq("organization_id", input.scope.organizationId)
      .eq("company_id", input.scope.companyId)
      .eq("contact_id", input.contactId)
      .eq("status", "scheduled");
  }
  return true;
}
