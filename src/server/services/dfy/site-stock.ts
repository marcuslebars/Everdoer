/**
 * Stock photo for the top of a generated site when the owner hasn't added any photos
 * (docs/done-for-you.md → "Generated sites" → "Stock photo"). From Pexels (free for commercial
 * use; their API asks for a visible "Photos provided by Pexels" link and credit to the
 * photographer, which the page footer carries).
 *
 * A stock photo only ever fills the top of the page. It is never in "Our work" (that would pass
 * someone else's work off as the business's), never in the JSON-LD, and the owner's own first
 * photo always replaces it.
 *
 * Env: PEXELS_API_KEY [web, workers] — unset means no stock photos (pages look as before).
 */
import type { SiteStockPhoto } from "./site-content";

const API = "https://api.pexels.com/v1/search";
const PER_PAGE = 15;

/** What we search for, per trade: real jobs, outdoors, no faces front and centre. */
const QUERIES: Record<string, string> = {
  "property-maintenance-snow": "snow plow driveway winter",
  roofing: "roofer working on roof shingles",
  landscaping: "landscaped garden lawn",
  "hvac-plumbing": "hvac technician air conditioner",
  marine: "boats marina dock lake",
  "general-contractor": "home renovation construction",
};
const DEFAULT_QUERY = "house exterior neighbourhood";

export function stockQuery(tradeId: string | null | undefined): string {
  return (tradeId && QUERIES[tradeId]) || DEFAULT_QUERY;
}

export function pexelsApiKey(): string | null {
  return process.env.PEXELS_API_KEY?.trim() || null;
}

interface PexelsPhoto {
  id?: unknown;
  width?: unknown;
  height?: unknown;
  url?: unknown;
  alt?: unknown;
  photographer?: unknown;
  photographer_url?: unknown;
  src?: { large2x?: unknown; landscape?: unknown; original?: unknown };
}

const PEXELS_IMAGE = /^https:\/\/images\.pexels\.com\//;
const PEXELS_PAGE = /^https:\/\/(www\.)?pexels\.com\//;

/** One Pexels result as our stored photo, or null when it's unusable (wrong host, portrait). PURE. */
export function toStockPhoto(p: PexelsPhoto, query: string, index: number): SiteStockPhoto | null {
  const id = typeof p.id === "number" ? p.id : null;
  const url = typeof p.src?.large2x === "string" ? p.src.large2x : null;
  const width = typeof p.width === "number" ? p.width : 0;
  const height = typeof p.height === "number" ? p.height : 0;
  if (!id || !url || !PEXELS_IMAGE.test(url) || width < height) return null;
  const pageUrl = typeof p.url === "string" && PEXELS_PAGE.test(p.url) ? p.url : "https://www.pexels.com/";
  const photographerUrl = typeof p.photographer_url === "string" && PEXELS_PAGE.test(p.photographer_url) ? p.photographer_url : pageUrl;
  return {
    id,
    url,
    alt: typeof p.alt === "string" ? p.alt.slice(0, 200) : "",
    photographer: typeof p.photographer === "string" && p.photographer.trim() ? p.photographer.trim().slice(0, 80) : "a Pexels photographer",
    photographerUrl,
    pageUrl,
    query,
    index,
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
 * seed. Null when no key is set, Pexels fails, or nothing usable comes back — never throws.
 */
export async function findStockPhoto(input: {
  tradeId: string | null | undefined;
  seed: string;
  index?: number;
  apiKey?: string | null;
  fetch?: StockFetch;
}): Promise<SiteStockPhoto | null> {
  const apiKey = input.apiKey === undefined ? pexelsApiKey() : input.apiKey;
  if (!apiKey) return null;
  const query = stockQuery(input.tradeId);
  const doFetch: StockFetch = input.fetch ?? ((url, init) => fetch(url, init));
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8_000);
  try {
    const url = `${API}?${new URLSearchParams({ query, orientation: "landscape", size: "large", per_page: String(PER_PAGE) })}`;
    const res = await doFetch(url, { headers: { authorization: apiKey }, signal: abort.signal });
    if (!res.ok) {
      console.warn(`[site-stock] Pexels answered ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { photos?: PexelsPhoto[] };
    const photos = Array.isArray(body.photos) ? body.photos : [];
    const usable = photos.map((p, i) => toStockPhoto(p, query, i)).filter((p): p is SiteStockPhoto => p !== null);
    if (!usable.length) return null;
    const index = Math.max(0, input.index ?? 0);
    const pick = usable[(stockSeed(input.seed) + index) % usable.length];
    return { ...pick, index };
  } catch (err) {
    console.warn("[site-stock] Pexels lookup failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
