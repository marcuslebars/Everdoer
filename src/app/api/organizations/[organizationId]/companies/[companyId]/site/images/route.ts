// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): Settings → Your website → logo, photos, tab icon.
// siteRoute checks membership (owner/admin to change) and that the company is the org's on the
// caller's RLS client first; services/dfy/site-images.ts then writes that one company.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { z } from "zod";

import { siteRoute } from "@/server/api/site-route";
import { SITE_IMAGE_KINDS, createSiteImageUpload, makeCoverPhoto, removeSiteImage, saveSiteImage } from "@/server/services/dfy/site-images";
import { siteView } from "@/server/services/dfy/site-view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

const uploadSchema = z.object({ kind: z.enum(SITE_IMAGE_KINDS) }).strict();

/** A signed upload URL for one new image; the browser uploads it straight to storage. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async () => {
      const body = uploadSchema.parse(await request.json().catch(() => ({})));
      const data = await createSiteImageUpload(createSupabaseAdminClient(), { organizationId, companyId }, body.kind);
      return NextResponse.json({ data });
    },
    { manage: true },
  );
}

const changeSchema = z
  .object({
    action: z.enum(["save", "remove", "cover"]),
    kind: z.enum(SITE_IMAGE_KINDS),
    path: z.string().max(300).optional(),
    url: z.string().url().max(2000).optional(),
  })
  .strict();

/** save (after the upload), remove, or make a photo the cover. Returns the refreshed view. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async ({ ctx, canManage }) => {
      const body = changeSchema.parse(await request.json().catch(() => ({})));
      const admin = createSupabaseAdminClient();
      const scope = { organizationId, companyId };
      if (body.action === "save") await saveSiteImage(admin, scope, body.kind, body.path ?? "");
      else if (body.action === "remove") await removeSiteImage(admin, scope, body.kind, body.url);
      else await makeCoverPhoto(admin, scope, body.url ?? "");
      return NextResponse.json({ data: await siteView(ctx, companyId, canManage) });
    },
    { manage: true },
  );
}
