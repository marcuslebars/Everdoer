import { describe, expect, it } from "vitest";
import {
  MESSAGE_AGENT_DEFAULT_MODEL,
  MESSAGE_AGENT_DEFAULT_VOICE,
  buildMessageAgentConfig,
  buildMessageAgentPrompt,
} from "@/server/services/voice/message-agent";

const input = { baseUrl: "https://app.example.test/", functionSecret: "s3cret" };

describe("message agent config (the AI that answers missed calls)", () => {
  it("defaults to Everly's speech-to-speech stack: grok-voice + one of its own voices", () => {
    const config = buildMessageAgentConfig(input);
    expect(MESSAGE_AGENT_DEFAULT_MODEL).toBe("grok-voice-3.0");
    expect(config.llm.model_config).toEqual({ type: "s2s", primary: { model: "grok-voice-3.0" } });
    expect(config.llm).not.toHaveProperty("model");
    const agent = config.agent("llm_1");
    expect(agent.voice_id).toBe(MESSAGE_AGENT_DEFAULT_VOICE);
    expect(String(agent.voice_id)).toMatch(/^xai-/);
    expect(agent.voice_speed).toBe(1.1);
    expect(agent.response_engine).toEqual({ type: "retell-llm", llm_id: "llm_1" });
    expect(agent.webhook_url).toBe("https://app.example.test/api/retell/webhook");
  });

  it("a text-model override goes in `model` and gets an ElevenLabs voice, never an xai one", () => {
    const config = buildMessageAgentConfig({ ...input, model: "gpt-4.1" });
    expect(config.llm.model).toBe("gpt-4.1");
    expect(config.llm).not.toHaveProperty("model_config");
    expect(config.agent("x").voice_id).toBe("11labs-Adrian");
  });

  it("an explicit voice always wins", () => {
    expect(buildMessageAgentConfig({ ...input, voiceId: "xai-Ara" }).agent("x").voice_id).toBe("xai-Ara");
  });

  it("keeps the alert tool and the begin message", () => {
    const config = buildMessageAgentConfig(input);
    const tools = config.llm.general_tools as Array<Record<string, unknown>>;
    expect(tools.map((t) => t.name)).toEqual(["alert_owner", "end_call"]);
    expect(tools[0].url).toBe("https://app.example.test/api/retell/functions/urgent-alert");
    expect(String(config.llm.begin_message)).toContain("automated assistant");
  });

  it("asks callers to spell unclear names and towns, and reads them back", () => {
    const prompt = buildMessageAgentPrompt();
    expect(prompt).toMatch(/name\. If it's at all unusual.*ask them to spell it/);
    expect(prompt).toMatch(/Repeat the town back.*spell it/);
    expect(prompt).toContain("{{service_area}}");
    expect(prompt).toMatch(/summary with their name, number and town/);
  });
});
