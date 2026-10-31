import { NextResponse } from "next/server";

import { CUSTOM_DOMAIN_SLUG, edgeSiteHost } from "@/server/services/dfy/site-host";
import { loadPublishedSiteForDomain, loadPublishedSitePage } from "@/server/services/dfy/site-public";
import { renderSiteNotFound } from "@/server/services/dfy/site-render";

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

const HTML = "text/html; charset=utf-8";

function notFound(): NextResponse {
  return new NextResponse(renderSiteNotFound(), {
    status: 404,
    headers: { "content-type": HTML, "cache-control": "public, max-age=0, s-maxage=30", "x-robots-tag": "noindex" },
  });
}

async function handle(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const page =
      context.params.slug === CUSTOM_DOMAIN_SLUG
        ? await loadPublishedSiteForDomain(edgeSiteHost(request.headers, process.env.SITES_EDGE_KEY))
        : await loadPublishedSitePage(context.params.slug);
    if (!page) return notFound();
    const headers: Record<string, string> = {
      "content-type": HTML,
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      etag: page.etag,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    };
    // Every business domain arrives on the same URL (/s/_domain): a cache must key on the domain.
    if (context.params.slug === CUSTOM_DOMAIN_SLUG) headers.vary = "x-everdoer-site-host";
    if (request.headers.get("if-none-match") === page.etag) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(request.method === "HEAD" ? null : page.html, { status: 200, headers });
  } catch (err) {
    console.error("[sites] public render failed:", err instanceof Error ? err.message : err);
    return new NextResponse(renderSiteNotFound(), { status: 503, headers: { "content-type": HTML, "cache-control": "no-store" } });
  }
}

export const GET = handle;
export const HEAD = handle;
