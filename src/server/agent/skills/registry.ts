/**
 * The skill registry (docs/agent-kernel.md → "Skills"): every skill, and which channels offer it.
 * Add a skill here once and it reaches the phone receptionist (receptionist-tools.ts → one Retell
 * function route) and/or the customer texting agent (sms-agent/tools.ts adapter).
 */
import { businessNotes, alertOwner, messageOwner } from "./owner";
import { myInvoices, sendInvoiceLink } from "./invoices";
import { findServices } from "./services";
import type { Skill, SkillChannel, SkillContext, SkillResult } from "./types";

export const SKILLS: Skill[] = [findServices, myInvoices, sendInvoiceLink, messageOwner, alertOwner, businessNotes];

export function skillsFor(channel: SkillChannel): Skill[] {
  return SKILLS.filter((s) => s.channels.includes(channel));
}

export function findSkill(name: string | null | undefined, channel: SkillChannel): Skill | null {
  return skillsFor(channel).find((s) => s.name === name) ?? null;
}

export const SAY_SKILL_FAILED = "I couldn't do that just now — I'll have someone from the team follow up with you.";

/** Run a skill on a channel. Never throws: an unknown skill or a failure comes back as { ok: false, say }. */
export async function runSkill(ctx: SkillContext, name: string | null | undefined, input: unknown): Promise<SkillResult> {
  const skill = findSkill(name, ctx.channel);
  if (!skill) return { ok: false, reason: "unknown_skill", say: SAY_SKILL_FAILED };
  try {
    const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    return await skill.run(ctx, args);
  } catch (err) {
    console.error(`[skills] ${skill.name} failed:`, err instanceof Error ? err.message : err);
    return { ok: false, reason: "error", say: SAY_SKILL_FAILED };
  }
}
