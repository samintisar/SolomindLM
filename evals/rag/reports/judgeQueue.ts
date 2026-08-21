import type { MetricResult, MetricStatus } from "../types";

export interface JudgeCalibrationItem {
  id: number;
  caseId: string;
  runner: string;
  metric: string;
  modelStatus: MetricStatus;
  score: number;
  modelReason: string;
  /** Fill in after reviewing the answer vs evidence: true = agree with the model. */
  humanAgree: boolean | null;
}

export function buildJudgeCalibrationQueue(
  metrics: MetricResult[],
  options?: { limit?: number }
): JudgeCalibrationItem[] {
  const limit = options?.limit ?? 20;
  const judges = metrics.filter((row) => row.metric.startsWith("binary_judge_"));
  const fails = judges.filter((row) => row.status === "fail" || row.status === "warn");
  const passes = judges.filter((row) => row.status === "pass");

  const picked: MetricResult[] = [];
  let i = 0;
  while (picked.length < limit && (i < fails.length || i < passes.length)) {
    if (i < fails.length) {
      picked.push(fails[i]!);
    }
    if (picked.length >= limit) break;
    if (i < passes.length) {
      picked.push(passes[i]!);
    }
    i += 1;
  }

  return picked.map((row, index) => ({
    id: index + 1,
    caseId: row.caseId,
    runner: row.runner,
    metric: row.metric,
    modelStatus: row.status,
    score: row.score,
    modelReason: row.detail,
    humanAgree: null,
  }));
}
