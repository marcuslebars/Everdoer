import { NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute, parseJsonBody } from "@/server/api/route";
import { AuthorizationError, requireOrganizationContext, ValidationError } from "@/server/organizations/context";
import { recordOnboardingEvent } from "@/server/services/onboarding";
import { getBusinessNumberStatus, setUpBusinessNumber } from "@/server/services/onboarding-number";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string };
}

/** The company's number, who answers it, and whether forwarding is verified. Members. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = createSupabaseServerClient();
    const organization = await requireOrganizationContext(supabase, context.params.organizationId);
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId || !z.string().uuid().safeParse(companyId).success) throw new ValidationError("companyId is required.");
    const data = await getBusinessNumberStatus({ actorProfileId: organization.user.id, organizationId: organization.organizationId, supabase }, companyId);
    return NextResponse.json({ data });
  });
}

const bodySchema = z.object({
  companyId: z.string().uuid(),
  areaCode: z.number().int().min(200).max(999).optional(),
  attachNumber: z.string().max(40).optional(),
});

/**
 * The Phone step: one number for everything (src/server/services/onboarding-number.ts). Buys
 * (or re-checks) the company's local number — customers text it, missed calls forward to it,
 * and the AI answers them at the plan's level. Idempotent. Owner/admin only (it buys a number).
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = createSupabaseServerClient();
    const organization = await requireOrganizationContext(supabase, context.params.organizationId);
    if (!["owner", "admin"].includes(organization.membership.role)) {
      throw new AuthorizationError("Admin access is required to set up your number.");
    }
    const ctx = { actorProfileId: organization.user.id, organizationId: organization.organizationId, supabase };
    const body = await parseJsonBody(request, bodySchema);

    await recordOnboardingEvent(ctx, { companyId: body.companyId, step: "phone", event: "start", metadata: { setup: "one_number" } });
    try {
      const result = await setUpBusinessNumber(ctx, {
        companyId: body.companyId,
        areaCode: body.areaCode ?? null,
        attachNumber: body.attachNumber ?? null,
      });
      await recordOnboardingEvent(ctx, {
        companyId: body.companyId,
        step: "phone",
        event: "complete",
        metadata: { setup: "one_number", answering: result.answering, receptionist: result.receptionist.status },
      });
      return NextResponse.json({
        data: {
          phoneNumber: result.number.phoneNumber,
          phoneNumberPretty: result.number.phoneNumberPretty,
          purchased: result.number.purchased,
          instructions: result.number.instructions,
          answering: result.answering,
          receptionist: result.receptionist.status,
          answeringTurnedOn: result.answeringTurnedOn,
        },
      });
    } catch (err) {
      await recordOnboardingEvent(ctx, {
        companyId: body.companyId,
        step: "phone",
        event: "error",
        metadata: { setup: "one_number", message: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  });
}
