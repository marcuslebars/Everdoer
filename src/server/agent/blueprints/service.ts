/**
 * Blueprints in the database (docs/agent-blueprints.md): save one from a company, find / list
 * them, apply one to a company (preview first; the previous values are stored), revert an
 * apply, and give new done-for-you tenants their trade's default blueprint.
 *
 * Writes to a company are ONE update of its row, guarded by its updated_at (optimistic lock,
 * re-planned against the fresh row on a conflict), so a change the owner makes at the same moment
 * ("pause all texts") is never overwritten. If recording the application fails, the write is
 * rolled back. Service role only (operator job, done-for-you provisioning); every company read
 * and write is pinned to organization + company.
 */
import type { Json, Tables, Updates } from "@/server/db/database.types";
import { fromJson, toJson } from "@/server/db/json";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { resyncReceptionistAgent } from "@/server/services/voice/resync";

import {
  BLUEPRINT_COLUMNS,
  NOT_NULL_COLUMNS,
  extractBlueprint,
  planBlueprint,
  readBlueprintContent,
  sameValue,
  type BlueprintColumn,
  type BlueprintContent,
  type BlueprintPlan,
  type Snapshot,
  type TargetCompany,
} from "./content";

export type BlueprintRow = Tables<"agent_blueprints">;
export type BlueprintApplicationRow = Tables<"agent_blueprint_applications">;
type Scope = { organizationId: string; companyId: string };
type CompanyRow = TargetCompany & { updated_at: string };

const WRITE_ATTEMPTS = 4;

async function loadCompanyRow(admin: AdminClient, scope: Scope): Promise<CompanyRow | null> {
  const { data, error } = await admin.from("companies").select("*").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row: Tables<"companies"> = data;
  const picked: CompanyRow = {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    brand_from_name: row.brand_from_name,
    agent_persona: row.agent_persona,
    ai_settings: row.ai_settings,
    industry_pack: row.industry_pack,
    brand_reply_phone: row.brand_reply_phone,
    brand_reply_email: row.brand_reply_email,
    brand_website_url: row.brand_website_url,
    tax_registration_number: row.tax_registration_number,
    updated_at: row.updated_at,
  };
  for (const col of BLUEPRINT_COLUMNS) picked[col] = row[col];
  return picked;
}

async function catalogKeys(admin: AdminClient, scope: Scope): Promise<string[]> {
  const { data } = await admin.from("service_catalog_items").select("service_key").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).limit(200);
  return ((data ?? []) as Array<{ service_key: string | null }>).map((r) => r.service_key).filter((k): k is string => Boolean(k));
}

async function hasBookings(admin: AdminClient, scope: Scope): Promise<boolean> {
  const { data } = await admin.from("bookings").select("id").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Column values → a typed companies update. A NULL for a NOT NULL json column writes {}. */
function companyPatch(values: Partial<Record<BlueprintColumn, unknown>>): Updates<"companies"> {
  const patch: Updates<"companies"> = {};
  for (const [k, v] of Object.entries(values) as Array<[BlueprintColumn, unknown]>) {
    if (k === "cancellation_policy_text" || k === "quote_terms_text") patch[k] = typeof v === "string" ? v : null;
    else if (k === "quote_deposit_flat_cents") patch[k] = typeof v === "number" ? v : null;
    else if (v === null || v === undefined) Object.assign(patch, { [k]: NOT_NULL_COLUMNS.has(k) ? ({} as Json) : null });
    else Object.assign(patch, { [k]: toJson(v) as Json });
  }
  return patch;
}

/**
 * One guarded update of the company row: the patch is built from the row as read, and written only
 * if updated_at hasn't moved (else re-read and rebuild, up to WRITE_ATTEMPTS). Returns what the
 * builder returned for the write that landed, or null when the builder says there's nothing to do.
 */
async function guardedCompanyWrite<T>(
  admin: AdminClient,
  scope: Scope,
  build: (row: CompanyRow) => { patch: Updates<"companies">; result: T } | null,
): Promise<T | null> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const row = await loadCompanyRow(admin, scope);
    if (!row) throw new Error("Company not found.");
    const built = build(row);
    if (!built) return null;
    const stamp = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
    const { data, error } = await admin
      .from("companies")
      .update({ ...built.patch, updated_at: stamp })
      .eq("organization_id", scope.organizationId)
      .eq("id", scope.companyId)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (error) throw error;
    if (((data ?? []) as unknown[]).length > 0) return built.result;
  }
  throw new Error("The business was being changed at the same time - nothing was applied. Try again.");
}

function personaChanged(snapshot: Snapshot): boolean {
  return snapshot.persona !== undefined;
}

/** The phone receptionist's prompt lives in Retell: rebuild it after a name / tone change. Never throws. */
async function resyncPhone(admin: AdminClient, companyId: string): Promise<void> {
  try {
    await resyncReceptionistAgent(admin, companyId);
  } catch (err) {
    console.error("[blueprints] receptionist resync failed (it updates on its next sync):", err instanceof Error ? err.message : err);
  }
}

// ── Saving + finding ──────────────────────────────────────────────────────────

/** Snapshot a company's portable AI setup as the next version of `name`. */
export async function saveBlueprintFromCompany(
  admin: AdminClient,
  input: { scope: Scope; name: string; description?: string | null; packId?: string | null; createdBy: string },
): Promise<BlueprintRow> {
  const company = await loadCompanyRow(admin, input.scope);
  if (!company) throw new Error("Company not found.");
  const content = extractBlueprint({ ...company, industry_pack: company.industry_pack });
  const { data: latest } = await admin.from("agent_blueprints").select("version").eq("name", input.name).order("version", { ascending: false }).limit(1);
  const version = (((latest ?? []) as Array<{ version: number }>)[0]?.version ?? 0) + 1;
  const { data, error } = await admin
    .from("agent_blueprints")
    .insert({
      name: input.name,
      version,
      description: input.description ?? null,
      pack_id: input.packId ?? content.industryPackId,
      source_organization_id: input.scope.organizationId,
      source_company_id: input.scope.companyId,
      content: toJson(content) as Json,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as BlueprintRow;
}

/** By id, or by name (latest version unless one is given). */
export async function findBlueprint(admin: AdminClient, ref: { id?: string; name?: string; version?: number }): Promise<BlueprintRow | null> {
  let query = admin.from("agent_blueprints").select("*");
  if (ref.id) query = query.eq("id", ref.id);
  else if (ref.name) query = ref.version ? query.eq("name", ref.name).eq("version", ref.version) : query.eq("name", ref.name);
  else return null;
  const { data, error } = await query.order("version", { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as BlueprintRow[])[0] ?? null;
}

export async function listBlueprints(admin: AdminClient): Promise<BlueprintRow[]> {
  const { data, error } = await admin.from("agent_blueprints").select("*").order("name", { ascending: true }).order("version", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as BlueprintRow[];
}

/** Make this blueprint its pack's default for new done-for-you tenants (clears the old one). */
export async function setDefaultForPack(admin: AdminClient, blueprintId: string): Promise<BlueprintRow> {
  const bp = await findBlueprint(admin, { id: blueprintId });
  if (!bp) throw new Error("Blueprint not found.");
  if (!bp.pack_id) throw new Error("This blueprint isn't tied to an industry pack.");
  await admin.from("agent_blueprints").update({ default_for_pack: false }).eq("pack_id", bp.pack_id).eq("default_for_pack", true);
  const { data, error } = await admin.from("agent_blueprints").update({ default_for_pack: true }).eq("id", bp.id).select("*").single();
  if (error) throw error;
  return data as BlueprintRow;
}

// ── Applying ──────────────────────────────────────────────────────────────────

export interface ApplyResult {
  plan: BlueprintPlan;
  /** Null on a dry run, or when nothing would change. */
  applicationId: string | null;
}

/**
 * Apply a blueprint to a company. dryRun only plans. A real apply writes persona, policy columns
 * and AI sections in one guarded update, then records the application (previous + written values)
 * for revert; if that record can't be saved, the write is rolled back.
 */
export async function applyBlueprint(
  admin: AdminClient,
  input: { blueprint: BlueprintRow; target: Scope; mode: "full" | "tuning"; appliedBy: string; dryRun: boolean; unattended?: boolean },
): Promise<ApplyResult> {
  const content = readBlueprintContent(input.blueprint.content);
  if (!content) throw new Error(`Blueprint ${input.blueprint.name} v${input.blueprint.version} has content this version can't read.`);
  const options = { mode: input.mode, catalogKeys: await catalogKeys(admin, input.target), hasBookings: await hasBookings(admin, input.target), unattended: input.unattended };

  if (input.dryRun) {
    const row = await loadCompanyRow(admin, input.target);
    if (!row) throw new Error("Target company not found.");
    return { plan: planBlueprint(content, row, options), applicationId: null };
  }

  const plan = await guardedCompanyWrite(admin, input.target, (row) => {
    const p = planBlueprint(content, row, options);
    if (p.changes.length === 0) return null;
    const patch: Updates<"companies"> = { ...companyPatch(p.columns) };
    if (Object.keys(p.aiSections).length > 0) patch.ai_settings = toJson(p.aiSettingsNext) as Json;
    if (p.persona) patch.agent_persona = toJson(Object.fromEntries(Object.entries(p.persona).filter(([, v]) => v !== null))) as Json;
    return { patch, result: p };
  });
  if (!plan) {
    const row = await loadCompanyRow(admin, input.target);
    return { plan: planBlueprint(content, row ?? { name: "", agent_persona: {}, ai_settings: {} }, options), applicationId: null };
  }

  const { data, error } = await admin
    .from("agent_blueprint_applications")
    .insert({
      blueprint_id: input.blueprint.id,
      organization_id: input.target.organizationId,
      company_id: input.target.companyId,
      mode: input.mode,
      applied_by: input.appliedBy,
      previous: toJson({ ...plan.previous, written: plan.written }) as Json,
      changes: toJson(plan.changes) as Json,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Without a record it can't be reverted: put the target back now.
    await restore(admin, input.target, plan.previous, plan.written).catch((rollbackErr) =>
      console.error("[blueprints] ROLLBACK FAILED after the application record failed:", rollbackErr instanceof Error ? rollbackErr.message : rollbackErr),
    );
    throw error ?? new Error("Couldn't record the application; the change was rolled back.");
  }
  if (personaChanged(plan.written)) await resyncPhone(admin, input.target.companyId);
  return { plan, applicationId: (data as { id: string }).id };
}

/**
 * Put `previous` back for every section / column / persona that still equals what was `written`.
 * Anything changed since is left as it is and returned as a conflict. One guarded update.
 */
async function restore(admin: AdminClient, scope: Scope, previous: Snapshot, written: Snapshot): Promise<string[]> {
  const conflicts = await guardedCompanyWrite(admin, scope, (row) => {
    const found: string[] = [];
    const patchCols: Partial<Record<BlueprintColumn, unknown>> = {};
    for (const [col, value] of Object.entries(written.columns) as Array<[BlueprintColumn, unknown]>) {
      if (sameValue(row[col], value)) patchCols[col] = previous.columns[col] ?? null;
      else found.push(col);
    }
    const patch: Updates<"companies"> = { ...companyPatch(patchCols) };
    const ai = row.ai_settings && typeof row.ai_settings === "object" && !Array.isArray(row.ai_settings) ? { ...(row.ai_settings as Record<string, unknown>) } : {};
    let aiTouched = false;
    for (const [section, value] of Object.entries(written.aiSections)) {
      if (!sameValue(ai[section], value)) {
        found.push(`ai_settings.${section}`);
        continue;
      }
      const prev = previous.aiSections[section];
      if (prev === null || prev === undefined) delete ai[section];
      else ai[section] = prev;
      aiTouched = true;
    }
    if (aiTouched) patch.ai_settings = toJson(ai) as Json;
    if (written.persona !== undefined) {
      const current = row.agent_persona && typeof row.agent_persona === "object" ? Object.fromEntries(Object.entries(row.agent_persona as Record<string, unknown>).filter(([, v]) => v !== null)) : {};
      const wrote = Object.fromEntries(Object.entries((written.persona ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null));
      if (sameValue(current, wrote)) patch.agent_persona = toJson(previous.persona ?? {}) as Json;
      else found.push("agent_persona");
    }
    if (Object.keys(patch).length === 0) return { patch: {}, result: found };
    return { patch, result: found };
  });
  return conflicts ?? [];
}

/**
 * Undo an apply: put back what the target had before, for exactly what the apply touched and only
 * where it hasn't been changed since (those are reported, not overwritten). Refused while a newer
 * apply on the same business stands, and when already reverted (claimed first, so two reverts
 * can't both run).
 */
export async function revertApplication(admin: AdminClient, applicationId: string, by: string): Promise<{ reverted: boolean; reason?: string; leftAsIs?: string[] }> {
  const { data } = await admin.from("agent_blueprint_applications").select("*").eq("id", applicationId).maybeSingle();
  const app = data as BlueprintApplicationRow | null;
  if (!app) return { reverted: false, reason: "not found" };
  if (app.reverted_at) return { reverted: false, reason: "already reverted" };
  const scope = { organizationId: app.organization_id, companyId: app.company_id };

  const { data: newer } = await admin
    .from("agent_blueprint_applications")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .is("reverted_at", null)
    .gt("applied_at", app.applied_at)
    .limit(1);
  const later = ((newer ?? []) as Array<{ id: string }>)[0];
  if (later) return { reverted: false, reason: `a newer apply (${later.id}) is still in place - revert that one first` };

  const now = new Date().toISOString();
  const { data: claimed } = await admin.from("agent_blueprint_applications").update({ reverted_at: now }).eq("id", app.id).is("reverted_at", null).select("id");
  if (((claimed ?? []) as unknown[]).length === 0) return { reverted: false, reason: "already reverted" };

  const stored = fromJson<Partial<Snapshot> & { written?: Snapshot }>(app.previous ?? {});
  const previous: Snapshot = { persona: stored.persona, aiSections: stored.aiSections ?? {}, columns: stored.columns ?? {} };
  const written: Snapshot = stored.written ?? { aiSections: {}, columns: {} };
  try {
    const leftAsIs = await restore(admin, scope, previous, written);
    if (personaChanged(written) && !leftAsIs.includes("agent_persona")) await resyncPhone(admin, scope.companyId);
    console.log(`[blueprints] application ${app.id} reverted by ${by}${leftAsIs.length ? ` (left as is: ${leftAsIs.join(", ")})` : ""}`);
    return { reverted: true, leftAsIs };
  } catch (err) {
    await admin.from("agent_blueprint_applications").update({ reverted_at: null }).eq("id", app.id);
    throw err;
  }
}

// ── New tenants ───────────────────────────────────────────────────────────────

/**
 * A new done-for-you tenant gets its trade's default blueprint: tuning only (no switches — their
 * plan decides what runs) and unattended (no prose, nothing with an unfilled placeholder). Never
 * throws: provisioning never fails over a blueprint.
 */
export async function applyDefaultBlueprintForPack(
  admin: AdminClient,
  input: { scope: Scope; packId: string | null; appliedBy: string },
): Promise<{ applied: boolean; blueprint?: string; changes?: number; reason?: string }> {
  if (!input.packId) return { applied: false, reason: "no pack" };
  try {
    const { data } = await admin.from("agent_blueprints").select("*").eq("pack_id", input.packId).eq("default_for_pack", true).limit(1);
    const bp = ((data ?? []) as BlueprintRow[])[0];
    if (!bp) return { applied: false, reason: "no default blueprint for this pack" };
    const result = await applyBlueprint(admin, { blueprint: bp, target: input.scope, mode: "tuning", appliedBy: input.appliedBy, dryRun: false, unattended: true });
    return { applied: result.applicationId !== null, blueprint: `${bp.name} v${bp.version}`, changes: result.plan.changes.length };
  } catch (err) {
    console.error("[blueprints] default blueprint failed (provisioning continues):", err instanceof Error ? err.message : err);
    return { applied: false, reason: "error" };
  }
}

export type { BlueprintContent };
