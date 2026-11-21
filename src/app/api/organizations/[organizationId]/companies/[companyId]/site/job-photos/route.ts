// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): Settings → Your website → "Add from your jobs", and the
// job sheet's "Add to website". siteRoute checks membership (owner/admin) and that the company is
// the org's on the caller's RLS client first; site-images.ts then reads that company's job photos
// and signs short-lived URLs (the job-photos bucket is private).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { z } from "zod";

import { siteRoute } from "@/server/api/site-route";
import { MAX_SITE_PHOTOS, profilePhotos, recentJobPhotosForSite } from "@/server/services/dfy/site-images";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

const query = z.object({ booking: z.string().uuid().optional() });

/** The company's latest job photos (or one job's), marked when already on the page. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async ({ ctx }) => {
      const { booking } = query.parse(Object.fromEntries(new URL(request.url).searchParams));
      const scope = { organizationId, companyId };
      const [photos, { data: site }, { data: company }] = await Promise.all([
        recentJobPhotosForSite(createSupabaseAdminClient(), scope, { bookingId: booking ?? null }),
        ctx.supabase.from("company_sites").select("id").eq("organization_id", organizationId).eq("company_id", companyId).maybeSingle(),
        ctx.supabase.from("companies").select("profile").eq("organization_id", organizationId).eq("id", companyId).maybeSingle(),
      ]);
      const used = profilePhotos((company as { profile?: unknown } | null)?.profile).length;
      return NextResponse.json({ data: { hasSite: Boolean(site), room: Math.max(0, MAX_SITE_PHOTOS - used), photos } });
    },
    { manage: true },
  );
}
