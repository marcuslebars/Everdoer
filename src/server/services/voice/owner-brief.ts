/**
 * The owner's brief (docs/owner-line.md → "The brief"): what the owner wants their own assistant
 * to know before they say a word — who they are, what each of their businesses is, what matters
 * this month. The owner line puts it in every call's prompt (voice/owner-line.ts).
 *
 * It is the owner's own text and it lives with their data: companies.ai_settings.owner_line.brief
 * (no new column). It is never in this repository. Written through the one ai_settings writer,
 * so it never clobbers another section. Like the rest of ai_settings, team members' sessions
 * can read the row; the app shows and changes it for owners and admins only.
 *
 * PURE apart from the loader and writer at the bottom.
 */
import { updateAiSettings, type AiSettings } from "@/server/services/front-desk/ai-settings-write";
import type { AdminClient } from "@/server/services/front-desk/contracts";

export const OWNER_LINE_SETTINGS_KEY = "owner_line";
/** Roughly a page and a half. Every call carries it, so it is kept short enough to be cheap. */
export const MAX_BRIEF_CHARS = 6000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Any value → the brief as stored, or null for "none". Plain text only: control characters go,
 * and so do `{{placeholders}}` (the shared agent's prompt is a template; a pasted placeholder
 * would be filled in by the phone system, or read out as it stands). PURE.
 */
export function cleanBrief(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\{\{[^{}\n]*\}\}/g, "")
    // The brief is fenced in the prompt (voice/owner-line.ts): it can't close its own fence.
    .replace(/<\/?owner_brief[^>]*>/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > MAX_BRIEF_CHARS ? text.slice(0, MAX_BRIEF_CHARS).trimEnd() : text;
}

/** companies.ai_settings (any shape) → the brief, or null. PURE. */
export function readOwnerBrief(aiSettings: unknown): string | null {
  return cleanBrief(record(record(aiSettings)[OWNER_LINE_SETTINGS_KEY]).brief);
}

/** The ai_settings with the brief set (or removed). Every other section is left as it was. PURE. */
export function mergeOwnerBrief(current: AiSettings, brief: unknown): AiSettings {
  const clean = cleanBrief(brief);
  const section = { ...record(current[OWNER_LINE_SETTINGS_KEY]) };
  if (clean) section.brief = clean;
  else delete section.brief;
  const next = { ...current };
  if (Object.keys(section).length > 0) next[OWNER_LINE_SETTINGS_KEY] = section;
  else delete next[OWNER_LINE_SETTINGS_KEY];
  return next;
}

type Scope = { organizationId: string; companyId: string };

/**
 * The brief for a call: the dialled business's own, else the first one found on the owner's
 * other businesses (in the order given). One owner, one brief — they shouldn't have to paste it
 * into every business. A read error reads as "no brief": it never fails a call.
 */
export async function loadOwnerBrief(admin: AdminClient, companies: Scope[]): Promise<string | null> {
  if (companies.length === 0) return null;
  try {
    const { data } = await admin
      .from("companies")
      .select("id, organization_id, ai_settings")
      .in(
        "id",
        companies.map((c) => c.companyId),
      );
    const rows = (data ?? []) as Array<{ id: string; organization_id: string; ai_settings: unknown }>;
    for (const wanted of companies) {
      const row = rows.find((r) => r.id === wanted.companyId && r.organization_id === wanted.organizationId);
      const brief = row ? readOwnerBrief(row.ai_settings) : null;
      if (brief) return brief;
    }
    return null;
  } catch (err) {
    console.error("[owner-line] could not read the brief (the call goes on without it):", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Save (or clear) one business's brief. Returns what was stored; undefined → no such company. */
export async function saveOwnerBrief(admin: AdminClient, scope: Scope, brief: unknown): Promise<string | null | undefined> {
  const written = await updateAiSettings(admin, scope, (current) => mergeOwnerBrief(current, brief));
  return written ? readOwnerBrief(written) : undefined;
}
