import { defaultSitePagesSettings, MAX_AREA_PAGES, tradeProfile, uniqueTowns, type SiteContent, type SitePagesSettings, type SiteService } from "./site-content";

export { MAX_AREA_PAGES };

/**
 * Generated sites — the extra pages (docs/done-for-you.md → "Generated sites" → "Service and
 * town pages"). PURE.
 *
 * A full website (not a price page) gets, besides its home page:
 *   - one page per service:  /<site>/<service>             e.g. /northshore/roof-snow-removal
 *   - one page per town:     /<site>/<trade>-<town>        e.g. /northshore/snow-removal-innisfil
 * Towns come from the owner's service area (or their own list), capped at MAX_AREA_PAGES. We
 * deliberately do NOT build service × town pages: a grid of near-identical pages is what search
 * engines call doorway pages and penalise.
 */

export const MAX_SERVICE_PAGES = 20;

/** Paths a page may never take (they're other routes on the same host). */
const RESERVED = new Set(["jobs", "plans", "sitemap-xml", "sitemap", "robots", "robots-txt", "s", "api", "embed", "_next", "_domain", "favicon-ico"]);

/** Words that mean "a region", not a town we can name a page after. */
const NOT_A_TOWN = /\b(area|areas|region|regions|surrounding|surroundings|nearby|county|counties|district|km|kms|kilometres?|miles?|within|all|ontario|canada|province|gta|and more|etc)\b/i;

/**
 * Town names in a free-text service area: "Barrie, Innisfil and Oro-Medonte" → three towns.
 * Conservative: anything that reads like a region ("Simcoe County", "the GTA", "30 km around
 * Midland") is skipped rather than guessed at.
 */
export function parseServiceTowns(serviceArea: string | null | undefined): string[] {
  if (!serviceArea) return [];
  const parts = serviceArea
    .replace(/\([^)]*\)/g, ",")
    .split(/,|;|\/|&|\band\b|\n|·|•|\+/i)
    .map((p) => p.trim())
    .filter((p) => p && !NOT_A_TOWN.test(p) && !/\d/.test(p))
    // "south Barrie" → "Barrie"; "Greater Sudbury" stays (it's the city's name).
    .map((p) => p.replace(/^(north|south|east|west|central|downtown)\s+/i, ""));
  return uniqueTowns(parts);
}

/** "Roof snow removal" → "roof-snow-removal". */
export function pageSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export interface SiteServicePage {
  kind: "service";
  path: string;
  label: string;
  service: SiteService;
}

export interface SiteAreaPage {
  kind: "area";
  path: string;
  label: string;
  town: string;
}

export type SitePage = SiteServicePage | SiteAreaPage;

/** The towns the area pages are built for (the owner's list, else the service area's). */
function pagesSettings(content: SiteContent): SitePagesSettings {
  return content.settings.pages ?? defaultSitePagesSettings();
}

export function siteTowns(content: SiteContent): string[] {
  const settings = pagesSettings(content);
  return settings.towns ?? parseServiceTowns(content.facts.serviceArea);
}

/** "Snow removal" for a snow company; the trade's plain name, else "Services". */
export function tradeNoun(content: SiteContent): string {
  return (content.facts.tradeId ? tradeProfile(content.facts.tradeId).noun : null) ?? content.facts.tradeLabel ?? "Services";
}

/** The words town-page addresses start with: short, and what people type ("snow-removal-barrie"). */
const TRADE_PATH: Record<string, string> = {
  "property-maintenance-snow": "snow-removal",
  roofing: "roofing",
  landscaping: "landscaping",
  "hvac-plumbing": "hvac",
  marine: "marine-service",
  "general-contractor": "general-contractor",
};

function tradePath(content: SiteContent): string {
  return (content.facts.tradeId && TRADE_PATH[content.facts.tradeId]) || pageSlug(tradeNoun(content).split(/,| and /)[0]) || "services";
}

/**
 * Every extra page this site has, in a stable order (services in catalog order, then towns).
 * A price page (the business has its own website) gets none: those pages would compete with
 * their own site in search.
 */
export function sitePages(content: SiteContent): SitePage[] {
  if (content.mode !== "full") return [];
  const settings = pagesSettings(content);
  const used = new Set<string>(RESERVED);
  const take = (base: string): string | null => {
    const slug = pageSlug(base);
    if (!slug) return null;
    let candidate = slug;
    for (let n = 2; used.has(candidate); n += 1) candidate = `${slug}-${n}`.slice(0, 64);
    used.add(candidate);
    return candidate;
  };
  const pages: SitePage[] = [];
  if (settings.services) {
    for (const service of content.facts.services.slice(0, MAX_SERVICE_PAGES)) {
      const path = take(service.label);
      if (path) pages.push({ kind: "service", path, label: service.label, service });
    }
  }
  if (settings.areas) {
    const noun = tradeNoun(content);
    const prefix = tradePath(content);
    const towns = siteTowns(content);
    // One town isn't worth a page of its own: the home page already says it.
    if (towns.length >= 2) {
      for (const town of towns) {
        const path = take(`${prefix} ${town}`);
        if (path) pages.push({ kind: "area", path, label: `${noun} in ${town}`, town });
      }
    }
  }
  return pages;
}

export function findSitePage(content: SiteContent, path: string): SitePage | null {
  const p = (path ?? "").trim().toLowerCase().replace(/\/+$/, "");
  if (!/^[a-z0-9-]{1,64}$/.test(p)) return null;
  return sitePages(content).find((page) => page.path === p) ?? null;
}

/** A page's address under the site's home address ("https://x/northshore" or "https://domain/"). */
export function sitePageUrl(homeUrl: string, path: string | null): string {
  if (!path) return homeUrl;
  return `${homeUrl.replace(/\/+$/, "")}/${path}`;
}

/** sitemap.xml for the home page and every extra page. */
export function siteSitemapXml(content: SiteContent, homeUrl: string, lastmod: string | null): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const day = lastmod && /^\d{4}-\d{2}-\d{2}/.test(lastmod) ? lastmod.slice(0, 10) : null;
  const urls = [homeUrl, ...sitePages(content).map((p) => sitePageUrl(homeUrl, p.path))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc>${day ? `<lastmod>${day}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}
