import type { NextResponse } from "next/server";

import { serveSite } from "@/server/services/dfy/site-serve";

/**
 * A company's generated website (docs/done-for-you.md → "Generated sites"). Served at /s/<slug>
 * on the app host, and at /<slug> on the PAGES_BASE_URL host (src/middleware.ts rewrites it here).
 * Server-rendered HTML; only 'published' sites render — anything else is a neutral 404.
 *
 * Caching: short shared cache (s-maxage=60, stale-while-revalidate=300) so a CDN in front of the
 * pages host absorbs traffic while a publish/unpublish/edit shows up within a minute, plus an
 * ETag so repeat visits revalidate with a 304.
 *
 * A business's own domain (docs/custom-domains.md): Cloudflare serves it, and our sites-edge
 * Worker forwards "/" here as slug "_domain" with the domain in a signed header. A connected,
 * live domain gets its page; anything else is the neutral 404.
 */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { slug: string };
}

async function handle(request: Request, context: RouteContext): Promise<NextResponse> {
  return serveSite(request, context.params.slug, { kind: "home" });
}

export const GET = handle;
export const HEAD = handle;
