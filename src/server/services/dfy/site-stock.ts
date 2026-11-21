/**
 * Stock photo for the top of a generated site when the owner hasn't added any photos
 * (docs/done-for-you.md → "Generated sites" → "Stock photo"). From Unsplash, following their API
 * guidelines: images are hotlinked from images.unsplash.com (never copied), the page credits the
 * photographer and Unsplash with referral links, and using a photo is reported to its
 * `download_location` (server-side, with our key).
 *
 * A stock photo only ever fills the top of the page. It is never in "Our work" (that would pass
 * someone else's work off as the business's), never in the JSON-LD, and the owner's own first
 * photo always replaces it.
 *
 * Env: UNSPLASH_ACCESS_KEY [web, workers] — unset means no stock photos (pages look as before).
 */
import type { SiteStockPhoto } from "./site-content";

const API = "https://api.unsplash.com";
const PER_PAGE = 15;
/** Unsplash wants referral links tagged with the app's name. */
export const UNSPLASH_UTM = "utm_source=everdoer&utm_medium=referral";

/** What we search for, per trade: real jobs, outdoors, no faces front and centre. */
const QUERIES: Record<string, string> = {
  "property-maintenance-snow": "snow plow driveway",
  roofing: "roofer roof shingles",
  landscaping: "landscaped garden lawn",
  "hvac-plumbing": "hvac technician",
  marine: "boats marina dock",
  "general-contractor": "home renovation construction",
};
const DEFAULT_QUERY = "house exterior";

export function stockQuery(tradeId: string | null | undefined): string {
  return (tradeId && QUERIES[tradeId]) || DEFAULT_QUERY;
}

export function unsplashAccessKey(): string | null {
  return process.env.UNSPLASH_ACCESS_KEY?.trim() || null;
}

interface UnsplashPhoto {
  id?: unknown;
  width?: unknown;
  height?: unknown;
  alt_description?: unknown;
  description?: unknown;
  urls?: { raw?: unknown };
  links?: { html?: unknown; download_location?: unknown };
  user?: { name?: unknown; username?: unknown; links?: { html?: unknown } };
}

const UNSPLASH_IMAGE = /^https:\/\/images\.unsplash\.com\//;
const UNSPLASH_PAGE = /^https:\/\/unsplash\.com\//;
const UNSPLASH_API = /^https:\/\/api\.unsplash\.com\//;

function withUtm(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${UNSPLASH_UTM}`;
}

/** One Unsplash result as our stored photo, or null when it's unusable (wrong host, portrait). PURE. */
export function toStockPhoto(p: UnsplashPhoto, query: string, index: number): (SiteStockPhoto & { downloadLocation: string | null }) | null {
  const id = typeof p.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(p.id) ? p.id : null;
  const raw = typeof p.urls?.raw === "string" ? p.urls.raw : null;
  const width = typeof p.width === "number" ? p.width : 0;
  const height = typeof p.height === "number" ? p.height : 0;
  if (!id || !raw || !UNSPLASH_IMAGE.test(raw) || width < height) return null;
  // Hotlinked at a page-hero size (Unsplash's imgix parameters on the raw URL).
  const url = `${raw}${raw.includes("?") ? "&" : "?"}w=1920&q=80&fm=jpg&fit=crop`;
  const page = typeof p.links?.html === "string" && UNSPLASH_PAGE.test(p.links.html) ? p.links.html : "https://unsplash.com/";
  const profile = typeof p.user?.links?.html === "string" && UNSPLASH_PAGE.test(p.user.links.html) ? p.user.links.html : page;
  const alt = typeof p.alt_description === "string" ? p.alt_description : typeof p.description === "string" ? p.description : "";
  const download = typeof p.links?.download_location === "string" && UNSPLASH_API.test(p.links.download_location) ? p.links.download_location : null;
  return {
    id,
    url,
    alt: alt.slice(0, 200),
    photographer: typeof p.user?.name === "string" && p.user.name.trim() ? p.user.name.trim().slice(0, 80) : "an Unsplash photographer",
    photographerUrl: withUtm(profile),
    pageUrl: withUtm(page),
    query,
    index,
    downloadLocation: download,
  };
}

/** A stable start so two snow companies don't get the same photo. PURE. */
export function stockSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h);
}

export type StockFetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * The photo at position `index` (wrapping) of the trade's search, starting from the company's
 * seed, reported to Unsplash as used. Null when no key is set, Unsplash fails, or nothing usable
 * comes back — never throws.
 */
export async function findStockPhoto(input: {
  tradeId: string | null | undefined;
  seed: string;
  index?: number;
  apiKey?: string | null;
  fetch?: StockFetch;
}): Promise<SiteStockPhoto | null> {
  const apiKey = input.apiKey === undefined ? unsplashAccessKey() : input.apiKey;
  if (!apiKey) return null;
  const query = stockQuery(input.tradeId);
  const doFetch: StockFetch = input.fetch ?? ((url, init) => fetch(url, init));
  const headers = { authorization: `Client-ID ${apiKey}`, "accept-version": "v1" };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8_000);
  try {
    const url = `${API}/search/photos?${new URLSearchParams({ query, orientation: "landscape", content_filter: "high", per_page: String(PER_PAGE) })}`;
    const res = await doFetch(url, { headers, signal: abort.signal });
    if (!res.ok) {
      console.warn(`[site-stock] Unsplash answered ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { results?: UnsplashPhoto[] };
    const results = Array.isArray(body.results) ? body.results : [];
    const usable = results.map((p, i) => toStockPhoto(p, query, i)).filter((p): p is NonNullable<typeof p> => p !== null);
    if (!usable.length) return null;
    const index = Math.max(0, input.index ?? 0);
    const { downloadLocation, ...pick } = usable[(stockSeed(input.seed) + index) % usable.length];
    // Unsplash's guidelines: report a photo as downloaded when an app starts using it.
    if (downloadLocation) {
      await doFetch(downloadLocation, { headers, signal: abort.signal }).catch((err) =>
        console.warn("[site-stock] Unsplash download report failed:", err instanceof Error ? err.message : err),
      );
    }
    return { ...pick, index };
  } catch (err) {
    console.warn("[site-stock] Unsplash lookup failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
