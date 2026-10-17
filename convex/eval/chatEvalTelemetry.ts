import type { AgentStageName, AgentStageSpan } from "../_agents/_shared/stageSpans";
import { createStageSpan } from "../_agents/_shared/stageSpans";
import type { CallCounters } from "../_agents/_shared/tokenUsageAccumulator";
import {
  resolveEvalTokenUsage,
  type TokenUsage,
  type TokenUsageSource,
} from "../_agents/_shared/usageAggregate";

/** Pipeline order of the chat stages; stages outside the list sort last. */
const CHAT_STAGE_ORDER: readonly AgentStageName[] = [
  "retrieve",
  "plan",
  "hyde",
  "rerank",
  "select",
  "generate",
  "grounding",
  "followup",
];

function chatStageRank(stage: AgentStageName): number {
  const rank = CHAT_STAGE_ORDER.indexOf(stage);
  return rank === -1 ? CHAT_STAGE_ORDER.length : rank;
}

export function buildChatEvalTelemetry(input: {
  retrieveMs?: number;
  rerankMs?: number;
  selectMs?: number;
  /** Spans the agent recorded for its LLM and grounding stages (plan, hyde, generate, ...). */
  agentSpans?: AgentStageSpan[];
  provider?: TokenUsage;
  estimated: TokenUsage;
  callCounters?: CallCounters;
}): {
  stageSpans: AgentStageSpan[];
  tokenUsage: TokenUsage;
  tokenUsageSource: TokenUsageSource;
  callCounters?: CallCounters;
} {
  const evalSpans: AgentStageSpan[] = [];
  if (input.retrieveMs !== undefined) {
    evalSpans.push(createStageSpan("retrieve", 0, { now: () => input.retrieveMs ?? 0 }));
  }
  if (input.rerankMs !== undefined) {
    evalSpans.push(createStageSpan("rerank", 0, { now: () => input.rerankMs ?? 0 }));
  }
  if (input.selectMs !== undefined) {
    evalSpans.push(createStageSpan("select", 0, { now: () => input.selectMs ?? 0 }));
  }

  // Stable sort by pipeline stage: spans of one stage (e.g. several hyde calls) keep call order.
  const stageSpans = [...evalSpans, ...(input.agentSpans ?? [])]
    .map((span, index) => ({ span, index }))
    .sort((a, b) => chatStageRank(a.span.stage) - chatStageRank(b.span.stage) || a.index - b.index)
    .map(({ span }) => span);

  const resolved = resolveEvalTokenUsage({
    provider: input.provider,
    estimated: input.estimated,
  });

  return {
    stageSpans,
    tokenUsage: resolved.tokenUsage,
    tokenUsageSource: resolved.tokenUsageSource,
    ...(input.callCounters !== undefined ? { callCounters: input.callCounters } : {}),
  };
}
