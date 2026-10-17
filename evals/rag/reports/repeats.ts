import type { MetricResult } from "../types";

/**
 * Collapse one metric across N repeats of the same fixture into one row.
 *
 * - All repeats share a status: that status, `score` = mean, `breakdown.passAll` (pass^k) and
 *   `breakdown.passAny`.
 * - Repeats disagree: a `warn` row marked `breakdown.flaky`. Flaky rows are not regressions
 *   (promotion skips them); the report lists them separately.
 * - Every repeat is `info`: the first repeat's row is passed through unchanged.
 * - A single run is returned as is.
 *
 * `stdev` is the sample standard deviation (n - 1).
 */
export function aggregateRepeatMetrics(runs: MetricResult[][]): MetricResult[] {
  if (runs.length <= 1) return runs[0] ?? [];

  const groups = new Map<string, MetricResult[]>();
  for (const run of runs) {
    for (const row of run) {
      const key = `${row.caseId}::${row.runner}::${row.metric}`;
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
  }
  return [...groups.values()].map(aggregateGroup);
}

/** True for a row produced by `aggregateRepeatMetrics` whose repeats disagreed. */
export function isFlakyMetric(row: MetricResult): boolean {
  return row.breakdown?.flaky === true;
}

function aggregateGroup(rows: MetricResult[]): MetricResult {
  const first = rows[0]!;
  const statuses = rows.map((row) => row.status);
  if (statuses.every((status) => status === "info")) return first;

  const scores = rows.map((row) => row.score);
  const mean = average(scores);
  const passAny = statuses.includes("pass");
  const sameStatus = statuses.every((status) => status === statuses[0]);

  if (sameStatus) {
    return {
      ...first,
      status: statuses[0]!,
      score: mean,
      breakdown: {
        ...first.breakdown,
        repeats: rows.length,
        scores,
        passAll: statuses.every((status) => status === "pass"),
        passAny,
      },
    };
  }

  return {
    ...first,
    status: "warn",
    score: mean,
    detail: `Flaky across ${rows.length} repeats: ${statuses.join(", ")}. First: ${first.detail}`,
    breakdown: {
      ...first.breakdown,
      repeats: rows.length,
      flaky: true,
      statuses,
      scores,
      mean,
      stdev: sampleStdev(scores, mean),
      passAll: false,
      passAny,
    },
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(squares / (values.length - 1));
}
