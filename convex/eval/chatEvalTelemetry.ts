import type { AgentStageSpan } from "../_agents/_shared/stageSpans";
import { createStageSpan } from "../_agents/_shared/stageSpans";
import {
  resolveEvalTokenUsage,
  type TokenUsage,
  type TokenUsageSource,
} from "../_agents/_shared/usageAggregate";

export function buildChatEvalTelemetry(input: {
  retrieveMs?: number;
  rerankMs?: number;
  selectMs?: number;
  provider?: TokenUsage;
  estimated: TokenUsage;
}): {
  stageSpans: AgentStageSpan[];
  tokenUsage: TokenUsage;
  tokenUsageSource: TokenUsageSource;
} {
  const stageSpans: AgentStageSpan[] = [];
  if (input.retrieveMs !== undefined) {
    stageSpans.push(createStageSpan("retrieve", 0, { now: () => input.retrieveMs ?? 0 }));
  }
  if (input.rerankMs !== undefined) {
    stageSpans.push(createStageSpan("rerank", 0, { now: () => input.rerankMs ?? 0 }));
  }
  if (input.selectMs !== undefined) {
    stageSpans.push(createStageSpan("select", 0, { now: () => input.selectMs ?? 0 }));
  }

  const resolved = resolveEvalTokenUsage({
    provider: input.provider,
    estimated: input.estimated,
  });

  return {
    stageSpans,
    tokenUsage: resolved.tokenUsage,
    tokenUsageSource: resolved.tokenUsageSource,
  };
}
