import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_ROLE_ALLOWLIST } from "../../eslint/service-role-allowlist.mjs";

const root = resolve(__dirname, "..", "..");
const VALUE_IMPORT = /import\s+(?!type\s)\{([^}]*)\}\s*from\s*"@\/server\/supabase\/admin"/g;

function importsAdminClient(file: string): boolean {
  const text = readFileSync(resolve(root, file), "utf8");
  for (const m of text.matchAll(VALUE_IMPORT)) {
    if (m[1].split(",").some((name) => name.trim() && !name.trim().startsWith("type "))) return true;
  }
  return /import\(\s*"@\/server\/supabase\/admin"\s*\)/.test(text);
}

describe("service-role allowlist (eslint/service-role-allowlist.mjs)", () => {
  it("is a ratchet: every entry exists and still imports the service-role client", () => {
    const stale = SERVICE_ROLE_ALLOWLIST.filter((file) => !existsSync(resolve(root, file)) || !importsAdminClient(file));
    expect(stale, "remove these entries from eslint/service-role-allowlist.mjs").toEqual([]);
  });

  it("has no duplicates and only repo-relative src/ paths", () => {
    expect(new Set(SERVICE_ROLE_ALLOWLIST).size).toBe(SERVICE_ROLE_ALLOWLIST.length);
    for (const file of SERVICE_ROLE_ALLOWLIST) expect(file).toMatch(/^src\/[^\\]+\.(ts|tsx)$/);
  });
});
