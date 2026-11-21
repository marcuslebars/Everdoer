// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): live Google reviews for a published generated site. No
// session (the visitor's browser asks when the reviews section scrolls into view). The site is
// resolved from its public slug only, only published sites with the reviews section showing get
// anything, and only that site's company's Google place id is read.
// docs/done-for-you.md → "Generated sites" → "Google reviews".
// ─────────────────────────────────────────────────────────────────────────────
import type { AdminClient } from "@/server/services/done-for-you/purchases";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

import { isPlaceId, placesApiKey } from "./places";
import { isValidSlug, parseSiteContent } from "./site-content";

/**
 * Google's Places terms: review text may not be pre-fetched, cached or stored. So reviews are
 * fetched from Google when a visitor reaches the section, passed straight to the browser
 * (Cache-Control: no-store) and never written anywhere. Each fetch is a billed Place Details
 * (Enterprise + Atmosphere) call, so the section loads lazily and two caps bound the spend:
 *   SITE_REVIEWS_DAILY_PER_SITE (default 50) and SITE_REVIEWS_MONTHLY_CAP (default 1000 = the
 *   SKU's free monthly calls; 0 turns live reviews off). Over a cap the page keeps its rating
 *   and "Read our Google reviews" link.
 * Shown as Google returns them ("most relevant"), never filtered by stars, with the author's
 * name and link beside each review and Google Maps attribution.
 */

const PLACES_BASE = "https://places.googleapis.com/v1";
const FIELD_MASK = "reviews,rating,userRatingCount,googleMapsUri";
const TIMEOUT_MS = 6_000;
export const MAX_SITE_REVIEWS = 5;

export interface SiteReview {
  rating: number;
  text: string;
  author: string;
  /** The reviewer's Google Maps profile (https on a Google host), when given. */
  authorUrl: string | null;
  authorPhoto: string | null;
  /** "2 weeks ago" — Google's own wording. */
  when: string | null;
}

export interface SiteReviewsPayload {
  rating: number | null;
  count: number | null;
  /** The business on Google Maps ("Read all reviews"). */
  mapsUrl: string | null;
  reviews: SiteReview[];
}

type Raw = Record<string, unknown>;

function googleUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return /(^|\.)google\.[a-z.]+$|(^|\.)googleusercontent\.com$|(^|\.)goo\.gl$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Google's answer → what the page shows. Reviews without text are skipped. PURE. */
export function mapPlaceReviews(raw: unknown): SiteReviewsPayload {
  const r = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const reviews: SiteReview[] = [];
  for (const item of Array.isArray(r.reviews) ? (r.reviews as Raw[]) : []) {
    const text = ((item.text as Raw | undefined)?.text ?? (item.originalText as Raw | undefined)?.text) as unknown;
    const rating = typeof item.rating === "number" ? Math.max(1, Math.min(5, Math.round(item.rating))) : null;
    const author = item.authorAttribution as Raw | undefined;
    if (typeof text !== "string" || !text.trim() || !rating) continue;
    reviews.push({
      rating,
      text: text.trim().slice(0, 1200),
      author: typeof author?.displayName === "string" && author.displayName.trim() ? author.displayName.trim().slice(0, 80) : "A Google user",
      authorUrl: googleUrl(author?.uri),
      authorPhoto: googleUrl(author?.photoUri),
      when: typeof item.relativePublishTimeDescription === "string" ? item.relativePublishTimeDescription.slice(0, 40) : null,
    });
    if (reviews.length >= MAX_SITE_REVIEWS) break;
  }
  return {
    rating: typeof r.rating === "number" ? r.rating : null,
    count: typeof r.userRatingCount === "number" ? r.userRatingCount : null,
    mapsUrl: googleUrl(r.googleMapsUri),
    reviews,
  };
}

export type ReviewsFetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Live reviews for a place. Null when Places isn't configured or Google fails — never throws. */
export async function fetchPlaceReviews(placeId: string, deps: { apiKey?: string | null; fetch?: ReviewsFetch } = {}): Promise<SiteReviewsPayload | null> {
  const apiKey = deps.apiKey === undefined ? placesApiKey() : deps.apiKey;
  if (!apiKey || !isPlaceId(placeId)) return null;
  const doFetch: ReviewsFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}?languageCode=en&regionCode=CA`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      signal: abort.signal,
    });
    if (!res.ok) {
      console.warn(`[site-reviews] Google Places answered ${res.status}`);
      return null;
    }
    return mapPlaceReviews(await res.json());
  } catch (err) {
    console.warn("[site-reviews] Google Places failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function siteReviewsCaps(): { perSiteDaily: number; monthly: number } {
  return { perSiteDaily: numberEnv("SITE_REVIEWS_DAILY_PER_SITE", 50), monthly: numberEnv("SITE_REVIEWS_MONTHLY_CAP", 1000) };
}

/**
 * The place id behind a published site whose reviews section is showing, or null. (Caps are
 * checked by the route before this costs a Google call.)
 */
export async function sitePlaceForReviews(slug: string, admin: AdminClient = createSupabaseAdminClient()): Promise<{ placeId: string; siteId: string } | null> {
  const s = slug.trim().toLowerCase();
  if (!isValidSlug(s)) return null;
  const { data: site } = await admin.from("company_sites").select("id, organization_id, company_id, status, content").eq("slug", s).maybeSingle();
  const row = site as { id: string; organization_id: string; company_id: string; status: string; content: unknown } | null;
  if (!row || row.status !== "published") return null;
  const content = parseSiteContent(row.content);
  if (!content || content.settings.sections.find((sec) => sec.id === "reviews")?.hidden) return null;
  const { data: company } = await admin.from("companies").select("google_place_id").eq("id", row.company_id).eq("organization_id", row.organization_id).maybeSingle();
  const placeId = (company as { google_place_id?: string | null } | null)?.google_place_id ?? null;
  return placeId && isPlaceId(placeId) ? { placeId, siteId: row.id } : null;
}

/** Live reviews for a site's slug (null = nothing to show). */
export async function liveSiteReviews(slug: string, deps: { admin?: AdminClient; fetch?: ReviewsFetch; apiKey?: string | null } = {}): Promise<SiteReviewsPayload | null> {
  const place = await sitePlaceForReviews(slug, deps.admin);
  if (!place) return null;
  return fetchPlaceReviews(place.placeId, { apiKey: deps.apiKey, fetch: deps.fetch });
}
