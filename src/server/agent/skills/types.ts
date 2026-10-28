/**
 * Skills: abilities written ONCE and offered on every channel they make sense on
 * (docs/agent-kernel.md → "Skills"). The phone receptionist reaches them through one Retell
 * function route (/api/retell/functions/skill); the customer texting agent gets them as tools.
 *
 * A skill gets a SkillContext the channel built from TRUSTED data only: the tenant (from the
 * call / the conversation, never from the model), and the caller (the contact matched by their
 * phone number — caller ID on a call, the texting number on SMS). The model only supplies `input`.
 */
import type { BusinessFacts } from "@/server/services/sms-agent/facts";
import type { createSupabaseAdminClient } from "@/server/supabase/admin";

export type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type SkillChannel = "customer_sms" | "voice";

export interface SkillCaller {
  /** The contact matched by the caller's number in this company, or null for a new caller. */
  contactId: string | null;
  /** E.164 caller ID / texting number. */
  phone: string | null;
  name: string | null;
}

export interface SkillContext {
  admin: AdminClient;
  channel: SkillChannel;
  scope: { organizationId: string; companyId: string };
  caller: SkillCaller;
  nowMs: number;
  /** The Retell call id (voice) — for once-per-call limits. */
  callId?: string | null;
  /** Already loaded by the channel (SMS); skills load it themselves when absent. */
  facts?: BusinessFacts | null;
}

/** What a skill returns to the model. `say` is a sentence a voice agent can read out as is. */
export interface SkillResult {
  [key: string]: unknown;
  ok: boolean;
  say?: string;
  /** A link the customer should get in the SMS reply (the SMS adapter adds it to the turn). */
  link?: string;
}

export interface Skill {
  name: string;
  /** For the model: what it does and when to use it. */
  description: string;
  /** JSON Schema of the input. */
  parameters: Record<string, unknown>;
  channels: SkillChannel[];
  /** Voice tool options (what to say while it runs, timeout). */
  voice?: { speakDuring?: string; timeoutMs?: number };
  run(ctx: SkillContext, input: Record<string, unknown>): Promise<SkillResult>;
}

export function str(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
