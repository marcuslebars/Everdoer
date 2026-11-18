/**
 * How a model name is sent to Retell, shared by the owner agent and the message agent. PURE.
 */
type Json = Record<string, unknown>;

/**
 * Retell's speech-to-speech models: one model hears and speaks, so there is no separate text
 * model and the voice must be one of that model's own.
 */
export function isSpeechToSpeechModel(model: string | null | undefined): boolean {
  return /^(gpt-realtime|grok-voice)/i.test(model?.trim() ?? "");
}

/** Speech-to-speech models go in `model_config`; text models in `model`. */
export function modelFields(model: string | null | undefined): Json {
  const name = model?.trim();
  if (!name) return {};
  return isSpeechToSpeechModel(name) ? { model_config: { type: "s2s", primary: { model: name } } } : { model: name };
}
