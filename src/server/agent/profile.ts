/**
 * The agent profile's persona (companies.agent_persona, docs/agent-blueprints.md): what the
 * assistant is called and how it sounds, on every channel — the phone receptionist, sales and
 * owner-requested calls, and the customer texting agent.
 *
 * {} (the default) keeps today's behaviour exactly: the phone assistant is "Marina", the texting
 * agent has no name, and each prompt keeps its built-in tone line.
 */
import type { Json } from "@/server/db/database.types";
import { toJson } from "@/server/db/json";
import type { AdminClient } from "@/server/services/front-desk/contracts";

export type PersonaTone = "friendly" | "professional" | "casual";
export const PERSONA_TONES: readonly PersonaTone[] = ["friendly", "professional", "casual"];

export interface AgentPersona {
  /** The assistant's first name ("Sam"), or null for the default. */
  name: string | null;
  /** null = each prompt's built-in tone. */
  tone: PersonaTone | null;
}

export const DEFAULT_VOICE_NAME = "Marina";
export const EMPTY_PERSONA: AgentPersona = { name: null, tone: null };

/** A first name: letters (accents ok), apostrophe or hyphen, 2–20 characters. */
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]{1,19}$/;

/** "  sam " → "Sam"; anything that isn't a plain first name → null. PURE. */
export function cleanPersonaName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!NAME_RE.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Any stored value → a valid persona. PURE. */
export function parsePersona(raw: unknown): AgentPersona {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    name: cleanPersonaName(r.name),
    tone: PERSONA_TONES.includes(r.tone as PersonaTone) ? (r.tone as PersonaTone) : null,
  };
}

/** The phone assistant's name (always set; "Marina" by default). PURE. */
export function voiceName(persona: AgentPersona | null | undefined): string {
  return persona?.name ?? DEFAULT_VOICE_NAME;
}

/** The tone instruction for a prompt, or null to keep the prompt's built-in line. PURE. */
export function toneLine(persona: AgentPersona | null | undefined): string | null {
  switch (persona?.tone) {
    case "friendly":
      return "Be warm, friendly and concise.";
    case "professional":
      return "Be polite, professional and concise. No slang, no emoji.";
    case "casual":
      return "Keep it relaxed, plain-spoken and upbeat, like a friendly local tradesperson. Still concise.";
    default:
      return null;
  }
}

type Scope = { organizationId: string; companyId: string };

/** A company's persona; a lookup error reads as the default (never fails a prompt). */
export async function loadPersona(admin: AdminClient, scope: Scope): Promise<AgentPersona> {
  try {
    const { data } = await admin.from("companies").select("agent_persona").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
    return parsePersona((data as { agent_persona: Json } | null)?.agent_persona ?? null);
  } catch {
    return EMPTY_PERSONA;
  }
}

export async function savePersona(admin: AdminClient, scope: Scope, persona: AgentPersona): Promise<AgentPersona> {
  const clean = parsePersona(persona);
  const stored = Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== null));
  const { error } = await admin.from("companies").update({ agent_persona: toJson(stored) as Json }).eq("organization_id", scope.organizationId).eq("id", scope.companyId);
  if (error) throw error;
  return clean;
}
