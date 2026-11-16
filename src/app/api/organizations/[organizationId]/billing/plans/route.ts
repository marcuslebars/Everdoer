import { NextResponse } from "next/server";

import { handleRoute } from "@/server/api/route";
import { requireOrganizationContext } from "@/server/organizations/context";
import { planChoicesFor } from "@/server/services/billing/config";
import { listPlanPricing } from "@/server/services/billing/plans";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    organizationId: string;
  };
}

/**
 * Member-authenticated read of live plan pricing from Stripe (amount, currency,
 * interval, optional setup fee) plus each plan's feature matrix. Powers the
 * billing page's plan-comparison cards: the plans on offer, plus the org's own plan if that one
 * is no longer sold (planChoicesFor).
 */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = createSupabaseServerClient();
    await requireOrganizationContext(supabase, context.params.organizationId);
    const { data: organization, error } = await supabase
      .from("organizations")
      .select("plan")
      .eq("id", context.params.organizationId)
      .single();
    if (error) {
      throw error;
    }
    const data = await listPlanPricing(planChoicesFor(organization.plan));
    return NextResponse.json({ data });
  });
}
