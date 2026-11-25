// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): "Call with Everly" with the owner's instructions
// (docs/sales-calls.md → "Calls with your instructions"). The route checks org membership
// (owner/admin to place or cancel) and that the contact is visible on the caller's RLS client
// FIRST, taking its company from that row; only then does sales-calls/app-request.ts read and
// write that one organization + company with the service role (sales_calls and call_consents are
// service-role-writable only).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/server/api/route";
import { AuthorizationError, requireOrganizationContext, ValidationError } from "@/server/organizations/context";
import { cancelAiCallFromApp, getAiCallView, requestAiCallFromApp, type AiCallScope } from "@/server/services/sales-calls/app-request";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { organizationId: string; contactId: string };
}

/**
 * "Have the AI call" on a contact (docs/sales-calls.md → "Calls with your instructions"):
 * GET the panel (availability, consent, recent AI calls), POST a call with the owner's
 * instructions, DELETE ?id= a call that hasn't been dialed yet. Owners and admins only.
 */
async function guard(context: RouteContext, manage: boolean): Promise<{ scope: AiCallScope; profileId: string; label: string }> {
  const supabase = createSupabaseServerClient();
  const organization = await requireOrganizationContext(supabase, context.params.organizationId);
  const role = organization.membership.role;
  if (manage && role !== "owner" && role !== "admin") throw new AuthorizationError("Only owners and admins can have the AI call customers.");
  // The contact must be visible to this user (their own RLS client) before any service-role call.
  const { data } = await supabase.from("contacts").select("id, company_id").eq("organization_id", organization.organizationId).eq("id", context.params.contactId).maybeSingle();
  const contact = data as { id: string; company_id: string } | null;
  if (!contact) throw new ValidationError("Contact not found.");
  const label = organization.profile?.full_name?.trim() || organization.profile?.email || organization.user.email || "A team member";
  return { scope: { organizationId: organization.organizationId, companyId: contact.company_id }, profileId: organization.user.id, label };
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { scope } = await guard(context, false);
    return NextResponse.json({ data: await getAiCallView(createSupabaseAdminClient(), scope, context.params.contactId) });
  });
}

const requestSchema = z.object({
  instructions: z.string().max(4000),
  when: z.string().max(40).nullable().optional(),
  customerAsked: z.boolean().optional(),
});

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const guarded = await guard(context, true);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Tell the AI what to do on the call.");
    const result = await requestAiCallFromApp(
      createSupabaseAdminClient(),
      guarded.scope,
      context.params.contactId,
      { instructions: parsed.data.instructions, when: parsed.data.when ?? null, customerAsked: parsed.data.customerAsked === true },
      { profileId: guarded.profileId, label: guarded.label },
    );
    return NextResponse.json({ data: { status: result.status, message: result.message, salesCallId: result.salesCallId, runAt: new Date(result.runAtMs).toISOString() } });
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { scope } = await guard(context, true);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError("Which call?");
    const cancelled = await cancelAiCallFromApp(createSupabaseAdminClient(), scope, context.params.contactId, id);
    if (!cancelled) throw new ValidationError("That call already went out, or it isn't waiting any more.");
    return NextResponse.json({ data: { cancelled: true } });
  });
}
