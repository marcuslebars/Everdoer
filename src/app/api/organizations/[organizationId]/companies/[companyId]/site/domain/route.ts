// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): Settings → Your website → your own domain. siteRoute
// checks membership (owner/admin to change) and that the company is the org's on the caller's
// RLS client first; services/dfy/site-domain.ts then writes that one company's site row.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { z } from "zod";

import { siteRoute } from "@/server/api/site-route";
import { checkSiteDomain, connectSiteDomain, removeSiteDomain } from "@/server/services/dfy/site-domain";
import { siteView } from "@/server/services/dfy/site-view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

const connectSchema = z.object({ domain: z.string().min(1).max(300) }).strict();

/** Connect the business's domain. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async ({ ctx, canManage }) => {
      const body = connectSchema.parse(await request.json().catch(() => ({})));
      await connectSiteDomain(createSupabaseAdminClient(), { organizationId, companyId }, body.domain);
      return NextResponse.json({ data: await siteView(ctx, companyId, canManage) });
    },
    { manage: true },
  );
}

/** Check now whether DNS is in place. */
export async function PATCH(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async ({ ctx, canManage }) => {
      await checkSiteDomain(createSupabaseAdminClient(), { organizationId, companyId });
      return NextResponse.json({ data: await siteView(ctx, companyId, canManage) });
    },
    { manage: true },
  );
}

/** Disconnect the domain. */
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(
    organizationId,
    companyId,
    async ({ ctx, canManage }) => {
      await removeSiteDomain(createSupabaseAdminClient(), { organizationId, companyId });
      return NextResponse.json({ data: await siteView(ctx, companyId, canManage) });
    },
    { manage: true },
  );
}
