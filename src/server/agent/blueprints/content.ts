/**
 * Blueprint content (docs/agent-blueprints.md): a business's PORTABLE AI setup, captured from its
 * companies row, and the plan for applying it to another business. Pure: no DB here.
 *
 * Captured: the persona, every AI role's stored settings (companies.ai_settings sections), and the
 * policy columns the agents read (booking, visits, reviews, sales calls, digests, invoice policy,
 * cancellation / quote terms). Only keys the source actually stored are copied, so a target keeps
 * its own defaults for anything the source never set.
 *
 * Never captured (tenant-specific): emails and phone numbers anywhere, the paused-texts state,
 * plan minutes, pay calendars and payroll email, tax registration facts, tax rate and invoice
 * prefix, the payment methods the business takes (and their e-transfer / cheque details), the
 * online-booking deposit mode. In text, the source's business name (and display name), phone
 * numbers, email addresses, website links and tax numbers become placeholders filled in with the
 * target's own on apply; a setting whose placeholder the target can't fill is skipped, never sent
 * with a literal "{{business_phone}}".
 */
import { parsePersona, type AgentPersona } from "@/server/agent/profile";

export const BLUEPRINT_SCHEMA = 1 as const;
export const BUSINESS_NAME_TOKEN = "{{business_name}}";
export const BUSINESS_PHONE_TOKEN = "{{business_phone}}";
export const BUSINESS_EMAIL_TOKEN = "{{business_email}}";
export const BUSINESS_WEBSITE_TOKEN = "{{business_website}}";
export const TAX_NUMBER_TOKEN = "{{tax_number}}";

/** companies columns a blueprint carries (policy the agents read). */
export const BLUEPRINT_JSON_COLUMNS = ["booking_policy", "online_booking_settings", "visit_settings", "review_settings", "sales_call_settings", "digest", "monthly_scorecard", "invoice_settings"] as const;
export const BLUEPRINT_TEXT_COLUMNS = ["cancellation_policy_text", "quote_terms_text"] as const;
export const BLUEPRINT_NUMBER_COLUMNS = ["quote_deposit_flat_cents"] as const;
export const BLUEPRINT_COLUMNS = [...BLUEPRINT_JSON_COLUMNS, ...BLUEPRINT_TEXT_COLUMNS, ...BLUEPRINT_NUMBER_COLUMNS] as const;
export type BlueprintColumn = (typeof BLUEPRINT_COLUMNS)[number];
/** Columns that can't be NULL (a revert to "had none" writes {}). */
export const NOT_NULL_COLUMNS = new Set<BlueprintColumn>(["online_booking_settings", "visit_settings", "review_settings", "sales_call_settings", "invoice_settings"]);
/** Never replaced on a business that already has bookings: existing bookings keep their window keys. */
export const BOOKING_COLUMNS = new Set<BlueprintColumn>(["booking_policy", "online_booking_settings"]);

/** ai_settings sections never copied: runtime state, not policy. */
const SKIP_SECTIONS = new Set(["owner_pause"]);

/** Dotted paths (section.key.key / column.key) that are tenant facts, never copied. */
const SKIP_PATHS = new Set([
  "call_answering.included_minutes",
  "recruiter.payroll.csv_email",
  "recruiter.payroll.anchor_date",
  "recruiter.payroll.frequency",
  "tax_clerk.hst.registrant",
  "tax_clerk.hst.frequency",
  "tax_clerk.hst.fiscal_year_end_month",
  "tax_clerk.hst.filer",
  "tax_clerk.hst.accountant_email",
  "invoice_settings.numberPrefix",
  "invoice_settings.taxRateBps",
  "invoice_settings.acceptCard",
  "invoice_settings.acceptBankDebit",
  "invoice_settings.acceptEtransfer",
  "invoice_settings.acceptCheque",
  "invoice_settings.acceptCash",
  "invoice_settings.etransferEmail",
  "invoice_settings.etransferInstructions",
  "invoice_settings.chequePayableTo",
  "invoice_settings.chequeMailingAddress",
  "invoice_settings.copyEmail",
  "online_booking_settings.depositMode",
]);

/**
 * Values that switch something on or off without being a boolean. Tuning mode (new tenants) drops
 * them along with every boolean, so the target's plan decides what runs.
 */
const SWITCH_PATHS = new Set(["call_answering.mode", "sms_agent.autonomy", "invoice_settings.autoInvoiceOnComplete"]);

export interface BlueprintContent {
  schema: typeof BLUEPRINT_SCHEMA;
  persona: AgentPersona;
  industryPackId: string | null;
  /** ai_settings section → its stored settings (portable keys only). */
  aiSettings: Record<string, Record<string, unknown>>;
  /** Policy columns (portable keys only); absent = the source had none. */
  columns: Partial<Record<BlueprintColumn, unknown>>;
}

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]{10,18}$/;
/** Emails, NANP-style and local 7-digit phone numbers, links, and CRA business numbers inside text. */
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_IN_TEXT = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const LOCAL_PHONE_IN_TEXT = /\b\d{3}[\s.-]\d{4}\b/g;
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ca|net|org|page|io|co|biz|info)(?:\/[^\s<>"')]*)?/gi;
const TAX_NUMBER_IN_TEXT = /\b\d{9}\s?R[TP]\s?\d{4}\b|\b\d{9}\b/g;

/** A bare email address or phone number: contact data, never portable. PURE. */
export function isContactValue(v: unknown): boolean {
  return typeof v === "string" && (EMAIL_RE.test(v.trim()) || (PHONE_RE.test(v.trim()) && v.replace(/\D/g, "").length >= 10));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Text with the source's own details replaced by placeholders. PURE. */
export function genericText(text: string, names: string[]): string {
  let out = text
    .replace(EMAIL_IN_TEXT, BUSINESS_EMAIL_TOKEN)
    .replace(URL_IN_TEXT, BUSINESS_WEBSITE_TOKEN)
    .replace(TAX_NUMBER_IN_TEXT, TAX_NUMBER_TOKEN)
    .replace(PHONE_IN_TEXT, BUSINESS_PHONE_TOKEN)
    .replace(LOCAL_PHONE_IN_TEXT, BUSINESS_PHONE_TOKEN);
  // Longest name first, so "Northshore Snow Ltd" isn't half-replaced by "Northshore Snow".
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (name.trim().length >= 3) out = out.replace(new RegExp(escapeRe(name.trim()), "gi"), BUSINESS_NAME_TOKEN);
  }
  return out;
}

/** Deep copy keeping only portable values (SKIP_PATHS, bare contacts and source details out). PURE. */
export function portable(value: unknown, path: string, names: string[]): unknown {
  if (SKIP_PATHS.has(path)) return undefined;
  if (typeof value === "string") return isContactValue(value) ? undefined : genericText(value, names);
  if (Array.isArray(value)) return value.map((v) => portable(v, path, names)).filter((v) => v !== undefined);
  if (isRec(value)) {
    const out: Rec = {};
    for (const [k, v] of Object.entries(value)) {
      const kept = portable(v, `${path}.${k}`, names);
      if (kept !== undefined) out[k] = kept;
    }
    return out;
  }
  return value;
}

export interface SourceCompany {
  name: string;
  brand_from_name?: string | null;
  agent_persona: unknown;
  ai_settings: unknown;
  industry_pack: unknown;
  [column: string]: unknown;
}

/** A companies row → its blueprint content. PURE. */
export function extractBlueprint(company: SourceCompany): BlueprintContent {
  const names = [company.name, company.brand_from_name ?? ""].filter((n) => n && n.trim());
  const ai = isRec(company.ai_settings) ? company.ai_settings : {};
  const aiSettings: Record<string, Rec> = {};
  for (const [section, value] of Object.entries(ai)) {
    if (SKIP_SECTIONS.has(section) || !isRec(value)) continue;
    const kept = portable(value, section, names);
    if (isRec(kept) && Object.keys(kept).length > 0) aiSettings[section] = kept;
  }
  const columns: Partial<Record<BlueprintColumn, unknown>> = {};
  for (const col of BLUEPRINT_COLUMNS) {
    const v = company[col];
    if (v === null || v === undefined || v === "") continue;
    if (isRec(v) && Object.keys(v).length === 0) continue;
    const kept = portable(v, col, names);
    if (kept !== undefined && !(isRec(kept) && Object.keys(kept).length === 0)) columns[col] = kept;
  }
  const pack = isRec(company.industry_pack) && typeof company.industry_pack.id === "string" ? company.industry_pack.id : null;
  return { schema: BLUEPRINT_SCHEMA, persona: parsePersona(company.agent_persona), industryPackId: pack, aiSettings, columns };
}

/** Is this a blueprint we can apply? (Re-applies the skip lists, so an old snapshot can't carry them.) PURE. */
export function readBlueprintContent(raw: unknown): BlueprintContent | null {
  if (!isRec(raw) || raw.schema !== BLUEPRINT_SCHEMA) return null;
  const aiSettings: Record<string, Rec> = {};
  if (isRec(raw.aiSettings)) {
    for (const [k, v] of Object.entries(raw.aiSettings)) {
      if (!isRec(v) || SKIP_SECTIONS.has(k)) continue;
      const kept = portable(v, k, []);
      if (isRec(kept) && Object.keys(kept).length > 0) aiSettings[k] = kept;
    }
  }
  const columns: Partial<Record<BlueprintColumn, unknown>> = {};
  if (isRec(raw.columns)) {
    for (const col of BLUEPRINT_COLUMNS) {
      if (raw.columns[col] === undefined) continue;
      const kept = portable(raw.columns[col], col, []);
      if (kept !== undefined) columns[col] = kept;
    }
  }
  return { schema: BLUEPRINT_SCHEMA, persona: parsePersona(raw.persona), industryPackId: typeof raw.industryPackId === "string" ? raw.industryPackId : null, aiSettings, columns };
}

// ── Applying ──────────────────────────────────────────────────────────────────

/** Blueprint values win; keys only the target has (its own emails, tax facts…) stay. PURE. */
export function deepMerge(target: unknown, incoming: unknown): unknown {
  if (!isRec(incoming)) return incoming;
  const base: Rec = isRec(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(incoming)) base[k] = deepMerge(base[k], v);
  return base;
}

export interface TargetFacts {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
}

const TOKENS: Array<[string, keyof Omit<TargetFacts, "name">, string]> = [
  [BUSINESS_PHONE_TOKEN, "phone", "phone"],
  [BUSINESS_EMAIL_TOKEN, "email", "email"],
  [BUSINESS_WEBSITE_TOKEN, "website", "website"],
  [TAX_NUMBER_TOKEN, "taxNumber", "tax number"],
];

/** Fill the placeholders with the target's own details; the ones it doesn't have go in `missing`. PURE. */
function fillTokens(value: unknown, facts: TargetFacts, missing: Set<string>): unknown {
  if (typeof value === "string") {
    let out = value.split(BUSINESS_NAME_TOKEN).join(facts.name);
    for (const [token, key, label] of TOKENS) {
      if (!out.includes(token)) continue;
      const v = facts[key];
      if (v) out = out.split(token).join(v);
      else missing.add(label);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => fillTokens(v, facts, missing));
  if (isRec(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillTokens(v, facts, missing)]));
  return value;
}

function hasPlaceholder(v: unknown): boolean {
  const t = JSON.stringify(v ?? null);
  return TOKENS.some(([token]) => t.includes(token));
}

/** A sentence, not a setting (4+ words): left out of unattended applies. PURE. */
function isProse(v: unknown): boolean {
  return typeof v === "string" && v.trim().split(/\s+/).length >= 4;
}

/**
 * Tuning mode: no booleans at any depth (they switch things on/off), no SWITCH_PATHS values, no
 * `any_on` markers. With `noProse`, sentence-like text is dropped too. PURE.
 */
export function tuningOnly(value: unknown, path: string, noProse: boolean): unknown {
  if (SWITCH_PATHS.has(path) || typeof value === "boolean" || path.endsWith(".any_on")) return undefined;
  if (noProse && isProse(value)) return undefined;
  if (Array.isArray(value)) return noProse ? value.filter((v) => !isProse(v)) : value;
  if (isRec(value)) {
    const out: Rec = {};
    for (const [k, v] of Object.entries(value)) {
      const kept = tuningOnly(v, `${path}.${k}`, noProse);
      if (kept !== undefined && !(isRec(kept) && Object.keys(kept).length === 0)) out[k] = kept;
    }
    return out;
  }
  return value;
}

/** Leaf paths where `after` differs from `before`. PURE. */
export function changedPaths(before: unknown, after: unknown, path = ""): string[] {
  if (isRec(before) && isRec(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((k) => changedPaths(before[k], after[k], path ? `${path}.${k}` : k));
  }
  return JSON.stringify(before ?? null) === JSON.stringify(after ?? null) ? [] : [path];
}

export interface TargetCompany {
  name: string;
  agent_persona: unknown;
  ai_settings: unknown;
  brand_reply_phone?: string | null;
  brand_reply_email?: string | null;
  brand_website_url?: string | null;
  tax_registration_number?: string | null;
  [column: string]: unknown;
}

export interface Snapshot {
  persona?: unknown;
  aiSections: Record<string, unknown>;
  columns: Partial<Record<BlueprintColumn, unknown>>;
}

export interface BlueprintPlan {
  /** The persona to store, or null when it doesn't change. */
  persona: AgentPersona | null;
  /** The whole ai_settings object to write (the target's, with the merged sections). */
  aiSettingsNext: Rec;
  /** Section → its merged value (only sections that change). */
  aiSections: Record<string, Rec>;
  columns: Partial<Record<BlueprintColumn, unknown>>;
  /** The target's values before (for revert): section/column → value, null = it had none. */
  previous: Snapshot;
  /** What this apply writes (revert only puts things back where they still equal this). */
  written: Snapshot;
  changes: string[];
  /** Settings left out, with why ("review_settings: needs a phone"). */
  skipped: string[];
}

export interface PlanOptions {
  mode: "full" | "tuning";
  catalogKeys: string[];
  /** The target already has bookings: booking windows / online booking aren't replaced. */
  hasBookings: boolean;
  /** Nobody reviews this apply (new tenants): sentence-like text is left out too. */
  unattended?: boolean;
}

/**
 * What applying `content` to `target` (its CURRENT row) writes. Computed against the row it's given,
 * so the caller can write the result with an optimistic lock on that same row. PURE.
 */
export function planBlueprint(content: BlueprintContent, target: TargetCompany, options: PlanOptions): BlueprintPlan {
  const ai = isRec(target.ai_settings) ? target.ai_settings : {};
  const facts: TargetFacts = {
    name: target.name,
    phone: target.brand_reply_phone?.trim() || null,
    email: target.brand_reply_email?.trim() || null,
    website: target.brand_website_url?.trim() || null,
    taxNumber: target.tax_registration_number?.trim() || null,
  };
  const skipped: string[] = [];
  const prepare = (raw: unknown, path: string): { value: unknown } | null => {
    let v = raw;
    if (options.mode === "tuning") v = tuningOnly(v, path, options.unattended === true);
    if (v === undefined || (isRec(v) && Object.keys(v).length === 0)) return null;
    const missing = new Set<string>();
    v = fillTokens(v, facts, missing);
    if (hasPlaceholder(v)) {
      skipped.push(`${path}: the text needs the business's ${[...missing].join(", ")}, which isn't on file`);
      return null;
    }
    return { value: v };
  };

  const aiSections: Record<string, Rec> = {};
  const previous: Snapshot = { aiSections: {}, columns: {} };
  const written: Snapshot = { aiSections: {}, columns: {} };
  for (const [section, raw] of Object.entries(content.aiSettings)) {
    const prepared = prepare(raw, section);
    if (!prepared || !isRec(prepared.value)) continue;
    let incoming = prepared.value;
    if (section === "dispatch" && isRec(incoming.weather) && Array.isArray(incoming.weather.sensitive)) {
      const keys = new Set(options.catalogKeys);
      incoming = { ...incoming, weather: { ...incoming.weather, sensitive: (incoming.weather.sensitive as unknown[]).filter((k) => typeof k === "string" && keys.has(k)) } };
    }
    const merged = deepMerge(ai[section], incoming) as Rec;
    if (JSON.stringify(merged) === JSON.stringify(ai[section] ?? null)) continue;
    aiSections[section] = merged;
    previous.aiSections[section] = ai[section] ?? null;
    written.aiSections[section] = merged;
  }

  const columns: Partial<Record<BlueprintColumn, unknown>> = {};
  for (const col of BLUEPRINT_COLUMNS) {
    if (!(col in content.columns)) continue;
    if (BOOKING_COLUMNS.has(col) && options.hasBookings) {
      skipped.push(`${col}: the business already has bookings, so its booking setup isn't replaced`);
      continue;
    }
    const prepared = prepare(content.columns[col], col);
    if (!prepared) continue;
    const next = isRec(prepared.value) ? deepMerge(target[col], prepared.value) : prepared.value;
    if (JSON.stringify(next) === JSON.stringify(target[col] ?? null)) continue;
    columns[col] = next;
    previous.columns[col] = target[col] ?? null;
    written.columns[col] = next;
  }

  const currentPersona = parsePersona(target.agent_persona);
  const wants = content.persona.name !== null || content.persona.tone !== null;
  const persona = wants ? { name: content.persona.name ?? currentPersona.name, tone: content.persona.tone ?? currentPersona.tone } : null;
  const personaChanged = persona !== null && JSON.stringify(persona) !== JSON.stringify(currentPersona);
  if (personaChanged) {
    previous.persona = target.agent_persona ?? {};
    written.persona = persona;
  }

  const changes = [
    ...(personaChanged ? changedPaths(currentPersona, persona, "agent_persona") : []),
    ...Object.keys(aiSections).flatMap((s) => changedPaths(ai[s], aiSections[s], `ai_settings.${s}`)),
    ...Object.keys(columns).flatMap((c) => changedPaths(target[c], columns[c as BlueprintColumn], c)),
  ];
  return { persona: personaChanged ? persona : null, aiSettingsNext: { ...ai, ...aiSections }, aiSections, columns, previous, written, changes, skipped };
}

/** Deep equality for stored JSON. PURE. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
