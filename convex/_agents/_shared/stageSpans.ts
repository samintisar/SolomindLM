import type { TokenUsage } from "./usageAggregate";

export type AgentStageName =
  | "retrieve"
  | "rerank"
  | "select"
  | "map"
  | "reduce"
  | "parse"
  | "tts";

export interface AgentStageSpan {
  stage: AgentStageName;
  latencyMs: number;
  tokenUsage?: TokenUsage;
}

export function createStageSpan(
  stage: AgentStageName,
  startedAtMs: number,
  options?: {
    tokenUsage?: TokenUsage;
    now?: () => number;
  }
): AgentStageSpan {
  const now = options?.now ?? Date.now;
  const latencyMs = Math.max(0, now() - startedAtMs);

  if (options?.tokenUsage !== undefined) {
    return { stage, latencyMs, tokenUsage: options.tokenUsage };
  }

  return { stage, latencyMs };
}
