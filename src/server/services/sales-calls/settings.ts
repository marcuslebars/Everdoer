/**
 * Per-company sales-call settings (companies.sales_call_settings, docs/sales-calls.md). Off by
 * default: a business turns speed-to-lead calls on, by text ("turn on lead calls") or in the app.
 * Every value is clamped, so a hand-edited row can't make the AI call every minute.
 */
import type { Json } from "@/server/db/database.types";
import { toJson } from "@/server/db/json";
import type { AdminClient } from "@/server/services/front-desk/contracts";

export interface SalesCallSettings {
  /** Speed-to-lead: call a consenting web lead automatically. Owner-requested calls don't need it. */
  enabled: boolean;
  /** Minutes after the enquiry before the first call (inside calling hours). */
  delayMinutes: number;
  /** Attempts per lead (a no-answer / voicemail tries again, up to this many in total). */
  maxAttempts: number;
  /** Minutes between attempts. */
  retryMinutes: number;
  /** Sales calls per company per local day. */
  dailyCap: number;
  voicemail: "leave_message" | "hang_up";
}

export const DEFAULT_SALES_CALL_SETTINGS: SalesCallSettings = {
  enabled: false,
  delayMinutes: 5,
  maxAttempts: 2,
  retryMinutes: 120,
  dailyCap: 40,
  voicemail: "leave_message",
};

export const SALES_CALL_LIMITS = {
  delayMinutes: { min: 1, max: 1440 },
  maxAttempts: { min: 1, max: 3 },
  retryMinutes: { min: 30, max: 1440 },
  dailyCap: { min: 1, max: 200 },
} as const;

function clampInt(value: unknown, range: { min: number; max: number }, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

/** Any stored value → valid settings (unknown keys dropped, numbers clamped). PURE. */
export function parseSalesCallSettings(raw: unknown): SalesCallSettings {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SALES_CALL_SETTINGS;
  return {
    enabled: r.enabled === true,
    delayMinutes: clampInt(r.delayMinutes, SALES_CALL_LIMITS.delayMinutes, d.delayMinutes),
    maxAttempts: clampInt(r.maxAttempts, SALES_CALL_LIMITS.maxAttempts, d.maxAttempts),
    retryMinutes: clampInt(r.retryMinutes, SALES_CALL_LIMITS.retryMinutes, d.retryMinutes),
    dailyCap: clampInt(r.dailyCap, SALES_CALL_LIMITS.dailyCap, d.dailyCap),
    voicemail: r.voicemail === "hang_up" ? "hang_up" : "leave_message",
  };
}

export interface SalesCallSettingsPatch {
  enabled?: boolean;
  delayMinutes?: number;
  maxAttempts?: number;
  retryMinutes?: number;
  dailyCap?: number;
  voicemail?: "leave_message" | "hang_up";
}

/** settings + patch → settings (clamped). PURE. */
export function applySalesCallPatch(current: SalesCallSettings, patch: SalesCallSettingsPatch): SalesCallSettings {
  return parseSalesCallSettings({ ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) });
}

type Scope = { organizationId: string; companyId: string };

export async function loadSalesCallSettings(admin: AdminClient, scope: Scope): Promise<SalesCallSettings> {
  const { data, error } = await admin
    .from("companies")
    .select("sales_call_settings")
    .eq("organization_id", scope.organizationId)
    .eq("id", scope.companyId)
    .maybeSingle();
  if (error) throw error;
  return parseSalesCallSettings((data as { sales_call_settings: Json } | null)?.sales_call_settings ?? null);
}

export async function saveSalesCallSettings(admin: AdminClient, scope: Scope, patch: SalesCallSettingsPatch): Promise<SalesCallSettings> {
  const next = applySalesCallPatch(await loadSalesCallSettings(admin, scope), patch);
  const { error } = await admin
    .from("companies")
    .update({ sales_call_settings: toJson(next) as Json })
    .eq("organization_id", scope.organizationId)
    .eq("id", scope.companyId);
  if (error) throw error;
  return next;
}
