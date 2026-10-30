/**
 * Give every business the starter automations it should have had (migration
 * 20261031100000_workflows_slug_per_company.sql). Until that migration, a second business in an
 * organization couldn't get them: automation slugs were unique per organization, so the install
 * failed silently for every business after the first.
 *
 *   npm run job:install-missing-recipes              # dry run: which businesses miss which
 *   npm run job:install-missing-recipes -- --apply   # install them
 *
 * Anything that texts or emails customers is installed as a DRAFT ("review the messages, then turn
 * it on"), so no business starts messaging people because of this job; owner alerts and tasks are
 * installed at their normal status. Archived businesses are skipped. Re-runnable.
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import { ALL_RECIPES } from "@/server/services/workflow-engine/recipes";
import { installRecipes } from "@/server/services/workflow-engine/recipes/install";

export interface MissingRecipesRow {
  organizationId: string;
  companyId: string;
  company: string;
  missing: string[];
}

/** Non-archived businesses and the starter automations each one is missing. */
export async function findMissingRecipes(admin: AdminClient): Promise<MissingRecipesRow[]> {
  const { data: companies, error } = await admin.from("companies").select("id, organization_id, name, stage").neq("stage", "archived").limit(1000);
  if (error) throw error;
  const rows: MissingRecipesRow[] = [];
  for (const c of (companies ?? []) as Array<{ id: string; organization_id: string; name: string }>) {
    const { data: wf, error: wfError } = await admin.from("workflows").select("slug").eq("organization_id", c.organization_id).eq("company_id", c.id);
    if (wfError) throw wfError;
    const have = new Set(((wf ?? []) as Array<{ slug: string }>).map((w) => w.slug));
    const missing = ALL_RECIPES.map((r) => r.slug).filter((s) => !have.has(s));
    if (missing.length > 0) rows.push({ organizationId: c.organization_id, companyId: c.id, company: c.name, missing });
  }
  return rows;
}

export async function runInstallMissingRecipes(admin: AdminClient, apply: boolean, log: (line: string) => void = console.log): Promise<number> {
  const rows = await findMissingRecipes(admin);
  if (rows.length === 0) {
    log("Every business has its starter automations.");
    return 0;
  }
  let failed = 0;
  for (const row of rows) {
    if (!apply) {
      log(`${row.company}: missing ${row.missing.length} (${row.missing.join(", ")})`);
      continue;
    }
    try {
      const result = await installRecipes({ organizationId: row.organizationId, actorProfileId: null, supabase: admin }, row.companyId, { forceDraftCustomerFacing: true });
      const drafts = result.installed.filter((r) => r.status === "draft").length;
      log(`${row.company}: installed ${result.installed.length} (${drafts} as drafts to review)`);
    } catch (err) {
      failed += 1;
      log(`${row.company}: FAILED - ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!apply) log("\n(dry run - pass --apply to install; customer-facing ones go in as drafts)");
  return failed > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith("install-missing-recipes.ts")) {
  runInstallMissingRecipes(createSupabaseAdminClient(), process.argv.includes("--apply"))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("[install-missing-recipes] FAILED:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
