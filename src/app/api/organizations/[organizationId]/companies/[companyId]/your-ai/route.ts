// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): "Your AI" (docs/your-ai.md). The route checks org
// membership (owner/admin for writes) and that the company belongs to the org on the caller's
// RLS client FIRST; only then does it read/write that one company with the service role
// (companies.ai_settings is not client-writable), through services/your-ai/switches.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute, parseJsonBody } from "@/server/api/route";
import { UserFacingError } from "@/server/errors";
import { cleanPersonaName } from "@/server/agent/profile";
import { AuthorizationError, requireOrganizationContext } from "@/server/organizations/context";
import { assertCompanyInOrganization, type TenantServiceContext } from "@/server/services/shared";
import { SWITCH_KEYS, getYourAiView, setSwitch, setYourAiPersona, type SwitchKey, type YourAiView } from "@/server/services/your-ai/switches";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

// One of: { switch, on, choice? } or { persona: { name, tone } }.
const patchSchema = z
  .object({
    switch: z.enum(SWITCH_KEYS).optional(),
    on: z.boolean().optional(),
    choice: z.enum(["standard", "ask_first"]).optional(),
    persona: z
      .object({
        name: z.string().trim().max(20).nullable(),
        tone: z.enum(["friendly", "professional", "casual"]).nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => (b.switch !== undefined && typeof b.on === "boolean" && !b.persona) || (b.persona && b.switch === undefined), {
    message: "Send a switch with on/off, or a persona.",
  });

async function guard(context: RouteContext, manage: boolean): Promise<{ organizationId: string; companyId: string }> {
  const supabase = createSupabaseServerClient();
  const organization = await requireOrganizationContext(supabase, context.params.organizationId);
  const role = organization.membership.role;
  if (manage && role !== "owner" && role !== "admin") {
    throw new AuthorizationError("Only owners and admins can change what your AI does.");
  }
  const ctx: TenantServiceContext = { actorProfileId: organization.user.id, organizationId: organization.organizationId, supabase };
  // The company must be this org's (checked on the caller's own RLS client) before any service-role call.
  await assertCompanyInOrganization(ctx, context.params.companyId);
  return { organizationId: organization.organizationId, companyId: context.params.companyId };
}

/** "Your AI": the assistant's name and tone, and every plain-language switch with its state. */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const scope = await guard(context, false);
    const data = await getYourAiView(createSupabaseAdminClient(), scope);
    if (!data) throw new UserFacingError("Company not found.", { status: 404 });
    return NextResponse.json({ data });
  });
}

/** Owner/admin: { switch, on, choice? } flips one switch; { persona: { name, tone } } renames. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const scope = await guard(context, true);
    const body = await parseJsonBody(request, patchSchema);
    const admin = createSupabaseAdminClient();
    let data: YourAiView | null;
    if (body.persona) {
      const name = body.persona.name ? cleanPersonaName(body.persona.name) : null;
      if (body.persona.name && !name) throw new UserFacingError("Use a first name: letters only, 2 to 20 characters.");
      data = await setYourAiPersona(admin, scope, { name, tone: body.persona.tone ?? null });
    } else {
      data = await setSwitch(admin, scope, { key: body.switch as SwitchKey, on: body.on === true, choice: body.choice });
    }
    if (!data) throw new UserFacingError("Company not found.", { status: 404 });
    return NextResponse.json({ data });
  });
}
