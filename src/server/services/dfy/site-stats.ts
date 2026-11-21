// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): counting visits, call taps and quote requests on a
// published generated site. No session (the visitor's browser sends a beacon). The site is
// resolved from its public slug (or, for quotes, from the form key's company) and only
// site_stats_bump is called. Nothing about the visitor is stored: no IP, cookie, user agent or
// URL — only the site's own page path, the day and a traffic-source bucket.
// docs/done-for-you.md → "Generated sites" → "Site stats".
// ─────────────────────────────────────────────────────────────────────────────
import type { Tables } from "@/server/db/database.types";
import type { AdminClient } from "@/server/services/done-for-you/purchases";
import type { TenantServiceContext } from "@/server/services/shared";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

import { isValidSlug, parseSiteContent } from "./site-content";
import { findSitePage } from "./site-pages";
import { pagesBaseUrl } from "./site-url";

export const SITE_TRAFFIC_SOURCES = ["google", "bing", "facebook", "instagram", "ads", "direct", "other", "unknown"] as const;
export type SiteTrafficSource = (typeof SITE_TRAFFIC_SOURCES)[number];

export const SITE_SOURCE_LABELS: Record<SiteTrafficSource, string> = {
  google: "Google",
  bing: "Bing",
  facebook: "Facebook",
  instagram: "Instagram",
  ads: "Ads",
  direct: "Typed in or saved link",
  other: "Other websites",
  unknown: "Not known",
};

export type SiteHitKind = "view" | "call";

const FALLBACK_TIMEZONE = "America/Toronto";

/** The calendar day in the business's time zone ("2026-11-21"). PURE. */
export function siteLocalDay(now: Date, timeZone: string | null | undefined): string {
  const zone = timeZone?.trim() || FALLBACK_TIMEZONE;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: FALLBACK_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Where a visit came from, in buckets an owner understands. Paid clicks (an ad click id, or a
 * utm_medium like cpc/paid/ads) are "ads"; then utm_source; then the landing referrer's host.
 * A referrer from the site itself, or none, is "direct". PURE.
 */
export function siteTrafficSource(input: { referrer?: string | null; utmSource?: string | null; utmMedium?: string | null; adClick?: boolean; ownHosts?: string[] }): SiteTrafficSource {
  const medium = (input.utmMedium ?? "").toLowerCase();
  if (input.adClick || /^(cpc|ppc|paid|paidsocial|paid_social|paid-social|ads?|display|cpm)$/.test(medium)) return "ads";
  const fromName = (name: string): SiteTrafficSource | null => {
    if (/(^|\.)google\./.test(name) || name === "google") return "google";
    if (/(^|\.)bing\.com$/.test(name) || name === "bing") return "bing";
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(name) || name === "facebook" || name === "fb") return "facebook";
    if (/(^|\.)instagram\.com$/.test(name) || name === "instagram" || name === "ig") return "instagram";
    return null;
  };
  const utm = (input.utmSource ?? "").trim().toLowerCase();
  if (utm) return fromName(utm) ?? "other";
  const host = hostOf(input.referrer);
  if (!host) return "direct";
  if ((input.ownHosts ?? []).some((h) => h.replace(/^www\./, "") === host)) return "direct";
  return fromName(host) ?? "other";
}

/** Crawlers and link previewers (they'd inflate visits). PURE. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|go-http|headless|lighthouse|pingdom|uptime/i.test(ua);
}

type SiteRow = Pick<Tables<"company_sites">, "id" | "organization_id" | "company_id" | "slug" | "status" | "content" | "custom_domain" | "custom_domain_status">;

async function companyTimezone(admin: AdminClient, site: SiteRow): Promise<string | null> {
  const { data } = await admin.from("companies").select("timezone").eq("id", site.company_id).eq("organization_id", site.organization_id).maybeSingle();
  return (data as { timezone?: string | null } | null)?.timezone ?? null;
}

async function bump(admin: AdminClient, site: SiteRow, path: string, source: SiteTrafficSource, counts: { views?: number; calls?: number; quotes?: number }, now: Date) {
  const { error } = await admin.rpc("site_stats_bump", {
    p_site: site.id,
    p_day: siteLocalDay(now, await companyTimezone(admin, site)),
    p_path: path,
    p_source: source,
    p_views: counts.views ?? 0,
    p_calls: counts.calls ?? 0,
    p_quotes: counts.quotes ?? 0,
  });
  if (error) throw new Error(`site stats write failed: ${error.message}`);
}

const SITE_COLUMNS = "id, organization_id, company_id, slug, status, content, custom_domain, custom_domain_status";

/** The site's own host names (ours and the business's domain), for "came from the site itself". */
function siteHosts(site: SiteRow): string[] {
  return [hostOf(pagesBaseUrl()), site.custom_domain_status === "active" ? site.custom_domain : null].filter((h): h is string => Boolean(h));
}

export interface SiteHitInput {
  slug: string;
  /** "" for the home page, else a page path. */
  path: string;
  kind: SiteHitKind;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  adClick?: boolean;
}

/**
 * Count a visit or a call tap from the page's beacon. Ignored (false) unless the slug is a
 * published site and the path is its home page or one of its pages.
 */
export async function recordSiteHit(input: SiteHitInput, admin: AdminClient = createSupabaseAdminClient(), now: Date = new Date()): Promise<boolean> {
  const slug = input.slug.trim().toLowerCase();
  if (!isValidSlug(slug)) return false;
  const { data, error } = await admin.from("company_sites").select(SITE_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`site read failed: ${error.message}`);
  const site = data as SiteRow | null;
  if (!site || site.status !== "published") return false;
  const content = parseSiteContent(site.content);
  if (!content) return false;
  const path = input.path.trim().toLowerCase();
  if (path && !findSitePage(content, path)) return false;
  const source = siteTrafficSource({ ...input, ownHosts: siteHosts(site) });
  await bump(admin, site, path, source, input.kind === "call" ? { calls: 1 } : { views: 1 }, now);
  return true;
}

/**
 * Which of a company's site pages a quote request came from, from the page URL the form reports
 * (the parent page when embedded on the business's domain). Null when it wasn't the site. PURE.
 */
export function sitePathFromPageUrl(site: Pick<SiteRow, "slug" | "custom_domain" | "custom_domain_status">, pageUrl: string | null | undefined): string | null {
  if (!pageUrl) return null;
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  const pick = (rest: string[]): string | null => (rest.length === 0 ? "" : rest.length === 1 && /^[a-z0-9-]{1,64}$/.test(rest[0]) ? rest[0] : null);
  if (site.custom_domain && site.custom_domain_status === "active" && host === site.custom_domain.toLowerCase()) return pick(segments);
  // Ours: /<slug>[/<page>] on the pages host, or /s/<slug>[/<page>] on the app.
  if (segments[0] === site.slug) return pick(segments.slice(1));
  if (segments[0] === "s" && segments[1] === site.slug) return pick(segments.slice(2));
  return null;
}

/**
 * Count a quote request sent from the company's site (called by the public form route after the
 * lead is saved). Best effort: a stats failure never affects the lead.
 */
export async function recordSiteQuote(
  input: { organizationId: string; companyId: string; pageUrl: string | null | undefined; utm?: Record<string, string> | null },
  admin?: AdminClient,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    if (!input.pageUrl) return false;
    admin = admin ?? createSupabaseAdminClient();
    const { data } = await admin.from("company_sites").select(SITE_COLUMNS).eq("organization_id", input.organizationId).eq("company_id", input.companyId).maybeSingle();
    const site = data as SiteRow | null;
    if (!site || site.status !== "published") return false;
    const path = sitePathFromPageUrl(site, input.pageUrl);
    if (path === null) return false;
    const content = parseSiteContent(site.content);
    const known = path === "" || (content ? Boolean(findSitePage(content, path)) : false);
    const utm = input.utm ?? {};
    const source: SiteTrafficSource = utm.utm_source || utm.utm_medium || utm.gclid || utm.fbclid
      ? siteTrafficSource({ utmSource: utm.utm_source, utmMedium: utm.utm_medium, adClick: Boolean(utm.gclid || utm.fbclid) })
      : "unknown";
    await bump(admin, site, known ? path : "", source, { quotes: 1 }, now);
    return true;
  } catch (err) {
    console.warn("[site-stats] quote count failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Reading (owner, RLS client) ──────────────────────────────────────────────

export interface SiteStatsSummary {
  days: number;
  totals: { views: number; calls: number; quotes: number };
  previous: { views: number; calls: number; quotes: number };
  /** One entry per day, oldest first (zeros included), for the chart. */
  daily: Array<{ day: string; views: number; calls: number; quotes: number }>;
  sources: Array<{ source: SiteTrafficSource; label: string; views: number }>;
  pages: Array<{ path: string; views: number; calls: number; quotes: number }>;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Shape stats rows into the owner's summary for the last `days` days ending `today`. PURE. */
export function summarizeSiteStats(
  rows: Array<Pick<Tables<"site_stats_daily">, "day" | "path" | "source" | "views" | "calls" | "quotes">>,
  today: string,
  days: number,
): SiteStatsSummary {
  const start = addDays(today, -(days - 1));
  const prevStart = addDays(start, -days);
  const zero = () => ({ views: 0, calls: 0, quotes: 0 });
  const totals = zero();
  const previous = zero();
  const byDay = new Map<string, { views: number; calls: number; quotes: number }>();
  const bySource = new Map<SiteTrafficSource, number>();
  const byPath = new Map<string, { views: number; calls: number; quotes: number }>();
  for (const r of rows) {
    const day = String(r.day).slice(0, 10);
    if (day >= prevStart && day < start) {
      previous.views += r.views;
      previous.calls += r.calls;
      previous.quotes += r.quotes;
      continue;
    }
    if (day < start || day > today) continue;
    totals.views += r.views;
    totals.calls += r.calls;
    totals.quotes += r.quotes;
    const d = byDay.get(day) ?? zero();
    d.views += r.views;
    d.calls += r.calls;
    d.quotes += r.quotes;
    byDay.set(day, d);
    if (r.views) {
      const source = (SITE_TRAFFIC_SOURCES as readonly string[]).includes(r.source) ? (r.source as SiteTrafficSource) : "other";
      bySource.set(source, (bySource.get(source) ?? 0) + r.views);
    }
    const p = byPath.get(r.path) ?? zero();
    p.views += r.views;
    p.calls += r.calls;
    p.quotes += r.quotes;
    byPath.set(r.path, p);
  }
  const daily: SiteStatsSummary["daily"] = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    daily.push({ day, ...(byDay.get(day) ?? zero()) });
  }
  return {
    days,
    totals,
    previous,
    daily,
    sources: [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([source, views]) => ({ source, label: SITE_SOURCE_LABELS[source], views })),
    pages: [...byPath.entries()].map(([path, c]) => ({ path, ...c })).sort((a, b) => b.views - a.views || b.quotes - a.quotes).slice(0, 10),
  };
}

export const SITE_STATS_DAYS = 30;

/** The owner's last-30-days summary for a company's site (null when it has no site). */
export async function loadSiteStats(ctx: TenantServiceContext, companyId: string, now: Date = new Date()) {
  const [{ data: siteData, error: siteError }, { data: companyData }] = await Promise.all([
    ctx.supabase.from("company_sites").select("id, status, slug, content").eq("organization_id", ctx.organizationId).eq("company_id", companyId).maybeSingle(),
    ctx.supabase.from("companies").select("timezone").eq("organization_id", ctx.organizationId).eq("id", companyId).maybeSingle(),
  ]);
  if (siteError) throw siteError;
  const site = siteData as Pick<Tables<"company_sites">, "id" | "status" | "slug" | "content"> | null;
  if (!site) return null;
  const today = siteLocalDay(now, (companyData as { timezone?: string | null } | null)?.timezone);
  const since = addDays(today, -(SITE_STATS_DAYS * 2 - 1));
  const { data, error } = await ctx.supabase
    .from("site_stats_daily")
    .select("day, path, source, views, calls, quotes")
    .eq("organization_id", ctx.organizationId)
    .eq("site_id", site.id)
    .gte("day", since)
    .limit(5000);
  if (error) throw error;
  const content = parseSiteContent(site.content);
  const summary = summarizeSiteStats((data ?? []) as Parameters<typeof summarizeSiteStats>[0], today, SITE_STATS_DAYS);
  const label = (path: string) => (path ? (content ? findSitePage(content, path)?.label : null) ?? path : "Home page");
  return {
    published: site.status === "published",
    ...summary,
    pages: summary.pages.map((p) => ({ ...p, label: label(p.path) })),
  };
}
