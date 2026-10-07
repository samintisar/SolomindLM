import type { EvalFixture, EvalRunArtifact, MetricResult, MetricStatus } from "../types";

/** A metric row tagged with the case, runner and configHash it belongs to. */
export function metricResult(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: MetricStatus,
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

/** A pass/fail judge verdict (score 1 or 0). Always carries `breakdown`, even when undefined. */
export function binaryMetricResult(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  pass: boolean,
  reason: string,
  breakdown: Record<string, unknown> | undefined
): MetricResult {
  return {
    ...metricResult(metric, fixture, artifact, pass ? "pass" : "fail", pass ? 1 : 0, reason),
    breakdown,
  };
}
