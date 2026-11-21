import { NextResponse } from "next/server";
import { z } from "zod";

import { isBotUserAgent, recordSiteHit } from "@/server/services/dfy/site-stats";
import { enforceRateLimit, trustedClientIp } from "@/server/services/rate-limit";

/**
 * A generated site's visit / call-tap beacon (docs/done-for-you.md → "Generated sites" → "Site
 * stats"). No session; the page sends `navigator.sendBeacon` with a small text/plain JSON body,
 * so there is no CORS preflight and the answer is never read. Always 204 (nothing to learn by
 * probing). Bots, unknown sites and unknown pages are dropped; per-IP limits cap inflation.
 * Nothing about the visitor is stored (see site-stats.ts).
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 2_000;

const hitSchema = z.object({
  s: z.string().min(1).max(62),
  p: z.string().max(64).default(""),
  k: z.enum(["view", "call"]),
  r: z.string().max(500).nullable().optional(),
  us: z.string().max(100).nullable().optional(),
  um: z.string().max(100).nullable().optional(),
  ad: z.boolean().optional(),
});

const NO_CONTENT = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });

export async function POST(request: Request): Promise<NextResponse> {
  if (isBotUserAgent(request.headers.get("user-agent"))) return NO_CONTENT();
  const ip = trustedClientIp(request);
  // A visitor browsing every page of a site is ~20 hits; this only stops loops and scripts.
  const limited = await enforceRateLimit(request, { scope: "site_hit_ip", limit: 60, windowSeconds: 600, keyParts: [ip] });
  if (limited) return NO_CONTENT();
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return NO_CONTENT();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NO_CONTENT();
  }
  const parsed = hitSchema.safeParse(raw);
  if (!parsed.success) return NO_CONTENT();
  const hit = parsed.data;
  // Per site per IP: one person can't run a site's numbers up.
  const perSite = await enforceRateLimit(request, { scope: "site_hit_site", limit: 30, windowSeconds: 3600, keyParts: [hit.s, ip] });
  if (perSite) return NO_CONTENT();
  try {
    await recordSiteHit({
      slug: hit.s,
      path: hit.p,
      kind: hit.k,
      referrer: hit.r ?? null,
      utmSource: hit.us ?? null,
      utmMedium: hit.um ?? null,
      adClick: hit.ad === true,
    });
  } catch (err) {
    console.warn("[site-stats] hit failed:", err instanceof Error ? err.message : err);
  }
  return NO_CONTENT();
}
