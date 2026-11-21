import { NextResponse } from "next/server";

import { fetchPlaceReviews, sitePlaceForReviews, siteReviewsCaps } from "@/server/services/dfy/site-reviews";
import { isBotUserAgent } from "@/server/services/dfy/site-stats";
import { enforceRateLimit, trustedClientIp } from "@/server/services/rate-limit";

/**
 * Live Google reviews for a generated site (docs/done-for-you.md → "Generated sites" → "Google
 * reviews"). The page asks when its reviews section scrolls into view. Google's terms forbid
 * storing or caching review text, so this answers `no-store` and keeps nothing.
 *
 * Every answer is 200 with `{ data: … | null }`: null means "keep the rating and link you
 * already show" (unknown site, section hidden, Places off, a cap reached, Google failing).
 * Limits run BEFORE the billed Google call: per IP, per site per day, and a monthly total.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store", "access-control-allow-origin": "*" };
const nothing = () => NextResponse.json({ data: null }, { headers: HEADERS });

export async function GET(request: Request): Promise<NextResponse> {
  if (isBotUserAgent(request.headers.get("user-agent"))) return nothing();
  const slug = new URL(request.url).searchParams.get("s") ?? "";
  if (!slug || slug.length > 62) return nothing();
  const ip = trustedClientIp(request);
  if (await enforceRateLimit(request, { scope: "site_reviews_ip", limit: 20, windowSeconds: 600, keyParts: [ip] })) return nothing();

  try {
    const place = await sitePlaceForReviews(slug);
    if (!place) return nothing();
    const caps = siteReviewsCaps();
    if (caps.monthly === 0 || caps.perSiteDaily === 0) return nothing();
    if (await enforceRateLimit(request, { scope: "site_reviews_site_day", limit: caps.perSiteDaily, windowSeconds: 86_400, keyParts: [place.siteId] })) return nothing();
    if (await enforceRateLimit(request, { scope: "site_reviews_month", limit: caps.monthly, windowSeconds: 30 * 86_400, keyParts: ["all"] })) return nothing();
    const reviews = await fetchPlaceReviews(place.placeId);
    return NextResponse.json({ data: reviews && reviews.reviews.length ? reviews : null }, { headers: HEADERS });
  } catch (err) {
    console.warn("[site-reviews] failed:", err instanceof Error ? err.message : err);
    return nothing();
  }
}
