import { NextResponse } from "next/server";
import { z } from "zod";

import { SITE_THEME_CHOICES, type SiteThemeChoice } from "@/lib/site-style";
import { siteRoute } from "@/server/api/site-route";
import { SITE_MODES } from "@/server/services/dfy/site-content";
import { checkSiteDomain, domainCheckDue } from "@/server/services/dfy/site-domain";
import { generateSite, setSiteStatus, updateSiteEdits, updateSiteStyle } from "@/server/services/dfy/site-generator";
import { siteView } from "@/server/services/dfy/site-view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(organizationId, companyId, async ({ ctx, canManage }) => {
    // A connected domain is re-checked when an owner/admin opens the page (a pending one at most
    // once a minute, a live one every six hours). Members never trigger calls to Railway.
    const { data: site } = await ctx.supabase
      .from("company_sites")
      .select("custom_domain_status, custom_domain_checked_at")
      .eq("organization_id", organizationId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (canManage && site && domainCheckDue(site, Date.now())) {
      await checkSiteDomain(createSupabaseAdminClient(), { organizationId, companyId }).catch((err) =>
        console.error("[site-domain] check failed:", err instanceof Error ? err.message : err),
      );
    }
    return NextResponse.json({ data: await siteView(ctx, companyId, canManage) });
  });
}

const patchSchema = z
  .object({
    headline: z.string().max(90).nullable().optional(),
    subhead: z.string().max(220).nullable().optional(),
    about: z.string().max(1200).nullable().optional(),
    showPrices: z.boolean().optional(),
    mode: z.enum(SITE_MODES).optional(),
    /** The look; works before the page exists too (see updateSiteStyle). */
    theme: z.enum(SITE_THEME_CHOICES as [SiteThemeChoice, ...SiteThemeChoice[]]).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour like #1d4ed8")
      .nullable()
      .optional(),
  })
  .strict();

/** Owner edits (owners/admins). An empty headline/subhead/about goes back to the generated text. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async ({ ctx, canManage }) => {
      const { theme, color, ...edits } = patchSchema.parse(await request.json().catch(() => ({})));
      const admin = createSupabaseAdminClient();
      if (theme !== undefined || color !== undefined) {
        await updateSiteStyle(admin, companyId, { ...(theme !== undefined ? { theme } : {}), ...(color !== undefined ? { color } : {}) });
      }
      if (Object.keys(edits).length > 0) await updateSiteEdits(admin, companyId, edits);
      return NextResponse.json({ data: await siteView(ctx, companyId, canManage) });
    },
    { manage: true },
  );
}

const actionSchema = z.object({
  action: z.enum(["generate", "regenerate", "publish", "unpublish"]),
  /** generate/regenerate only: publish in the same step. */
  publish: z.boolean().optional(),
});

/** Generate / regenerate / publish / unpublish (owners/admins). */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async ({ ctx, canManage }) => {
      const body = actionSchema.parse(await request.json().catch(() => ({})));
      const admin = createSupabaseAdminClient();
      if (body.action === "generate" || body.action === "regenerate") {
        await generateSite(admin, companyId, { publish: body.publish === true });
        if (body.publish) await setSiteStatus(admin, companyId, "published", { markOwnerNotified: true });
      } else if (body.action === "publish") {
        const { data: existing } = await ctx.supabase.from("company_sites").select("id").eq("organization_id", organizationId).eq("company_id", companyId).maybeSingle();
        if (!existing) await generateSite(admin, companyId, { publish: true });
        await setSiteStatus(admin, companyId, "published", { markOwnerNotified: true });
      } else {
        await setSiteStatus(admin, companyId, "unpublished");
      }
      return NextResponse.json({ data: await siteView(ctx, companyId, canManage) });
    },
    { manage: true },
  );
}
