/**
 * The shared skills (agent/skills/registry.ts) as tools for the customer texting agent. A skill is
 * written once; this adapter gives it the texting turn's context:
 *
 *   - the tenant and the customer come from the conversation (the contact the texts belong to),
 *     never from the model's input;
 *   - a `link` the skill returns goes into this turn's reply (effects.links), like the agent's own
 *     link tools;
 *   - dollar amounts the skill returned are vouched for, so the reply guard lets the agent repeat
 *     them (and only those).
 *
 * Skills whose name an existing tool already uses are skipped: the texting agent's own (or an AI
 * staff role's) tool wins, e.g. the Bookkeeper's my_invoices.
 */
import { z } from "zod";

import { runSkill, skillsFor } from "@/server/agent/skills/registry";
import type { SkillContext, SkillResult } from "@/server/agent/skills/types";

import type { AgentTool, ToolResult, TurnState } from "./tools";

const MAX_LINKS = 3;

/** Every "$1,234.50" style amount anywhere in a result, in cents. PURE. */
export function amountsInResult(value: unknown, out: Set<number> = new Set()): Set<number> {
  if (typeof value === "string") {
    for (const m of value.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g)) {
      const cents = Number(m[1].replace(/,/g, "")) * 100 + Number(m[2] ?? 0);
      if (Number.isFinite(cents) && cents > 0) out.add(cents);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) amountsInResult(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) amountsInResult(v, out);
  }
  return out;
}

/** The skill context for a texting turn. PURE. */
export function smsSkillContext(state: TurnState): SkillContext {
  const name = [state.contact.first_name, state.contact.last_name].filter(Boolean).join(" ").trim();
  return {
    admin: state.admin,
    channel: "customer_sms",
    scope: { organizationId: state.facts.organizationId, companyId: state.facts.companyId },
    caller: { contactId: state.contact.id, phone: state.contact.phone, name: name || null },
    nowMs: state.services.now().getTime(),
    callId: null,
    facts: state.facts,
  };
}

/** Put what the skill returned to work in this turn: its link in the reply, its amounts allowed. */
export function applySkillResult(state: TurnState, result: SkillResult): ToolResult {
  if (typeof result.link === "string" && result.link && !state.effects.links.includes(result.link) && state.effects.links.length < MAX_LINKS) {
    state.effects.links.push(result.link);
  }
  for (const cents of amountsInResult(result)) state.effects.allowedAmountsCents.add(cents);
  return result;
}

/** The texting agent's skill tools, minus any whose name is already taken. */
export function skillAgentTools(takenNames: Iterable<string>): AgentTool<never>[] {
  const taken = new Set(takenNames);
  const tools: AgentTool<Record<string, unknown>>[] = skillsFor("customer_sms")
    .filter((skill) => !taken.has(skill.name))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      inputSchema: skill.parameters,
      parse: z.record(z.unknown()),
      async run(state: TurnState, input: Record<string, unknown>) {
        return applySkillResult(state, await runSkill(smsSkillContext(state), skill.name, input));
      },
    }));
  return tools;
}
