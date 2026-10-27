#!/usr/bin/env node
/**
 * Regenerate src/server/db/database.types.ts from the live Postgres schema via
 * the Supabase CLI. Cross-platform (spawns through the shell so Windows resolves
 * supabase.cmd / npx.cmd). Two env-selected modes:
 *
 *   remote  — when SUPABASE_PROJECT_REF is set:
 *             `supabase gen types typescript --project-id $SUPABASE_PROJECT_REF`
 *             Introspects the linked hosted project. Also needs SUPABASE_ACCESS_TOKEN.
 *
 *   local   — otherwise:
 *             `supabase gen types typescript --local`
 *             Introspects the local dev stack (requires `supabase start` first).
 *
 *   file    — `node scripts/gen-types.mjs --from-file <path>`: post-process output that was
 *             generated elsewhere (e.g. postgres-meta against a throwaway Postgres with every
 *             migration applied — no Docker needed; see docs/EVERDOER_RUNBOOK.md).
 *
 * The raw output is post-processed (postProcess below): the generator's own generic helpers
 * are replaced by the app's aliases (Tables / Inserts / Updates / DbEnum / TableName / EnumName)
 * that the code imports, and the PostgREST version marker is kept. Writing the raw CLI output
 * used to break the build, which is how the file drifted (64 tables missing by Oct 2026).
 *
 * See docs/EVERDOER_RUNBOOK.md (section "Generating database types").
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "server",
  "db",
  "database.types.ts",
);

const APP_HELPERS = `
type PublicSchema = Database["public"];

export type TableName = keyof PublicSchema["Tables"];
export type EnumName = keyof PublicSchema["Enums"];

export type Tables<T extends TableName> = PublicSchema["Tables"][T]["Row"];
export type Inserts<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type Updates<T extends TableName> = PublicSchema["Tables"][T]["Update"];
export type DbEnum<T extends EnumName> = PublicSchema["Enums"][T];
`;

/** Raw generator output → the file the app imports. Exported for tests. */
export function postProcess(raw) {
  let text = raw.replace(/\r\n/g, "\n");
  // Drop the generator's generic helpers (they clash with the app's `Tables<T>` alias).
  const cut = text.search(/\n(?:type DatabaseWithoutInternals|type DefaultSchema|export type Tables<)/);
  if (cut > 0) text = text.slice(0, cut);
  text = text.trimEnd() + "\n";
  // Newer postgres-meta types NOT NULL jsonb as NonNullable<Json>; the app's convention (and the
  // CLI output this file was first made from) is plain Json — the database still refuses null.
  text = text.replace(/NonNullable<Json>/g, "Json");
  if (!text.includes("__InternalSupabase")) {
    text = text.replace(/export (type Database = \{|interface Database \{)\n/, (m) => `${m}  __InternalSupabase: {\n    PostgrestVersion: "12"\n  }\n`);
  }
  if (!/export (type Database =|interface Database)/.test(text)) throw new Error("no Database type in the generator output");
  return `${text}${APP_HELPERS}`;
}

const fromFileAt = process.argv.indexOf("--from-file");
if (fromFileAt >= 0) {
  const source = process.argv[fromFileAt + 1];
  if (!source) {
    console.error("[gen:types] --from-file needs a path");
    process.exit(1);
  }
  const out = postProcess(readFileSync(source, "utf8"));
  writeFileSync(OUT, out);
  console.error(`[gen:types] wrote ${out.length} bytes to database.types.ts (from ${source})`);
  process.exit(0);
}

const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const modeArgs = projectRef ? `--project-id ${projectRef}` : "--local";

if (projectRef && !process.env.SUPABASE_ACCESS_TOKEN) {
  console.error(
    "[gen:types] SUPABASE_PROJECT_REF is set but SUPABASE_ACCESS_TOKEN is not — remote generation needs both.",
  );
  process.exit(1);
}

const cliArgs = `gen types typescript --schema public ${modeArgs}`;

function run(cmd) {
  return spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function looksMissing(res) {
  const haystack = `${res.stderr ?? ""}${res.error?.message ?? ""}`;
  return res.error?.code === "ENOENT" || /not recognized|command not found|: not found/i.test(haystack);
}

console.error(
  `[gen:types] ${projectRef ? `remote (project ${projectRef})` : "local"} -> ${OUT}`,
);

// Prefer a supabase on PATH; transparently fall back to npx if it isn't installed.
let res = run(`supabase ${cliArgs}`);
if (looksMissing(res)) {
  console.error("[gen:types] supabase not on PATH; retrying via npx…");
  res = run(`npx --yes supabase ${cliArgs}`);
}

if (res.status !== 0 || !res.stdout || !res.stdout.trim()) {
  console.error("[gen:types] generation failed:\n" + (res.stderr || res.error?.message || "unknown error"));
  console.error(
    projectRef
      ? "[gen:types] check SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN and network access."
      : "[gen:types] is the local stack running? Start it with `supabase start`, or set SUPABASE_PROJECT_REF for remote mode.",
  );
  process.exit(res.status || 1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, postProcess(res.stdout));
console.error(`[gen:types] wrote ${res.stdout.length} bytes to database.types.ts`);
