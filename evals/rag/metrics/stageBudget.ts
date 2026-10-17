import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import { metricResult } from "./metricResult";

/**
 * Production default for `CHAT_CONTEXT_TOKEN_BUDGET` (convex/_lib/env.ts). Used only for artifacts
 * that predate `contextTokenBudget`; chat evals set the budget that applied to each question.
 * Do not import chatConfig here: it needs Convex env.
 */
const DEFAULT_CONTEXT_TOKEN_BUDGET = 8000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function contextTokenBudgetRatio(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const budget = artifact.contextTokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET;
  const selectedTokens = artifact.selectedChunks.reduce(
    (sum, chunk) => sum + estimateTokens(chunk.content),
    0
  );
  const ratio = selectedTokens / budget;
  return metricResult(
    "context_token_budget_ratio",
    fixture,
    artifact,
    "info",
    ratio,
    `${selectedTokens} selected-chunk tokens / ${budget} budget.`,
    { selectedTokens, budget }
  );
}

/**
 * Where the turn's provider tokens went, by stage. Only spans that carry token usage count, so
 * latency-only stages (retrieve, rerank, select, grounding) get no share.
 *
 * `score` is the overhead share: the non-`generate` part of the LLM tokens (planner, HyDE,
 * follow-ups, ...). It is info-only.
 */
export function stageTokenShare(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const spans = artifact.stageSpans ?? [];
  const byStage: Record<string, number> = {};
  for (const span of spans) {
    if (span.tokenUsage === undefined) continue;
    byStage[span.stage] = (byStage[span.stage] ?? 0) + span.tokenUsage.total;
  }
  const total = Object.values(byStage).reduce((sum, tokens) => sum + tokens, 0);
  if (total === 0) {
    return metricResult(
      "stage_token_share",
      fixture,
      artifact,
      "info",
      0,
      "No stage token spans on artifact.",
      { total: 0 }
    );
  }

  const breakdown: Record<string, number> = { ...byStage, total };
  for (const [stage, tokens] of Object.entries(byStage)) {
    breakdown[`${stage}Share`] = tokens / total;
  }
  const generate = byStage.generate ?? 0;
  const planHyde = (byStage.plan ?? 0) + (byStage.hyde ?? 0);
  const overheadShare = (total - generate) / total;
  breakdown.generateShare = generate / total;
  breakdown.planHydeShare = planHyde / total;
  breakdown.overheadShare = overheadShare;

  return metricResult(
    "stage_token_share",
    fixture,
    artifact,
    "info",
    overheadShare,
    `Overhead (non-generate) ${percent(overheadShare)} of ${total} stage tokens; generate ${percent(generate / total)}.`,
    breakdown
  );
}
