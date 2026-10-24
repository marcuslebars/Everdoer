/**
 * The company facts every Marina prompt is built from — the receptionist (onboarding-provision.ts)
 * and outbound calls (voice.ts → retell/outbound-prompt.ts) read the same thing, so a price
 * the owner changes shows up on both. Services carry their price only when the owner (or their
 * own website) gave one; the prompts tell Marina never to invent one that isn't listed.
 */
import type { Tables } from "@/server/db/database.types";
import { listCatalogItems } from "@/server/services/quotes/catalog-items";
import { bookableService, DEFAULT_ONLINE_BOOKING_SETTINGS } from "@/server/services/scheduling/rules";
import { bookingPageUrl } from "@/server/services/scheduling/urls";
import type { TenantServiceContext } from "@/server/services/shared";

export interface CompanyFacts {
  company: Tables<"companies">;
  companyName: string;
  /** "Shrink wrap — from $18/ft" when priced, else the label. */
  services: string[];
  /** The catalog rows (callers that need service_key / pack logic). */
  items: Tables<"service_catalog_items">[];
  hoursText: string | null;
  serviceArea: string | null;
  bookingUrl: string;
  /** The owner's line, the number Marina can hand out for "a person". */
  transferNumber: string | null;
}

export async function loadCompanyRow(context: TenantServiceContext, companyId: string): Promise<Tables<"companies">> {
  const { data, error } = await context.supabase
    .from("companies")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", companyId)
    .single();
  if (error) throw error;
  return data as Tables<"companies">;
}

/** Hours as one line for a prompt; null when nothing usable is stored. */
export function hoursToText(hours: Tables<"companies">["hours"]): string | null {
  if (!hours || typeof hours !== "object") return null;
  const record = hours as Record<string, unknown>;
  // The wizard stores a freeform summary; honor it directly.
  if (typeof record.summary === "string" && record.summary.trim()) return record.summary.trim();
  if (typeof record.text === "string" && record.text.trim()) return record.text.trim();
  // Google Places style (written by the done-for-you enrichment): ["Monday: 8:00 AM – 5:00 PM", …].
  const weekdayText = record.weekdayText ?? record.weekday_text ?? record.weekdayDescriptions;
  if (Array.isArray(weekdayText)) {
    const lines = weekdayText.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    return lines.length ? lines.join("; ") : null;
  }
  if (Array.isArray(record.periods)) return null;
  const entries = Object.entries(record);
  if (entries.length === 0) return null;
  return entries
    .map(([day, v]) => {
      if (v && typeof v === "object" && "open" in v && "close" in v) {
        const o = (v as { open?: unknown }).open;
        const c = (v as { close?: unknown }).close;
        return `${day} ${String(o ?? "?")}–${String(c ?? "?")}`;
      }
      return `${day} ${String(v)}`;
    })
    .join(", ");
}

export async function loadCompanyFacts(context: TenantServiceContext, companyId: string): Promise<CompanyFacts> {
  const company = await loadCompanyRow(context, companyId);
  const items = await listCatalogItems(context, companyId);
  const services = items.map((i) => {
    const price = bookableService(i, DEFAULT_ONLINE_BOOKING_SETTINGS, false).priceLabel;
    return price ? `${i.label} — ${price}` : i.label;
  });
  return {
    company,
    companyName: company.name,
    services,
    items,
    hoursText: hoursToText(company.hours),
    serviceArea: company.service_area ?? null,
    bookingUrl: bookingPageUrl(company),
    transferNumber: company.owner_phone_e164 ?? null,
  };
}
