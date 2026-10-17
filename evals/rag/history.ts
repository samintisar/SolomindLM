/**
 * Eval history: one JSONL line per metric row of each stored report, so a trend can be read
 * across nights without keeping whole reports. Files live in `evals/rag/history/<split|all>.jsonl`
 * and are committed by the nightly workflow (see `history/README.md`).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { isFlakyMetric } from "./reports/repeats";
import type { EvalReport, MetricStatus } from "./types";

/** Default directory for history files, resolved next to this module. */
export const HISTORY_DIR = fileURLToPath(new URL("./history", import.meta.url));

const METRIC_STATUSES: readonly MetricStatus[] = ["pass", "fail", "warn", "info"];

export interface HistoryRow {
  runId: string;
  /** ISO timestamp of the report */
  timestamp: string;
  commitSha: string;
  /** Split of the run, or "all" when the run had none */
  split: string;
  caseId: string;
  runner: string;
  useCase?: string;
  metric: string;
  status: MetricStatus;
  /** Null when the metric had no finite score */
  score: number | null;
  configHash: string;
  /** Present (and true) only when the repeats disagreed for this row */
  flaky?: true;
}

export interface AppendHistoryOptions {
  /** Split of the run; selects the file. Falls back to `report.split`, then "all". */
  split?: string;
  /** Identifies one run; all rows of the report share it */
  runId: string;
  /** caseId → use-case pack id, so pack rows get a `useCase` field */
  useCaseByCase?: Map<string, string>;
}

/** The file a split's history is stored in. */
export function historyFilePath(dir: string, split?: string): string {
  return join(dir, `${split ?? "all"}.jsonl`);
}

/** One history row per metric row of the report. Pure. */
export function historyRowsFromReport(
  report: EvalReport,
  opts: AppendHistoryOptions
): HistoryRow[] {
  const split = opts.split ?? report.split ?? "all";
  return report.metrics.map((m) => {
    const useCase = opts.useCaseByCase?.get(m.caseId);
    const row: HistoryRow = {
      runId: opts.runId,
      timestamp: report.timestamp,
      commitSha: report.commitSha,
      split,
      caseId: m.caseId,
      runner: m.runner,
      ...(useCase !== undefined ? { useCase } : {}),
      metric: m.metric,
      status: m.status,
      score: Number.isFinite(m.score) ? m.score : null,
      configHash: m.configHash,
      ...(isFlakyMetric(m) ? { flaky: true as const } : {}),
    };
    return row;
  });
}

/** Append a report's rows to its split file. Returns the number of rows written. */
export function appendHistory(dir: string, report: EvalReport, opts: AppendHistoryOptions): number {
  const rows = historyRowsFromReport(report, opts);
  if (rows.length === 0) return 0;
  mkdirSync(dir, { recursive: true });
  const lines = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  appendFileSync(historyFilePath(dir, opts.split ?? report.split), lines);
  return rows.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type guard for one parsed history line. */
export function isHistoryRow(value: unknown): value is HistoryRow {
  if (!isRecord(value)) return false;
  const strings = ["runId", "timestamp", "commitSha", "split", "caseId", "runner", "metric"];
  const hashes = ["configHash"];
  if (!strings.every((k) => typeof value[k] === "string")) return false;
  if (!hashes.every((k) => typeof value[k] === "string")) return false;
  if (typeof value.status !== "string" || !METRIC_STATUSES.includes(value.status as MetricStatus)) {
    return false;
  }
  if (value.score !== null && typeof value.score !== "number") return false;
  if (value.useCase !== undefined && typeof value.useCase !== "string") return false;
  if (value.flaky !== undefined && value.flaky !== true) return false;
  return true;
}

/** Parse JSONL text. Blank lines are ignored; malformed lines are counted in `skipped`. */
export function parseHistoryLines(text: string): { rows: HistoryRow[]; skipped: number } {
  const rows: HistoryRow[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isHistoryRow(parsed)) rows.push(parsed);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { rows, skipped };
}

/** Load a split's history. A missing file is an empty history. */
export function loadHistory(dir: string, split?: string): HistoryRow[] {
  const path = historyFilePath(dir, split);
  if (!existsSync(path)) return [];
  const { rows, skipped } = parseHistoryLines(readFileSync(path, "utf-8"));
  if (skipped > 0) {
    console.warn(`[history] skipped ${skipped} malformed line(s) in ${path}`);
  }
  return rows;
}

// ─── Trend ───────────────────────────────────────────────────

export interface TrendRun {
  runId: string;
  timestamp: string;
  status: MetricStatus;
  /** pass / (pass + warn + fail) for this run's rows; null when nothing was scored */
  passRate: number | null;
}

export interface TrendEntry {
  /** `runner::useCase::metric`; the use case is "-" when absent */
  key: string;
  runner: string;
  useCase?: string;
  metric: string;
  /** Runs in the window, oldest first */
  runs: TrendRun[];
  /** pass / (pass + warn + fail) over every row in the window; null when nothing was scored */
  passRate: number | null;
  latestStatus: MetricStatus;
  /** Latest run is `fail` and the run before it was not (or there is no run before it) */
  newFails: boolean;
  /** The pass rate has strictly decreased over the last 3 or more runs */
  declining: boolean;
}

export interface SummarizeTrendOptions {
  /** Window length in days (default 14) */
  sinceDays?: number;
  /** Reference time in epoch ms (default: now). Exposed for deterministic tests. */
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function rateOf(counts: Record<MetricStatus, number>): number | null {
  const scored = counts.pass + counts.warn + counts.fail;
  return scored === 0 ? null : counts.pass / scored;
}

function runStatus(counts: Record<MetricStatus, number>): MetricStatus {
  if (counts.fail > 0) return "fail";
  if (counts.warn > 0) return "warn";
  if (counts.pass > 0) return "pass";
  return "info";
}

function emptyCounts(): Record<MetricStatus, number> {
  return { pass: 0, fail: 0, warn: 0, info: 0 };
}

/** A strictly decreasing run of pass rates that ends at the latest run, at least 3 long. */
function isDeclining(runs: TrendRun[]): boolean {
  let streak = 1;
  for (let i = runs.length - 1; i > 0; i--) {
    const later = runs[i]?.passRate;
    const earlier = runs[i - 1]?.passRate;
    if (later === null || later === undefined || earlier === null || earlier === undefined) break;
    if (!(earlier > later)) break;
    streak++;
  }
  return streak >= 3;
}

/**
 * Per `runner::useCase::metric` over the window: runs seen, pass rate per run, latest status,
 * whether the latest run is a new fail, and whether the pass rate is declining. Pure.
 */
export function summarizeTrend(rows: HistoryRow[], opts: SummarizeTrendOptions = {}): TrendEntry[] {
  const sinceDays = opts.sinceDays ?? 14;
  const now = opts.now ?? Date.now();
  const cutoff = now - sinceDays * DAY_MS;

  type Bucket = {
    runner: string;
    useCase?: string;
    metric: string;
    byRun: Map<string, { timestamp: number; iso: string; counts: Record<MetricStatus, number> }>;
  };
  const buckets = new Map<string, Bucket>();
  const overall = new Map<string, Record<MetricStatus, number>>();

  for (const row of rows) {
    const ts = Date.parse(row.timestamp);
    if (!(ts >= cutoff)) continue;
    const key = `${row.runner}::${row.useCase ?? "-"}::${row.metric}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        runner: row.runner,
        ...(row.useCase !== undefined ? { useCase: row.useCase } : {}),
        metric: row.metric,
        byRun: new Map(),
      };
      buckets.set(key, bucket);
    }
    let run = bucket.byRun.get(row.runId);
    if (!run) {
      run = { timestamp: ts, iso: row.timestamp, counts: emptyCounts() };
      bucket.byRun.set(row.runId, run);
    }
    run.counts[row.status]++;

    const totals = overall.get(key) ?? emptyCounts();
    totals[row.status]++;
    overall.set(key, totals);
  }

  const entries: TrendEntry[] = [];
  for (const [key, bucket] of buckets) {
    const runs: TrendRun[] = [...bucket.byRun.entries()]
      .sort(([idA, a], [idB, b]) => a.timestamp - b.timestamp || idA.localeCompare(idB))
      .map(([runId, run]) => ({
        runId,
        timestamp: run.iso,
        status: runStatus(run.counts),
        passRate: rateOf(run.counts),
      }));
    const latest = runs[runs.length - 1];
    const previous = runs[runs.length - 2];
    const latestStatus = latest?.status ?? "info";
    entries.push({
      key,
      runner: bucket.runner,
      ...(bucket.useCase !== undefined ? { useCase: bucket.useCase } : {}),
      metric: bucket.metric,
      runs,
      passRate: rateOf(overall.get(key) ?? emptyCounts()),
      latestStatus,
      newFails: latestStatus === "fail" && previous?.status !== "fail",
      declining: isDeclining(runs),
    });
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}
