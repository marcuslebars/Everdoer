// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): the public generated-site page (/s/:slug and the pages
// host). No session. The company is resolved FROM THE SLUG ROW ONLY, only status 'published'
// renders, and the page shows only what the site's content snapshot holds plus the company's
// active form key (publishable by design) and its booking link when online booking is on.
// docs/done-for-you.md → "Generated sites".
// ─────────────────────────────────────────────────────────────────────────────
import { isDoneForYou } from "@/lib/product-line";
import { createHash } from "node:crypto";

import type { Tables } from "@/server/db/database.types";
import type { AdminClient } from "@/server/services/done-for-you/purchases";
import { bookingPageUrl } from "@/server/services/scheduling/urls";
import { parseOnlineBookingSettings } from "@/server/services/scheduling/rules";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

import { isValidSlug, parseSiteContent, type SiteContent } from "./site-content";
import { renderSitePage, type SiteRenderOptions } from "./site-render";
import { siteUrl } from "./site-url";
import { appBaseUrlFor } from "@/server/services/platform-brand";

/** Default target of the generated sites' "Powered by Everdoer" link. */
export const DONE_FOR_YOU_SITE_CREDIT_URL = "https://everdoer.com";

/** EVERDOER_SITE_URL [web] overrides the credit link target (the renderer still vets it with safeHref). */
export function siteCreditUrl(): string {
  return process.env.EVERDOER_SITE_URL?.trim() || DONE_FOR_YOU_SITE_CREDIT_URL;
}

export interface RenderedSite {
  html: string;
  etag: string;
}

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY?.trim() || process.env.VITE_TURNSTILE_SITE_KEY?.trim() || null;
}

type RuntimeSite = Pick<Tables<"company_sites">, "organization_id" | "company_id" | "slug"> &
  Partial<Pick<Tables<"company_sites">, "favicon_url" | "custom_domain" | "custom_domain_status">>;

/** The page's public address: the business's own domain once it's live, else ours. PURE. */
export function sitePublicUrl(site: RuntimeSite, brand: SiteContent["facts"]["brand"]): string {
  if (site.custom_domain && site.custom_domain_status === "active") return `https://${site.custom_domain}/`;
  return siteUrl(site.slug, brand);
}

/** Live render inputs for one site's company: active form key + booking link. */
export async function siteRuntime(
  admin: AdminClient,
  site: RuntimeSite,
  content: SiteContent,
  options: { onCustomDomain?: boolean } = {},
): Promise<SiteRenderOptions> {
  const [{ data: keys }, { data: company }] = await Promise.all([
    admin
      .from("public_form_keys")
      .select("public_key, form_type")
      .eq("organization_id", site.organization_id)
      .eq("company_id", site.company_id)
      .eq("active", true)
      .order("created_at", { ascending: true }),
    admin
      .from("companies")
      .select("id, online_booking_settings, quote_public_base_url")
      .eq("organization_id", site.organization_id)
      .eq("id", site.company_id)
      .maybeSingle(),
  ]);
  const keyRows = (keys ?? []) as Array<{ public_key: string; form_type: string }>;
  const formKey = (keyRows.find((k) => k.form_type === "quote") ?? keyRows[0])?.public_key ?? null;
  const companyRow = company as Pick<Tables<"companies">, "id" | "online_booking_settings" | "quote_public_base_url"> | null;
  const bookingUrl = companyRow && parseOnlineBookingSettings(companyRow.online_booking_settings).enabled ? bookingPageUrl(companyRow) : null;
  return {
    url: sitePublicUrl(site, content.facts.brand),
    formKey,
    bookingUrl,
    turnstileSiteKey: turnstileSiteKey(),
    creditUrl: isDoneForYou(content.facts.brand) ? siteCreditUrl() : null,
    faviconUrl: site.favicon_url ?? null,
    embedFormOrigin: options.onCustomDomain ? appBaseUrlFor(content.facts.brand ?? "empirevu") : null,
  };
}

const SITE_COLUMNS = "id, organization_id, company_id, slug, status, content, updated_at, favicon_url, custom_domain, custom_domain_status";
type PublicSiteRow = Pick<
  Tables<"company_sites">,
  "id" | "organization_id" | "company_id" | "slug" | "status" | "content" | "updated_at" | "favicon_url" | "custom_domain" | "custom_domain_status"
>;

async function renderSite(admin: AdminClient, site: PublicSiteRow | null, options: { onCustomDomain?: boolean } = {}): Promise<RenderedSite | null> {
  if (!site || site.status !== "published") return null;
  const content = parseSiteContent(site.content);
  if (!content) return null;
  const runtime = await siteRuntime(admin, site, content, options);
  const html = renderSitePage(content, runtime);
  const etag = `"${createHash("sha1").update(html).digest("base64url").slice(0, 27)}"`;
  return { html, etag };
}

/** The published page for a slug, or null (unknown, draft, unpublished, unreadable content → 404). */
export async function loadPublishedSitePage(slug: string, admin: AdminClient = createSupabaseAdminClient()): Promise<RenderedSite | null> {
  const s = (slug ?? "").trim().toLowerCase();
  if (!isValidSlug(s)) return null;
  const { data, error } = await admin.from("company_sites").select(SITE_COLUMNS).eq("slug", s).maybeSingle();
  if (error) throw new Error(`site read failed: ${error.message}`);
  return renderSite(admin, data as PublicSiteRow | null);
}

/**
 * The published page for a business's own domain (the Host header), or null when the host
 * isn't a connected, live domain (the caller then serves the app as before).
 */
export async function loadPublishedSiteForDomain(host: string | null, admin: AdminClient = createSupabaseAdminClient()): Promise<RenderedSite | null> {
  const h = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!h || h.length > 253) return null;
  const { data, error } = await admin.from("company_sites").select(SITE_COLUMNS).eq("custom_domain", h).eq("custom_domain_status", "active").maybeSingle();
  if (error) throw new Error(`site read failed: ${error.message}`);
  return renderSite(admin, data as PublicSiteRow | null, { onCustomDomain: true });
}
