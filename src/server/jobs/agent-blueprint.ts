/**
 * Agent blueprints, operator side (docs/agent-blueprints.md). Run with the production env
 * (e.g. `railway run --service Everdoer -- npm run job:agent-blueprint -- …`).
 *
 *   list
 *   save --company <companyId> --name "Snow pro" [--description "…"] [--pack <packId>]
 *   show --name "Snow pro" [--version 2]
 *   apply --name "Snow pro" [--version 2] --company <companyId> [--mode full|tuning] [--apply]
 *        (a dry run that prints every change unless --apply)
 *   revert --application <applicationId>
 *   set-default --name "Snow pro" [--version 2]   (new done-for-you tenants of its pack get it)
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { AdminClient } from "@/server/services/front-desk/contracts";
import {
  applyBlueprint,
  findBlueprint,
  listBlueprints,
  revertApplication,
  saveBlueprintFromCompany,
  setDefaultForPack,
} from "@/server/agent/blueprints/service";
import { readBlueprintContent } from "@/server/agent/blueprints/content";

const OPERATOR = "operator_job";

export interface BlueprintArgs {
  command: string;
  company: string | null;
  name: string | null;
  version: number | null;
  description: string | null;
  pack: string | null;
  mode: "full" | "tuning";
  application: string | null;
  apply: boolean;
}

/** argv → args. PURE. */
export function parseBlueprintArgs(argv: string[]): BlueprintArgs {
  const value = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };
  const version = value("--version");
  return {
    command: argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1]?.startsWith("--") !== true) ?? "list",
    company: value("--company"),
    name: value("--name"),
    version: version && /^\d+$/.test(version) ? Number(version) : null,
    description: value("--description"),
    pack: value("--pack"),
    mode: value("--mode") === "tuning" ? "tuning" : "full",
    application: value("--application"),
    apply: argv.includes("--apply"),
  };
}

async function scopeOf(admin: AdminClient, companyId: string): Promise<{ organizationId: string; companyId: string; name: string }> {
  const { data } = await admin.from("companies").select("id, organization_id, name").eq("id", companyId).maybeSingle();
  const row = data as { id: string; organization_id: string; name: string } | null;
  if (!row) throw new Error(`Company ${companyId} not found.`);
  return { organizationId: row.organization_id, companyId: row.id, name: row.name };
}

export async function runBlueprintJob(admin: AdminClient, args: BlueprintArgs, log: (line: string) => void = console.log): Promise<number> {
  switch (args.command) {
    case "list": {
      const rows = await listBlueprints(admin);
      if (rows.length === 0) log("No blueprints yet. Save one: save --company <id> --name \"…\"");
      for (const r of rows) log(`${r.name} v${r.version}${r.pack_id ? `  pack=${r.pack_id}` : ""}${r.default_for_pack ? "  [default for new tenants]" : ""}  ${r.created_at.slice(0, 10)}  id=${r.id}`);
      return 0;
    }
    case "save": {
      if (!args.company || !args.name) throw new Error("save needs --company and --name.");
      const scope = await scopeOf(admin, args.company);
      const row = await saveBlueprintFromCompany(admin, { scope, name: args.name, description: args.description, packId: args.pack, createdBy: OPERATOR });
      const content = readBlueprintContent(row.content);
      log(`Saved ${row.name} v${row.version} from ${scope.name} (id=${row.id}).`);
      log(`  persona: ${content?.persona.name ?? "default name"}, tone ${content?.persona.tone ?? "default"}`);
      log(`  AI sections: ${Object.keys(content?.aiSettings ?? {}).join(", ") || "none"}`);
      log(`  policies: ${Object.keys(content?.columns ?? {}).join(", ") || "none"}`);
      return 0;
    }
    case "show": {
      const bp = await findBlueprint(admin, { name: args.name ?? undefined, version: args.version ?? undefined });
      if (!bp) throw new Error("Blueprint not found.");
      log(JSON.stringify({ name: bp.name, version: bp.version, pack: bp.pack_id, default: bp.default_for_pack, content: bp.content }, null, 2));
      return 0;
    }
    case "apply": {
      if (!args.company || !args.name) throw new Error("apply needs --name and --company.");
      const bp = await findBlueprint(admin, { name: args.name, version: args.version ?? undefined });
      if (!bp) throw new Error("Blueprint not found.");
      const scope = await scopeOf(admin, args.company);
      const result = await applyBlueprint(admin, { blueprint: bp, target: scope, mode: args.mode, appliedBy: OPERATOR, dryRun: !args.apply });
      log(`${args.apply ? "Applied" : "Would apply"} ${bp.name} v${bp.version} to ${scope.name} (${args.mode}): ${result.plan.changes.length} change(s)`);
      for (const c of result.plan.changes) log(`  ${c}`);
      for (const k of result.plan.skipped) log(`  skipped - ${k}`);
      if (result.applicationId) log(`Application id=${result.applicationId} (undo: revert --application ${result.applicationId})`);
      else if (!args.apply && result.plan.changes.length > 0) log("(dry run — pass --apply to write it)");
      return 0;
    }
    case "revert": {
      if (!args.application) throw new Error("revert needs --application.");
      const r = await revertApplication(admin, args.application, OPERATOR);
      log(r.reverted ? `Reverted.${r.leftAsIs?.length ? ` Changed since the apply, left as is: ${r.leftAsIs.join(", ")}.` : ""}` : `Not reverted: ${r.reason}.`);
      return r.reverted ? 0 : 1;
    }
    case "set-default": {
      const bp = await findBlueprint(admin, { name: args.name ?? undefined, version: args.version ?? undefined });
      if (!bp) throw new Error("Blueprint not found.");
      const row = await setDefaultForPack(admin, bp.id);
      log(`${row.name} v${row.version} is now the default for new ${row.pack_id} tenants.`);
      return 0;
    }
    default:
      throw new Error(`Unknown command "${args.command}". Use list, save, show, apply, revert or set-default.`);
  }
}

if (process.argv[1]?.endsWith("agent-blueprint.ts")) {
  runBlueprintJob(createSupabaseAdminClient(), parseBlueprintArgs(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("[agent-blueprint] FAILED:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
