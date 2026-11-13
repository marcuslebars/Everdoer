/**
 * Create, update or check the ONE shared Retell owner-line agent (docs/owner-line.md → Setup).
 *
 * Needs RETELL_FUNCTION_SECRET and APP_BASE_URL; RETELL_API_KEY for anything but the dry run.
 * With RETELL_OWNER_LLM_ID + RETELL_OWNER_AGENT_ID set it works on that agent in place.
 *
 *   npm run job:retell-owner-agent                        # print the config (dry run, the default)
 *   npm run job:retell-owner-agent -- --check             # read the live agent: model, prompt, tools, version. Changes nothing.
 *   npm run job:retell-owner-agent -- --apply             # create it, or update its prompt and tools
 *   npm run job:retell-owner-agent -- --apply --publish   # ...and publish the version that was updated
 *
 * An update keeps the model and the voice the live agent has (so a model chosen in Retell's
 * dashboard, such as Grok Voice, is not undone) and keeps any tool that was added by hand.
 * To change them from here: RETELL_OWNER_AGENT_MODEL (e.g. grok-voice-3.0, claude-5.5-sonnet) and
 * RETELL_OWNER_AGENT_VOICE_ID. A new agent gets claude-5.5-sonnet unless the model is set.
 *
 * Retell's update endpoints write to the agent's latest DRAFT version. --publish publishes that
 * version; without it, publish in the dashboard when you are happy with a test call.
 *
 * After the first --apply, set the printed RETELL_OWNER_AGENT_ID (and RETELL_OWNER_LLM_ID) on the
 * web service, plus OWNER_LINE_ORG_IDS (the organizations it is on for; "*" = all).
 */
import { createRetellClient } from "@/server/services/retell/provision";
import { buildOwnerAgentConfig, describeOwnerAgentReport, ensureOwnerAgent, publishOwnerAgent, readOwnerAgent } from "@/server/services/voice/owner-agent";

async function main(): Promise<number> {
  const flag = (name: string) => process.argv.includes(name);
  const apply = flag("--apply");
  const check = flag("--check");
  const baseUrl = process.env.APP_BASE_URL?.trim();
  const secret = process.env.RETELL_FUNCTION_SECRET?.trim();
  const apiKey = process.env.RETELL_API_KEY?.trim();
  if (!baseUrl || !secret) {
    console.error("[retell-owner-agent] APP_BASE_URL and RETELL_FUNCTION_SECRET are required.");
    return 1;
  }
  const input = { baseUrl, functionSecret: secret, model: process.env.RETELL_OWNER_AGENT_MODEL ?? null, voiceId: process.env.RETELL_OWNER_AGENT_VOICE_ID ?? null };
  const existing = { llmId: process.env.RETELL_OWNER_LLM_ID?.trim() || null, agentId: process.env.RETELL_OWNER_AGENT_ID?.trim() || null };
  const ids = existing.llmId && existing.agentId ? { llmId: existing.llmId, agentId: existing.agentId } : null;

  if (!apply && !check) {
    const config = buildOwnerAgentConfig(input, { update: Boolean(ids) });
    const redacted = JSON.stringify({ llm: config.llm, agent: config.agent(existing.llmId ?? "<llm_id>") }, null, 2).split(secret).join("<RETELL_FUNCTION_SECRET>");
    console.log(redacted);
    console.log(ids ? "\n(dry run: this is what --apply would send to the existing agent; its model and voice are kept unless set above)" : "\n(dry run: pass --apply to create it in Retell)");
    return 0;
  }
  if (!apiKey) {
    console.error("[retell-owner-agent] RETELL_API_KEY is required for --check and --apply.");
    return 1;
  }
  const client = createRetellClient(apiKey);

  if (check) {
    if (!ids) {
      console.error("[retell-owner-agent] --check needs RETELL_OWNER_LLM_ID and RETELL_OWNER_AGENT_ID.");
      return 1;
    }
    const { report } = await readOwnerAgent(client, input, ids);
    console.log(describeOwnerAgentReport(report).join("\n"));
    console.log(report.ok ? "\nEverything is in place." : "\nNot in place: run with --apply to fix the prompt and tools.");
    return report.ok ? 0 : 2;
  }

  // Tools added by hand in the dashboard are kept; everything this job owns is rewritten.
  const before = ids ? await readOwnerAgent(client, input, ids) : null;
  const result = await ensureOwnerAgent(client, { ...input, existing, keepTools: before?.extraTools });
  console.log(`RETELL_OWNER_LLM_ID=${result.llmId}${result.created.llm ? "   (new)" : ""}`);
  console.log(`RETELL_OWNER_AGENT_ID=${result.agentId}${result.created.agent ? "   (new)" : ""}`);

  let { report } = await readOwnerAgent(client, input, { llmId: result.llmId, agentId: result.agentId });
  if (flag("--publish")) {
    const outcome = await publishOwnerAgent(client, result.agentId, report);
    if (outcome === "published") {
      console.log(`Published version ${report.version}.`);
      ({ report } = await readOwnerAgent(client, input, { llmId: result.llmId, agentId: result.agentId }));
    } else if (outcome === "already_published") console.log("That version is already published.");
    else if (outcome === "unknown_version") console.log("Couldn't tell which version to publish: publish it in Retell's dashboard.");
    else console.log(`Publishing failed (${outcome.failed}). The update is saved as a draft: publish it in Retell's dashboard.`);
  }
  console.log(`\n${describeOwnerAgentReport(report).join("\n")}`);
  if (!report.ok) {
    console.error("\n[retell-owner-agent] The live agent still doesn't match after the update.");
    return 2;
  }
  if (report.published === false) console.log("\nSaved to a DRAFT version. Publish it (--publish, or in Retell's dashboard) so calls use it.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[retell-owner-agent] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
