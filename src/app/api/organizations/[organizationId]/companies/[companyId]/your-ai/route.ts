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
import { loadOwnerBrief, MAX_BRIEF_CHARS, saveOwnerBrief } from "@/server/services/voice/owner-brief";
import { getOwnerLineConfig, ownerLineAllowed } from "@/server/services/voice/owner-line";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; companyId: string };
}

// One of: { switch, on, choice? }, { persona: { name, tone } } or { ownerBrief }.
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
    // What the owner's own assistant should know about them (voice/owner-brief.ts); null or "" clears it.
    ownerBrief: z.string().max(20_000).nullable().optional(),
  })
  .strict()
  .refine(
    (b) => {
      const kinds = [b.switch !== undefined, b.persona !== undefined, b.ownerBrief !== undefined].filter(Boolean).length;
      return kinds === 1 && (b.switch === undefined || typeof b.on === "boolean");
    },
    { message: "Send a switch with on/off, a persona, or your assistant's notes." },
  );

type Scope = { organizationId: string; companyId: string };
type Guarded = Scope & { canManage: boolean };

/**
 * The view plus the owner line's notes (docs/owner-line.md → "The brief"). `ownerLine` is null
 * unless calling your own assistant is switched on for this organization AND the viewer is an
 * owner or admin: the notes are the owner's, not the team's.
 */
async function withOwnerLine(admin: ReturnType<typeof createSupabaseAdminClient>, scope: Guarded, view: YourAiView) {
  const config = getOwnerLineConfig();
  const available = scope.canManage && config.enabled && ownerLineAllowed(config, scope.organizationId);
  return { ...view, ownerLine: available ? { brief: await loadOwnerBrief(admin, [scope]), maxChars: MAX_BRIEF_CHARS } : null };
}

async function guard(context: RouteContext, manage: boolean): Promise<Guarded> {
  const supabase = createSupabaseServerClient();
  const organization = await requireOrganizationContext(supabase, context.params.organizationId);
  const role = organization.membership.role;
  if (manage && role !== "owner" && role !== "admin") {
    throw new AuthorizationError("Only owners and admins can change what your AI does.");
  }
  const ctx: TenantServiceContext = { actorProfileId: organization.user.id, organizationId: organization.organizationId, supabase };
  // The company must be this org's (checked on the caller's own RLS client) before any service-role call.
  await assertCompanyInOrganization(ctx, context.params.companyId);
  return { organizationId: organization.organizationId, companyId: context.params.companyId, canManage: role === "owner" || role === "admin" };
}

/** "Your AI": the assistant's name and tone, and every plain-language switch with its state. */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const scope = await guard(context, false);
    const admin = createSupabaseAdminClient();
    const data = await getYourAiView(admin, scope);
    if (!data) throw new UserFacingError("Company not found.", { status: 404 });
    return NextResponse.json({ data: await withOwnerLine(admin, scope, data) });
  });
}

/**
 * Owner/admin: { switch, on, choice? } flips one switch; { persona: { name, tone } } renames;
 * { ownerBrief } saves what your own assistant should know about you (only where calling your
 * assistant is switched on).
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const scope = await guard(context, true);
    const body = await parseJsonBody(request, patchSchema);
    const admin = createSupabaseAdminClient();
    let data: YourAiView | null;
    if (body.ownerBrief !== undefined) {
      const config = getOwnerLineConfig();
      if (!config.enabled || !ownerLineAllowed(config, scope.organizationId)) throw new UserFacingError("Calling your assistant isn't switched on for this account yet.");
      if ((body.ownerBrief ?? "").trim().length > MAX_BRIEF_CHARS) throw new UserFacingError(`Keep it under ${MAX_BRIEF_CHARS.toLocaleString("en-CA")} characters.`);
      if ((await saveOwnerBrief(admin, scope, body.ownerBrief)) === undefined) throw new UserFacingError("Company not found.", { status: 404 });
      data = await getYourAiView(admin, scope);
    } else if (body.persona) {
      const name = body.persona.name ? cleanPersonaName(body.persona.name) : null;
      if (body.persona.name && !name) throw new UserFacingError("Use a first name: letters only, 2 to 20 characters.");
      data = await setYourAiPersona(admin, scope, { name, tone: body.persona.tone ?? null });
    } else {
      data = await setSwitch(admin, scope, { key: body.switch as SwitchKey, on: body.on === true, choice: body.choice });
    }
    if (!data) throw new UserFacingError("Company not found.", { status: 404 });
    return NextResponse.json({ data: await withOwnerLine(admin, scope, data) });
  });
}
