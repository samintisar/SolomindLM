import type { ConcreteRunnerKind, MetricResult } from "../types";

interface ScorecardCell {
  useCase: string;
  runner: ConcreteRunnerKind;
  pass: number;
  fail: number;
  judgeErrors: number;
  /** pass / (pass + fail); null when nothing was scored */
  passRate: number | null;
  /** Metric names that failed (judge errors excluded) */
  failedChecks: string[];
}

export interface Scorecard {
  cells: ScorecardCell[];
}

/** A judge metric that failed to produce a verdict (truncation, parse or HTTP error). */
export function isJudgeError(m: MetricResult): boolean {
  const isJudge = m.metric.startsWith("binary_judge_") || m.metric.startsWith("rubric:");
  if (!isJudge) return false;
  return m.breakdown?.judgeError === true || typeof m.breakdown?.error === "string";
}

/** Pass rates per use-case pack × runner (pass/fail metrics, plus judge errors of any status). */
export function buildScorecard(
  metrics: MetricResult[],
  useCaseByCase: Map<string, string>
): Scorecard {
  const cells = new Map<string, ScorecardCell>();
  for (const metric of metrics) {
    const useCase = useCaseByCase.get(metric.caseId);
    if (!useCase) continue;
    // Rubric judge errors are "warn"; binary-judge errors are "fail".
    if (!isJudgeError(metric) && metric.status !== "pass" && metric.status !== "fail") continue;
    const key = `${useCase}::${metric.runner}`;
    const cell = cells.get(key) ?? {
      useCase,
      runner: metric.runner,
      pass: 0,
      fail: 0,
      judgeErrors: 0,
      passRate: null,
      failedChecks: [],
    };
    if (isJudgeError(metric)) {
      cell.judgeErrors++;
    } else if (metric.status === "pass") {
      cell.pass++;
    } else {
      cell.fail++;
      if (!cell.failedChecks.includes(metric.metric)) cell.failedChecks.push(metric.metric);
    }
    cells.set(key, cell);
  }
  const sorted = [...cells.values()].sort(
    (a, b) => a.useCase.localeCompare(b.useCase) || a.runner.localeCompare(b.runner)
  );
  for (const cell of sorted) {
    const scored = cell.pass + cell.fail;
    cell.passRate = scored > 0 ? cell.pass / scored : null;
  }
  return { cells: sorted };
}

export function formatScorecard(scorecard: Scorecard): string[] {
  const lines = ["  Use-case scorecard:"];
  let current = "";
  for (const cell of scorecard.cells) {
    if (cell.useCase !== current) {
      current = cell.useCase;
      lines.push(`    ${current}`);
    }
    const rate = cell.passRate === null ? "n/a" : `${Math.round(cell.passRate * 100)}%`;
    const parts = [`      ${cell.runner}  ${rate} (${cell.pass}/${cell.pass + cell.fail})`];
    if (cell.judgeErrors > 0) parts.push(`judge errors: ${cell.judgeErrors}`);
    if (cell.failedChecks.length > 0) parts.push(`failing: ${cell.failedChecks.join(", ")}`);
    lines.push(parts.join("  "));
  }
  lines.push("");
  return lines;
}
