// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): the wizard's "Your AI" step (services/onboarding-ai.ts).
// Membership (owner/admin for writes) and company-in-org are checked on the caller's RLS client
// FIRST; only then is that one company read/written with the service role.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute, parseJsonBody } from "@/server/api/route";
import { cleanPersonaName } from "@/server/agent/profile";
import { UserFacingError } from "@/server/errors";
import { AuthorizationError, requireOrganizationContext, ValidationError } from "@/server/organizations/context";
import { recordOnboardingEvent, upsertOnboardingStep } from "@/server/services/onboarding";
import { getYourAiStep, setUpYourAi } from "@/server/services/onboarding-ai";
import { assertCompanyInOrganization, type TenantServiceContext } from "@/server/services/shared";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string };
}

async function guard(context: RouteContext, companyId: string, manage: boolean): Promise<TenantServiceContext> {
  const supabase = createSupabaseServerClient();
  const organization = await requireOrganizationContext(supabase, context.params.organizationId);
  const role = organization.membership.role;
  if (manage && role !== "owner" && role !== "admin") throw new AuthorizationError("Only owners and admins can set up your AI.");
  const ctx: TenantServiceContext = { actorProfileId: organization.user.id, organizationId: organization.organizationId, supabase };
  await assertCompanyInOrganization(ctx, companyId);
  return ctx;
}

/** The assistant's current name / tone / switches + what's still missing for it to work. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId || !z.string().uuid().safeParse(companyId).success) throw new ValidationError("companyId is required.");
    const ctx = await guard(context, companyId, false);
    const data = await getYourAiStep(createSupabaseAdminClient(), { organizationId: ctx.organizationId, companyId });
    if (!data) throw new UserFacingError("Company not found.", { status: 404 });
    return NextResponse.json({ data });
  });
}

const bodySchema = z
  .object({
    companyId: z.string().uuid(),
    name: z.string().trim().max(20).nullable(),
    tone: z.enum(["friendly", "professional", "casual"]).nullable(),
    autonomy: z.enum(["ask_first", "standard"]),
  })
  .strict();

/** Owner/admin: name + tone, the trade's defaults, texts + calls on. Completes the step. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await parseJsonBody(request, bodySchema);
    const ctx = await guard(context, body.companyId, true);
    const name = body.name ? cleanPersonaName(body.name) : null;
    if (body.name && !name) throw new UserFacingError("Use a first name: letters only, 2 to 20 characters.");

    await recordOnboardingEvent(ctx, { companyId: body.companyId, step: "ai", event: "start" });
    try {
      const result = await setUpYourAi(createSupabaseAdminClient(), { organizationId: ctx.organizationId, companyId: body.companyId }, { name, tone: body.tone, autonomy: body.autonomy });
      if (!result) throw new UserFacingError("Company not found.", { status: 404 });
      await upsertOnboardingStep(ctx, body.companyId, "ai", {
        completed: true,
        data: { name, tone: body.tone, autonomy: body.autonomy, blueprint: result.blueprint.blueprint ?? null },
      });
      await recordOnboardingEvent(ctx, { companyId: body.companyId, step: "ai", event: "complete", metadata: { autonomy: body.autonomy, blueprint: result.blueprint.applied } });
      return NextResponse.json({ data: result });
    } catch (err) {
      await recordOnboardingEvent(ctx, { companyId: body.companyId, step: "ai", event: "error", metadata: { message: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
  });
}
