/**
 * The SMS agent's tool-use loop — now a thin layer over the agent kernel (src/server/agent).
 *
 *   user turn (fenced conversation + photos) → model → tool calls → tool results → … → text
 *
 * Bounded: at most `maxIterations` model calls per turn, a hard deadline across the whole turn
 * (each call is aborted at the deadline), and tool errors come back to the model as readable
 * results rather than exceptions. The caller (entry.ts) owns what happens to the final text.
 */
import type Anthropic from "@anthropic-ai/sdk";

import type { AiUsageMeta } from "@/server/ai/claude";
import { AgentTimeoutError as KernelTimeoutError, defaultModelClient as kernelModelClient, runAgentLoop, type ModelClient, type ToolCallRecord } from "@/server/agent/runtime";
import type { FetchedImage } from "@/server/services/sms-agent/media";
import { allAgentTools, runTool, type TurnState } from "@/server/services/sms-agent/tools";

export type { ModelClient, ToolCallRecord };

/** The real client (reads ANTHROPIC_API_KEY); one SDK retry, as before. */
export function defaultModelClient(): ModelClient {
  return kernelModelClient({ maxRetries: 1 });
}

export interface AgentTurnInput {
  state: TurnState;
  system: string;
  userText: string;
  images: FetchedImage[];
  model: string;
  client: ModelClient;
  maxIterations: number;
  /** Absolute epoch ms by which the whole turn must finish. */
  deadline: number;
}

export interface AgentTurnOutput {
  text: string | null;
  stoppedReason: "final" | "max_iterations" | "timeout";
  iterations: number;
  usage: AiUsageMeta[];
  toolCalls: ToolCallRecord[];
}

export class AgentTimeoutError extends KernelTimeoutError {
  constructor() {
    super("SMS agent turn timed out.");
    this.name = "AgentTimeoutError";
  }
}

export function toolDefinitions(state?: Pick<TurnState, "roleTools">): Anthropic.Tool[] {
  return allAgentTools(state).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

/**
 * One customer turn on the agent kernel (src/server/agent/runtime.ts): the system prompt is
 * cached (identical across a conversation's turns), thinking is off, tool results go back as
 * plain JSON (is_error on failures), and any timeout throws AgentTimeoutError.
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnOutput> {
  const content: Anthropic.ContentBlockParam[] = [
    ...input.images.map(
      (img): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } }),
    ),
    { type: "text", text: input.userText },
  ];
  let out;
  try {
    out = await runAgentLoop({
      system: input.system,
      cacheSystem: true,
      disableThinking: true,
      userContent: content,
      tools: toolDefinitions(input.state),
      runTool: (name, toolInput) => runTool(input.state, name, toolInput),
      model: input.model,
      client: input.client,
      maxRounds: input.maxIterations,
      deadline: input.deadline,
    });
  } catch (err) {
    if (err instanceof KernelTimeoutError) throw new AgentTimeoutError();
    throw err;
  }
  if (out.stoppedReason === "timeout") throw new AgentTimeoutError();
  if (out.stoppedReason === "final") return { text: out.text, stoppedReason: "final", iterations: out.rounds, usage: out.usage, toolCalls: out.toolCalls };
  return { text: null, stoppedReason: "max_iterations", iterations: input.maxIterations, usage: out.usage, toolCalls: out.toolCalls };
}
