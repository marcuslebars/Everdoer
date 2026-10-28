import { NextResponse } from "next/server";

import { runVoiceSkill } from "@/server/services/retell/call-skills";
import { readRetellFunctionRequest } from "@/server/services/retell/functions";

export const dynamic = "force-dynamic";

/**
 * POST /api/retell/functions/skill — every phone skill (docs/agent-kernel.md → "Skills"):
 * find_services, my_invoices, send_invoice_link, message_owner, alert_owner, business_notes.
 * Retell sends { name, args, call }; the skill is picked by `name`, the tenant and caller come
 * from the trusted `call`. Gate: the shared function secret. Always answers 200 with a `say`
 * the agent can read out (Retell hands any status to the model).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await readRetellFunctionRequest(request, "skill");
  if ("response" in guard) return guard.response;
  return NextResponse.json(await runVoiceSkill(guard.data), { status: 200 });
}
