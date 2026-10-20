import type { MetricResult, MetricStatus } from "../types";

/**
 * Collapse one metric across N repeats of the same fixture into one row.
 *
 * - `info` rows are ignored for the status comparison. If every row is `info`, the first row
 *   passes through unchanged.
 * - Repeats agree (and the metric is present in every repeat): that status, `score` = mean,
 *   `breakdown.passAll` (pass^k) and `breakdown.passAny`.
 * - Repeats disagree, or the metric is missing from some repeats: a flaky row with
 *   `breakdown.flaky`. Majority fail (fails >= ceil(N/2)) merges to `fail`, so a regression that
 *   fails most repeats still blocks. A minority fail merges to `warn`, which never blocks.
 * - A missing repeat appears as "missing" in `breakdown.statuses`.
 * - Non-finite scores are dropped before averaging; with none left the score is 0.
 * - Judge-error markers (`judgeError`, string `error`) are copied onto the merged breakdown, and
 *   `category` comes from the first non-pass row.
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
  return [...groups.values()].map((rows) => aggregateGroup(rows, runs.length));
}

/** True for a row produced by `aggregateRepeatMetrics` whose repeats disagreed. */
export function isFlakyMetric(row: MetricResult): boolean {
  return row.breakdown?.flaky === true;
}

function aggregateGroup(rows: MetricResult[], n: number): MetricResult {
  const first = rows[0]!;
  const scored = rows.filter((row) => row.status !== "info");
  if (scored.length === 0) return first;

  const statusList: MetricStatus[] = scored.map((row) => row.status);
  const missing = n - rows.length;
  const flaky = missing > 0 || new Set(statusList).size > 1;
  const scores = scored.map((row) => row.score).filter(Number.isFinite);
  const mean = scores.length > 0 ? average(scores) : 0;
  const passAny = statusList.includes("pass");
  const base = {
    ...first.breakdown,
    ...errorMarkers(rows, scored),
    repeats: n,
    scores,
  };

  if (!flaky) {
    return {
      ...first,
      status: statusList[0]!,
      score: mean,
      breakdown: {
        ...base,
        passAll: statusList.every((status) => status === "pass"),
        passAny,
      },
    };
  }

  const fails = statusList.filter((status) => status === "fail").length;
  const status: MetricStatus = fails >= Math.ceil(n / 2) ? "fail" : "warn";
  const statuses = [...statusList, ...Array.from({ length: missing }, () => "missing")];
  return {
    ...first,
    status,
    score: mean,
    detail: `Flaky across ${n} repeats: ${statuses.join(", ")}. First: ${first.detail}`,
    breakdown: {
      ...base,
      flaky: true,
      statuses,
      mean,
      stdev: sampleStdev(scores, mean),
      passAll: false,
      passAny,
    },
  };
}

function errorMarkers(rows: MetricResult[], scored: MetricResult[]): Record<string, unknown> {
  const markers: Record<string, unknown> = {};
  if (rows.some((row) => row.breakdown?.judgeError === true)) markers.judgeError = true;
  const error = rows
    .map((row) => row.breakdown?.error)
    .find((value): value is string => typeof value === "string");
  if (error !== undefined) markers.error = error;
  const nonPass = scored.find((row) => row.status !== "pass");
  if (nonPass?.breakdown?.category !== undefined) {
    markers.category = nonPass.breakdown.category;
  }
  return markers;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(squares / (values.length - 1));
}
