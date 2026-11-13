/**
 * Setting up the shared owner-line agent in Retell (voice/owner-agent.ts, the
 * retell-owner-agent job): an update owns the prompt passthrough and the tools, and leaves
 * the model and voice chosen in Retell's dashboard alone (so a speech-to-speech model such as
 * Grok Voice survives a re-run). The live agent can be read back and checked.
 */
import { describe, expect, it, vi } from "vitest";

import type { RetellClient } from "@/server/services/retell/provision";
import {
  buildOwnerAgentConfig,
  buildOwnerAgentTools,
  describeOwnerAgentReport,
  ensureOwnerAgent,
  isSpeechToSpeechModel,
  liveExtraTools,
  modelFields,
  OWNER_AGENT_PROMPT,
  ownerAgentReport,
  publishOwnerAgent,
  readOwnerAgent,
} from "@/server/services/voice/owner-agent";

const INPUT = { baseUrl: "https://api.everdoer.test", functionSecret: "shh-secret" };
const tools = () => buildOwnerAgentTools(INPUT);
/** The business tool as it was before business_name was added. */
function oldBusinessTool(): Record<string, unknown> {
  const tool = structuredClone(tools()[0]) as { parameters: { properties: Record<string, unknown> } };
  delete tool.parameters.properties.business_name;
  return tool as unknown as Record<string, unknown>;
}
const HAND_MADE = { type: "custom", name: "crm_lookup", url: "https://elsewhere.test/x", parameters: { type: "object", properties: {} } };

function fakeClient(live: { llm: Record<string, unknown>; agent: Record<string, unknown> }) {
  const sent: Array<{ op: string; body?: unknown }> = [];
  const client: RetellClient = {
    createLlm: vi.fn(async (body) => (sent.push({ op: "createLlm", body }), { llm_id: "llm_new" })),
    updateLlm: vi.fn(async (id, body) => (sent.push({ op: "updateLlm", body }), Object.assign(live.llm, body), { llm_id: id })),
    createAgent: vi.fn(async (body) => (sent.push({ op: "createAgent", body }), { agent_id: "agent_new" })),
    updateAgent: vi.fn(async (id, body) => (sent.push({ op: "updateAgent", body }), Object.assign(live.agent, body), { agent_id: id })),
    getLlm: vi.fn(async () => live.llm),
    getAgent: vi.fn(async () => live.agent),
    publishAgentVersion: vi.fn(async (_id, version) => (sent.push({ op: "publish", body: { version } }), (live.agent.is_published = true), {})),
    createPhoneNumber: vi.fn(),
    updatePhoneNumber: vi.fn(),
    listPhoneNumbers: vi.fn(),
  } as unknown as RetellClient;
  return { client, sent };
}

describe("models", () => {
  it("speech-to-speech models go in model_config; text models in model; nothing set sends nothing", () => {
    expect(isSpeechToSpeechModel("grok-voice-3.0")).toBe(true);
    expect(isSpeechToSpeechModel("gpt-realtime-2.1-mini")).toBe(true);
    expect(isSpeechToSpeechModel("claude-5.5-sonnet")).toBe(false);
    expect(isSpeechToSpeechModel(null)).toBe(false);
    expect(modelFields("grok-voice-3.0")).toEqual({ model_config: { type: "s2s", primary: { model: "grok-voice-3.0" } } });
    expect(modelFields("claude-5.5-sonnet")).toEqual({ model: "claude-5.5-sonnet" });
    expect(modelFields("  ")).toEqual({});
  });
});

describe("the config", () => {
  it("a new agent: the default model and voice", () => {
    const config = buildOwnerAgentConfig(INPUT);
    expect(config.llm.model).toBe("claude-5.5-sonnet");
    expect(config.llm.general_prompt).toBe(OWNER_AGENT_PROMPT);
    expect(config.agent("llm_1")).toMatchObject({ voice_id: "11labs-Adrian", language: "en-US" });
  });

  it("an update: no model, voice or language unless set, so the live agent's choices are kept", () => {
    const config = buildOwnerAgentConfig(INPUT, { update: true });
    expect(config.llm).not.toHaveProperty("model");
    expect(config.llm).not.toHaveProperty("model_config");
    expect(config.llm.general_prompt).toBe("{{system_prompt}}");
    expect((config.llm.general_tools as unknown[]).length).toBe(3);
    const agent = config.agent("llm_1");
    expect(agent).not.toHaveProperty("voice_id");
    expect(agent).not.toHaveProperty("language");
    expect(agent.response_engine).toEqual({ type: "retell-llm", llm_id: "llm_1" });
  });

  it("an update with the model set explicitly sends it the right way; a speech-to-speech model never gets the default voice", () => {
    const grok = buildOwnerAgentConfig({ ...INPUT, model: "grok-voice-3.0" }, { update: true });
    expect(grok.llm.model_config).toEqual({ type: "s2s", primary: { model: "grok-voice-3.0" } });
    expect(grok.llm).not.toHaveProperty("model");
    expect(buildOwnerAgentConfig({ ...INPUT, model: "grok-voice-3.0" }).agent("l")).not.toHaveProperty("voice_id");
    expect(buildOwnerAgentConfig({ ...INPUT, model: "grok-voice-3.0", voiceId: "grok-Ara" }).agent("l").voice_id).toBe("grok-Ara");
  });
});

describe("updating the live agent", () => {
  const grokLive = () => ({
    llm: {
      llm_id: "llm_1",
      model_config: { type: "s2s", primary: { model: "grok-voice-3.0" }, temperature: 0 },
      // Edited in the dashboard: the passthrough is gone, the business tool is the old one, one tool was added by hand.
      general_prompt: "You are a helpful assistant for Marcus.",
      general_tools: [oldBusinessTool(), tools()[2], HAND_MADE],
    } as Record<string, unknown>,
    agent: { agent_id: "agent_1", voice_id: "grok-Ara", version: 1, is_published: false } as Record<string, unknown>,
  });

  it("reads back what is wrong: the prompt, an out-of-date tool, a missing tool; and names the model and voice", () => {
    const report = ownerAgentReport(INPUT, grokLive());
    expect(report).toMatchObject({ model: "grok-voice-3.0", speechToSpeech: true, voiceId: "grok-Ara", promptIsPassthrough: false, version: 1, published: false, ok: false, extraTools: ["crm_lookup"] });
    expect(report.tools).toEqual([
      { name: "business", state: "out_of_date", detail: "no business_name argument" },
      { name: "web_lookup", state: "missing" },
      { name: "end_call", state: "ok" },
    ]);
    const lines = describeOwnerAgentReport(report).join("\n");
    expect(lines).toContain("Model:  grok-voice-3.0 (speech-to-speech)");
    expect(lines).toContain("Tool:   business: OUT OF DATE (no business_name argument)");
    expect(lines).toContain("Tool:   web_lookup: MISSING");
    expect(lines).toContain("NOT the {{system_prompt}} passthrough");
    expect(lines).toContain("version 1 (draft, not published)");
    expect(lines).not.toContain("shh-secret");
  });

  it("the update restores the prompt and tools, keeps Grok Voice, its voice and the hand-made tool, and can be published", async () => {
    const live = grokLive();
    const { client, sent } = fakeClient(live);
    const before = await readOwnerAgent(client, INPUT, { llmId: "llm_1", agentId: "agent_1" });
    expect(before.extraTools).toEqual([HAND_MADE]);

    const out = await ensureOwnerAgent(client, { ...INPUT, existing: { llmId: "llm_1", agentId: "agent_1" }, keepTools: before.extraTools });
    expect(out).toEqual({ llmId: "llm_1", agentId: "agent_1", created: { llm: false, agent: false } });
    const llmBody = sent.find((s) => s.op === "updateLlm")?.body as Record<string, unknown>;
    expect(llmBody).not.toHaveProperty("model");
    expect(llmBody).not.toHaveProperty("model_config");
    expect((llmBody.general_tools as Array<{ name: string }>).map((t) => t.name)).toEqual(["business", "web_lookup", "end_call", "crm_lookup"]);
    expect(sent.find((s) => s.op === "updateAgent")?.body).not.toHaveProperty("voice_id");

    const after = (await readOwnerAgent(client, INPUT, { llmId: "llm_1", agentId: "agent_1" })).report;
    expect(after).toMatchObject({ ok: true, model: "grok-voice-3.0", voiceId: "grok-Ara", promptIsPassthrough: true, extraTools: ["crm_lookup"], published: false });
    expect(after.tools.every((t) => t.state === "ok")).toBe(true);

    expect(await publishOwnerAgent(client, "agent_1", after)).toBe("published");
    expect(sent.at(-1)).toEqual({ op: "publish", body: { version: 1 } });
    expect(await publishOwnerAgent(client, "agent_1", { version: 1, published: true })).toBe("already_published");
    expect(sent.filter((s) => s.op === "publish")).toHaveLength(1);
  });

  it("a failed or impossible publish is reported, never thrown", async () => {
    const { client } = fakeClient(grokLive());
    (client.publishAgentVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("422"));
    expect(await publishOwnerAgent(client, "agent_1", { version: 1, published: false })).toEqual({ failed: "422" });
    expect(await publishOwnerAgent(client, "agent_1", { version: null, published: false })).toBe("unknown_version");
  });

  it("the older response shapes are read too (s2s_model / model), and a tool pointed elsewhere is flagged", () => {
    expect(ownerAgentReport(INPUT, { llm: { s2s_model: "gpt-realtime-2", general_prompt: "{{system_prompt}}", general_tools: tools() }, agent: {} })).toMatchObject({ model: "gpt-realtime-2", speechToSpeech: true, ok: true, version: null, published: null });
    expect(ownerAgentReport(INPUT, { llm: { model: "claude-5.5-sonnet", general_prompt: "{{system_prompt}}", general_tools: tools() }, agent: {} })).toMatchObject({ model: "claude-5.5-sonnet", speechToSpeech: false, ok: true });
    const moved = tools().map((t) => (t.name === "web_lookup" ? { ...t, url: "https://old.test/x" } : t));
    expect(ownerAgentReport(INPUT, { llm: { general_prompt: "{{system_prompt}}", general_tools: moved }, agent: {} }).tools[1]).toEqual({ name: "web_lookup", state: "out_of_date", detail: "points at a different address" });
    expect(liveExtraTools(INPUT, { general_tools: [...tools(), HAND_MADE] })).toEqual([HAND_MADE]);
    expect(liveExtraTools(INPUT, null)).toEqual([]);
  });

  it("a new agent on a speech-to-speech model needs its voice, and nothing is created without it", async () => {
    const { client, sent } = fakeClient({ llm: {}, agent: {} });
    await expect(ensureOwnerAgent(client, { ...INPUT, model: "grok-voice-3.0" })).rejects.toThrow("RETELL_OWNER_AGENT_VOICE_ID");
    expect(sent).toEqual([]);
    const made = await ensureOwnerAgent(client, { ...INPUT, model: "grok-voice-3.0", voiceId: "grok-Ara" });
    expect(made.created).toEqual({ llm: true, agent: true });
    expect((sent[0].body as Record<string, unknown>).model_config).toEqual({ type: "s2s", primary: { model: "grok-voice-3.0" } });
    expect((sent[1].body as Record<string, unknown>).voice_id).toBe("grok-Ara");
  });
});
