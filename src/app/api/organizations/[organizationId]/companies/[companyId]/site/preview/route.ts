import { NextResponse } from "next/server";

import type { Tables } from "@/server/db/database.types";
import { siteRoute } from "@/server/api/site-route";
import { parseSiteContent } from "@/server/services/dfy/site-content";
import { findSitePage } from "@/server/services/dfy/site-pages";
import { siteRuntime } from "@/server/services/dfy/site-public";
import { renderSitePage, renderSiteSubpage } from "@/server/services/dfy/site-render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

/**
 * Owner preview of the generated site in any status (draft / unpublished / published), with a
 * "Preview" banner and noindex. Members of the org only; opened from Settings → Your website.
 * `?page=<path>` previews one of the service or town pages; links between pages stay in the
 * preview.
 */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(organizationId, companyId, async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("company_sites")
      .select("organization_id, company_id, slug, content, favicon_url, custom_domain, custom_domain_status")
      .eq("organization_id", organizationId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;
    const site = data as Pick<Tables<"company_sites">, "organization_id" | "company_id" | "slug" | "content" | "favicon_url" | "custom_domain" | "custom_domain_status"> | null;
    const content = site ? parseSiteContent(site.content) : null;
    if (!site || !content) {
      return NextResponse.json({ error: "This company doesn't have a page yet." }, { status: 404 });
    }
    const pagePath = new URL(request.url).searchParams.get("page");
    const page = pagePath ? findSitePage(content, pagePath) : null;
    if (pagePath && !page) return NextResponse.json({ error: "That page isn't part of this site." }, { status: 404 });
    const base = `/api/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}/site/preview`;
    const options = {
      ...(await siteRuntime(createSupabaseAdminClient(), site, content)),
      preview: true,
      pageHref: (path: string | null) => (path ? `${base}?page=${encodeURIComponent(path)}` : base),
    };
    return new NextResponse(page ? renderSiteSubpage(content, options, page) : renderSitePage(content, options), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
    });
  });
}
