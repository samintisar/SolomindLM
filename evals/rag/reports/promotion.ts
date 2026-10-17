import type { EvalReport, MetricResult } from "../types";
import { isFlakyMetric } from "./repeats";

const PROMOTE_PREFIXES = [
  "binary_judge_chat_grounding",
  "binary_judge_research_grounding",
  "binary_judge_studio_grounding",
  "binary_judge_studio_structure",
  "binary_judge_lr",
] as const;

interface PromotionRegression {
  caseId: string;
  runner: string;
  metric: string;
  before: string;
  after: string;
}

export interface PromotionDecision {
  ok: boolean;
  regressions: PromotionRegression[];
}

function isPromoteMetric(name: string): boolean {
  return PROMOTE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function key(row: MetricResult): string {
  return `${row.caseId}::${row.runner}::${row.metric}`;
}

export function checkHoldoutPromotion(before: EvalReport, after: EvalReport): PromotionDecision {
  const beforeByKey = new Map(
    before.metrics.filter((row) => isPromoteMetric(row.metric)).map((row) => [key(row), row])
  );
  const regressions: PromotionRegression[] = [];
  for (const row of after.metrics) {
    if (!isPromoteMetric(row.metric) || row.status !== "fail") continue;
    const prev = beforeByKey.get(key(row));
    // A flaky verdict on either side is noise, not a regression (see reports/repeats.ts).
    if (isFlakyMetric(row) || (prev && isFlakyMetric(prev))) continue;
    if (!prev || prev.status !== "fail") {
      regressions.push({
        caseId: row.caseId,
        runner: row.runner,
        metric: row.metric,
        before: prev?.status ?? "missing",
        after: row.status,
      });
    }
  }
  return { ok: regressions.length === 0, regressions };
}
