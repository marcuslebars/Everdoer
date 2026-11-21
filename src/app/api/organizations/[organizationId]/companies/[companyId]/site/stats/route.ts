import { NextResponse } from "next/server";

import { siteRoute } from "@/server/api/site-route";
import { loadSiteStats } from "@/server/services/dfy/site-stats";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

/** The last 30 days of the company's site: visits, call taps, quote requests (org members). */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { organizationId, companyId } = context.params;
  return siteRoute(organizationId, companyId, async ({ ctx }) => NextResponse.json({ data: await loadSiteStats(ctx, companyId) }));
}
