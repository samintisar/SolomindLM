import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "../types";

/** Matches production `LIST_QUERY_CONTEXT_TOKEN_BUDGET` (chatConfig). Do not import chatConfig here — it needs Convex env. */
export const EVAL_CONTEXT_TOKEN_BUDGET = 5200;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: MetricResult["status"],
  score: number,
  detail: string,
  breakdown?: Record<string, unknown>
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
    ...(breakdown ? { breakdown } : {}),
  };
}

export function contextTokenBudgetRatio(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const selectedTokens = artifact.selectedChunks.reduce(
    (sum, chunk) => sum + estimateTokens(chunk.content),
    0
  );
  const ratio = selectedTokens / EVAL_CONTEXT_TOKEN_BUDGET;
  return baseMetric(
    "context_token_budget_ratio",
    fixture,
    artifact,
    "info",
    ratio,
    `${selectedTokens} selected-chunk tokens / ${EVAL_CONTEXT_TOKEN_BUDGET} budget.`,
    { selectedTokens, budget: EVAL_CONTEXT_TOKEN_BUDGET }
  );
}

export function stageTokenShare(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const spans = artifact.stageSpans ?? [];
  const total = spans.reduce((sum, span) => sum + (span.tokenUsage?.total ?? 0), 0);
  if (total === 0) {
    return baseMetric(
      "stage_token_share",
      fixture,
      artifact,
      "info",
      0,
      "No stage token spans on artifact.",
      { total: 0 }
    );
  }
  const byStage: Record<string, number> = {};
  for (const span of spans) {
    byStage[span.stage] = (byStage[span.stage] ?? 0) + (span.tokenUsage?.total ?? 0);
  }
  const mapShare = (byStage.map ?? 0) / total;
  return baseMetric(
    "stage_token_share",
    fixture,
    artifact,
    "info",
    mapShare,
    `Map share ${(mapShare * 100).toFixed(1)}% of ${total} stage tokens.`,
    { ...byStage, mapShare, total }
  );
}
