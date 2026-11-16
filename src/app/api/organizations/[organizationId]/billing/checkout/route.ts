import { NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute, parseJsonBody } from "@/server/api/route";
import { UserFacingError } from "@/server/errors";
import { requireOrganizationContext } from "@/server/organizations/context";
import { createCheckoutSession } from "@/server/services/billing/checkout";
import { planChoicesFor } from "@/server/services/billing/config";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    organizationId: string;
  };
}

const bodySchema = z.object({
  cancelUrl: z.string().url().optional(),
  plan: z.enum(["launch", "operate", "front_desk"]),
  successUrl: z.string().url().optional(),
});

/**
 * Internal (member-authenticated) route to create a Stripe Checkout session — no
 * customer-facing UI in Phase 1, this exists to drive the test-mode flow. Authz
 * is org membership via the RLS server client; the privileged billing write runs
 * on the service-role admin client inside createCheckoutSession.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = createSupabaseServerClient();
    await requireOrganizationContext(supabase, context.params.organizationId);
    const body = await parseJsonBody(request, bodySchema);

    // Only a plan this org is shown on its billing page: the plans on offer, or its own plan.
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("plan")
      .eq("id", context.params.organizationId)
      .single();
    if (orgError) {
      throw orgError;
    }
    if (!planChoicesFor(organization.plan).includes(body.plan)) {
      throw new UserFacingError("That plan isn't available any more. Pick one of the plans on your billing page.", {
        status: 400,
        code: "plan_not_offered",
      });
    }

    const result = await createCheckoutSession(createSupabaseAdminClient(), {
      cancelUrl: body.cancelUrl,
      organizationId: context.params.organizationId,
      plan: body.plan,
      successUrl: body.successUrl,
    });

    return NextResponse.json({ data: result });
  });
}
