/**
 * Calls TO Everdoer's own number (the callback's caller ID — docs/sales-calls.md → Everdoer's own
 * callback). Retell's inbound webhook hands the call to the shared sales agent with Everly's
 * Everdoer prompt (buildEverdoerInboundPrompt) instead of the number's generic receptionist, so a
 * prospect calling back gets the same demo and the same rules as the call-back.
 *
 * The tools still find the company from the number dialled (retell/functions.ts), and the call
 * is filed like any other inbound call (lead, owner summary text). Null = answer as usual: not
 * the callback company, sales calls not set up, or anything failing.
 */
import { listNotes } from "@/server/agent/memory";
import { parsePersona } from "@/server/agent/profile";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { ctxFor } from "@/server/services/owner-channel/common";
import { loadCompanyFacts } from "@/server/services/voice/company-facts";
import { salesAgentId } from "@/server/services/voice/sales-agent";

import { buildEverdoerInboundPrompt, isEverdoerCallbackCompany } from "./everdoer-callback";

export interface EverdoerInboundOverride {
  override_agent_id: string;
  dynamic_variables: Record<string, string>;
  metadata: Record<string, string>;
}

export async function everdoerInboundOverride(
  admin: AdminClient,
  input: { organizationId: string | null; companyId: string | null; callerName: string | null },
  deps: { agentId?: string | null; env?: Record<string, string | undefined> } = {},
): Promise<EverdoerInboundOverride | null> {
  const { organizationId, companyId } = input;
  if (!organizationId || !companyId || !isEverdoerCallbackCompany(companyId, deps.env)) return null;
  const agentId = deps.agentId === undefined ? salesAgentId() : deps.agentId;
  if (!agentId) return null;
  try {
    const ctx = ctxFor(admin, organizationId);
    const [facts, notes] = await Promise.all([loadCompanyFacts(ctx, companyId), listNotes(admin, { organizationId, companyId }, { limit: 20 })]);
    const prompt = buildEverdoerInboundPrompt({
      callerName: input.callerName,
      services: facts.services,
      // Oldest first: the order they were written in (listNotes returns newest first).
      notes: notes.map((n) => n.body).reverse(),
      persona: parsePersona(facts.company?.agent_persona),
    });
    return { override_agent_id: agentId, dynamic_variables: { system_prompt: prompt, company_name: facts.companyName ?? "Everdoer" }, metadata: {} };
  } catch (err) {
    console.error("[everdoer-inbound] couldn't build Everly's prompt (answering as usual):", err instanceof Error ? err.message : err);
    return null;
  }
}
