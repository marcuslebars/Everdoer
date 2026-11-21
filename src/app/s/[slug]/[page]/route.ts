import type { NextResponse } from "next/server";

import { serveSite } from "@/server/services/dfy/site-serve";

/**
 * A generated site's extra pages (docs/done-for-you.md → "Generated sites" → "Service and town
 * pages"): /s/<slug>/<page> (a service or a town) and /s/<slug>/sitemap.xml. Also served at
 * /<slug>/<page> on the pages host (src/middleware.ts) and /<page> on a business's own domain
 * (the sites-edge Worker forwards it as /s/_domain/<page>). The jobs/ and plans/ folders next to
 * this one are their own routes and win over this one.
 */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { slug: string; page: string };
}

async function handle(request: Request, context: RouteContext): Promise<NextResponse> {
  const { slug, page } = context.params;
  return serveSite(request, slug, page === "sitemap.xml" ? { kind: "sitemap" } : { kind: "page", path: page });
}

export const GET = handle;
export const HEAD = handle;
