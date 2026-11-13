import { NextResponse } from "next/server";

import { readRetellFunctionRequest } from "@/server/services/retell/functions";
import { createRetellAdminClient } from "@/server/services/retell/tenant";
import { runOwnerLineTool } from "@/server/services/voice/owner-line";

export const dynamic = "force-dynamic";

/**
 * POST /api/retell/functions/owner-line — the owner agent's tools (docs/owner-line.md):
 * `business` and `web_lookup`. Retell sends { name, args, call }; the tool is picked by `name`,
 * the company comes from the call's signed metadata and the caller must still be that company's
 * verified owner number. Gate: the shared function secret. Always answers 200 with a `say` the
 * assistant can read out (Retell hands any status to the model).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await readRetellFunctionRequest<Record<string, unknown>>(request, "owner-line");
  if ("response" in guard) return guard.response;
  return NextResponse.json(await runOwnerLineTool(createRetellAdminClient(), guard.data), { status: 200 });
}
