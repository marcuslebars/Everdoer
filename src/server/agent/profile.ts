/**
 * The agent profile's persona (companies.agent_persona, docs/agent-blueprints.md): what the
 * assistant is called and how it sounds, on every channel — the phone receptionist, sales and
 * owner-requested calls, and the customer texting agent.
 *
 * {} (the default): the phone assistant is "Everly" (DEFAULT_VOICE_NAME), the texting
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
  /**
   * What the AI calls the owner when it talks to customers ("Marcus will call you back"), or
   * null to fall back to the organization owner's profile name, then "the owner".
   */
  ownerName?: string | null;
}

/**
 * What the assistant is called until the owner names it. The app's copy uses the same word
 * (DEFAULT_ASSISTANT_NAME, src/lib/platform-brand.ts; a test keeps the two the same).
 */
export const DEFAULT_VOICE_NAME = "Everly";
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
  const ownerName = cleanPersonaName(r.ownerName);
  return {
    name: cleanPersonaName(r.name),
    tone: PERSONA_TONES.includes(r.tone as PersonaTone) ? (r.tone as PersonaTone) : null,
    // Only present when set, so a persona without one reads exactly as before.
    ...(ownerName ? { ownerName } : {}),
  };
}

/** The phone assistant's name (always set; DEFAULT_VOICE_NAME until the owner chooses one). PURE. */
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

/** "Marcus Lebars" → "Marcus"; anything that isn't a usable first name → null. PURE. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  return cleanPersonaName((fullName ?? "").trim().split(/\s+/)[0] ?? "");
}

/**
 * The owner's first name for calls: the one set on Your AI, else the organization owner's
 * profile name, else null (prompts then say "the owner"). Never throws.
 */
export async function resolveOwnerName(
  db: Pick<AdminClient, "from">,
  scope: Scope,
  persona: AgentPersona | null | undefined,
): Promise<string | null> {
  if (persona?.ownerName) return persona.ownerName;
  try {
    const { data } = await db.from("organization_memberships").select("profile_id").eq("organization_id", scope.organizationId).eq("role", "owner").limit(1).maybeSingle();
    const profileId = (data as { profile_id: string } | null)?.profile_id;
    if (!profileId) return null;
    const { data: profile } = await db.from("profiles").select("full_name").eq("id", profileId).maybeSingle();
    return firstNameOf((profile as { full_name: string | null } | null)?.full_name);
  } catch {
    return null;
  }
}

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
