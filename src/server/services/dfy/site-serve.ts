import { NextResponse } from "next/server";

import { CUSTOM_DOMAIN_SLUG, edgeSiteHost } from "./site-host";
import { loadPublishedSiteForDomain, loadPublishedSitePage, type SiteRequest } from "./site-public";
import { renderSiteNotFound } from "./site-render";

/**
 * Serving a generated site's home page, one of its extra pages, or its sitemap (the /s/<slug>
 * and /s/<slug>/<page> routes; docs/done-for-you.md → "Generated sites"). Only 'published' sites
 * render; anything else, and any page the site doesn't have, is the neutral 404.
 *
 * Caching: short shared cache (s-maxage=60, stale-while-revalidate=300) plus an ETag. A business
 * domain (slug "_domain", forwarded by the sites-edge Worker with the host in a signed header) is
 * never cached by a shared cache: every business domain arrives on the same URL.
 */

const HTML = "text/html; charset=utf-8";
const XML = "application/xml; charset=utf-8";

function notFound(): NextResponse {
  return new NextResponse(renderSiteNotFound(), {
    status: 404,
    headers: { "content-type": HTML, "cache-control": "public, max-age=0, s-maxage=30", "x-robots-tag": "noindex" },
  });
}

export async function serveSite(request: Request, slug: string, what: SiteRequest): Promise<NextResponse> {
  try {
    const onDomain = slug === CUSTOM_DOMAIN_SLUG;
    const page = onDomain
      ? await loadPublishedSiteForDomain(edgeSiteHost(request.headers, process.env.SITES_EDGE_KEY), undefined, what)
      : await loadPublishedSitePage(slug, undefined, what);
    if (!page) return notFound();
    const headers: Record<string, string> = {
      "content-type": what.kind === "sitemap" ? XML : HTML,
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      etag: page.etag,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    };
    // Some caches ignore Vary on HTML: never let a shared cache store a business-domain response.
    if (onDomain) {
      headers["cache-control"] = "private, no-cache";
      headers.vary = "x-everdoer-site-host";
    }
    if (request.headers.get("if-none-match") === page.etag) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(request.method === "HEAD" ? null : page.html, { status: 200, headers });
  } catch (err) {
    console.error("[sites] public render failed:", err instanceof Error ? err.message : err);
    return new NextResponse(renderSiteNotFound(), { status: 503, headers: { "content-type": HTML, "cache-control": "no-store" } });
  }
}
