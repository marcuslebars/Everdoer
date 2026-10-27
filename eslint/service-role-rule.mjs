/**
 * everdoer/service-role-import — the service-role client may only be imported by the files in
 * eslint/service-role-allowlist.mjs (type-only imports and tests are always fine). See that file.
 */
import path from "node:path";

import { SERVICE_ROLE_ALLOWLIST } from "./service-role-allowlist.mjs";

const ALLOWED = new Set(SERVICE_ROLE_ALLOWLIST);
const MODULE = "@/server/supabase/admin";
/** No request input by definition: tests, operator jobs, queue workers, operator scripts. */
const ALWAYS_ALLOWED_PREFIXES = ["src/test/", "src/server/jobs/", "src/server/workers/", "scripts/"];

function isAdminModule(source) {
  return typeof source === "string" && (source === MODULE || /(^|\/)supabase\/admin(\.ts)?$/.test(source));
}

export const serviceRoleImportRule = {
  meta: {
    type: "problem",
    docs: { description: "Only allowlisted files may import the service-role Supabase client." },
    schema: [],
    messages: {
      notAllowed:
        "The service-role client bypasses RLS. Use the caller's RLS client, or — for a request with no session (webhook, public token, worker) — add this file to eslint/service-role-allowlist.mjs with a SANCTIONED EXCEPTION header.",
    },
  },
  create(context) {
    const cwd = context.cwd ?? process.cwd();
    const rel = path.relative(cwd, context.filename).split(path.sep).join("/");
    if (ALLOWED.has(rel) || ALWAYS_ALLOWED_PREFIXES.some((p) => rel.startsWith(p)) || rel === "src/server/supabase/admin.ts") return {};
    return {
      ImportDeclaration(node) {
        if (!isAdminModule(node.source.value) || node.importKind === "type") return;
        const valueImport = node.specifiers.length === 0 || node.specifiers.some((s) => s.importKind !== "type");
        if (valueImport) context.report({ node, messageId: "notAllowed" });
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && isAdminModule(node.source.value)) context.report({ node, messageId: "notAllowed" });
      },
      ExportNamedDeclaration(node) {
        if (node.source && isAdminModule(node.source.value) && node.exportKind !== "type") context.report({ node, messageId: "notAllowed" });
      },
    };
  },
};

export const everdoerPlugin = { rules: { "service-role-import": serviceRoleImportRule } };
