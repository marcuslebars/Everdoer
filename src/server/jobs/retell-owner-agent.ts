/**
 * Create or update the ONE shared Retell owner-line agent (docs/owner-line.md → Setup).
 *
 * Needs RETELL_API_KEY, RETELL_FUNCTION_SECRET and APP_BASE_URL. Re-run any time the tools or
 * the model change: with RETELL_OWNER_LLM_ID + RETELL_OWNER_AGENT_ID set it UPDATES them in place.
 * Optional: RETELL_OWNER_AGENT_MODEL (default claude-5.5-sonnet), RETELL_OWNER_AGENT_VOICE_ID.
 *
 *   npm run job:retell-owner-agent              # print the config (dry run, the default)
 *   npm run job:retell-owner-agent -- --apply   # create / update it in Retell
 *
 * After the first --apply, set the printed RETELL_OWNER_AGENT_ID (and RETELL_OWNER_LLM_ID) on the
 * web service, plus OWNER_LINE_ORG_IDS (the organizations it is on for; "*" = all).
 */
import { createRetellClient } from "@/server/services/retell/provision";
import { buildOwnerAgentConfig, ensureOwnerAgent } from "@/server/services/voice/owner-agent";

async function main(): Promise<number> {
  const apply = process.argv.includes("--apply");
  const baseUrl = process.env.APP_BASE_URL?.trim();
  const secret = process.env.RETELL_FUNCTION_SECRET?.trim();
  const apiKey = process.env.RETELL_API_KEY?.trim();
  if (!baseUrl || !secret) {
    console.error("[retell-owner-agent] APP_BASE_URL and RETELL_FUNCTION_SECRET are required.");
    return 1;
  }
  const input = { baseUrl, functionSecret: secret, model: process.env.RETELL_OWNER_AGENT_MODEL ?? null, voiceId: process.env.RETELL_OWNER_AGENT_VOICE_ID ?? null };
  if (!apply) {
    const config = buildOwnerAgentConfig(input);
    const redacted = JSON.stringify({ llm: config.llm, agent: config.agent("<llm_id>") }, null, 2).split(secret).join("<RETELL_FUNCTION_SECRET>");
    console.log(redacted);
    console.log("\n(dry run — pass --apply to create/update it in Retell)");
    return 0;
  }
  if (!apiKey) {
    console.error("[retell-owner-agent] RETELL_API_KEY is required for --apply.");
    return 1;
  }
  const result = await ensureOwnerAgent(createRetellClient(apiKey), {
    ...input,
    existing: { llmId: process.env.RETELL_OWNER_LLM_ID?.trim() || null, agentId: process.env.RETELL_OWNER_AGENT_ID?.trim() || null },
  });
  console.log(`RETELL_OWNER_LLM_ID=${result.llmId}${result.created.llm ? "   (new)" : ""}`);
  console.log(`RETELL_OWNER_AGENT_ID=${result.agentId}${result.created.agent ? "   (new)" : ""}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[retell-owner-agent] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
