/**
 * Print the eval trend over a window of stored history (see history.ts).
 *
 *   bun run eval:trend -- [--split smoke] [--days 14] [--check] [--branch eval-history]
 *
 * `--check` exits 1 when any metric's latest run is a new fail, else 0. A missing or empty
 * history file is not an error: it prints "no history" and exits 0. `--branch` also reads the
 * split file from origin/<branch> (the nightly eval-history branch) and merges it with local rows.
 */

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  HISTORY_DIR,
  type HistoryRow,
  historyFilePath,
  loadHistory,
  parseHistoryLines,
  summarizeTrend,
  type TrendEntry,
} from "./history";

const SPLITS = ["smoke", "train", "holdout", "all"] as const;

export interface TrendOutput {
  text: string;
  /** Entries whose latest run is a new fail */
  newFailCount: number;
}

/** Process exit status: 1 only under `--check` with at least one new fail, else 0. Pure. */
export function exitCodeFor(summary: { newFailCount: number }, opts: { check: boolean }): 0 | 1 {
  return opts.check && summary.newFailCount > 0 ? 1 : 0;
}

/** Dedupe key: one metric row of one run. */
export function historyRowKey(row: HistoryRow): string {
  return [row.runId, row.caseId, row.runner, row.metric].join("\u0000");
}

/** Union of row lists. A row whose key was already seen is dropped; the first occurrence wins. */
export function mergeHistoryRows(...lists: HistoryRow[][]): HistoryRow[] {
  const seen = new Set<string>();
  const merged: HistoryRow[] = [];
  for (const list of lists) {
    for (const row of list) {
      const key = historyRowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

/** Git path of a split's history file, as stored on the history branch. */
export function remoteHistoryPath(split?: string): string {
  return `evals/rag/history/${split ?? "all"}.jsonl`;
}

/** Reads origin/<branch>. Injected so the merge logic is testable without git. */
export interface RemoteHistoryReader {
  /** Fetch origin/<branch>. Returns a reason when the branch is not available. */
  fetchBranch(branch: string): string | undefined;
  /** Text of `path` at origin/<branch>, or undefined when the file is missing. */
  readFile(branch: string, path: string): string | undefined;
}

export interface MergedHistory {
  rows: HistoryRow[];
  /** Human-readable notes (missing branch or file, skipped lines) */
  notes: string[];
}

/**
 * Local rows, plus the split file from origin/<branch> when `branch` is given. A missing branch
 * or file counts as empty and adds a note. Remote rows come first, so they win on duplicates.
 */
export function loadMergedHistory(
  opts: { local: HistoryRow[]; split?: string; branch?: string },
  reader: RemoteHistoryReader
): MergedHistory {
  if (!opts.branch) return { rows: opts.local, notes: [] };
  const branch = opts.branch;
  const notes: string[] = [];
  const fetchError = reader.fetchBranch(branch);
  if (fetchError !== undefined) {
    notes.push(`note: origin/${branch} not available (${fetchError}); using local rows only`);
    return { rows: opts.local, notes };
  }

  const path = remoteHistoryPath(opts.split);
  const text = reader.readFile(branch, path);
  if (text === undefined) {
    notes.push(`note: ${path} not found on origin/${branch}; treated as empty`);
    return { rows: opts.local, notes };
  }
  const parsed = parseHistoryLines(text);
  if (parsed.skipped > 0) {
    notes.push(`note: skipped ${parsed.skipped} malformed line(s) in origin/${branch}:${path}`);
  }
  return { rows: mergeHistoryRows(parsed.rows, opts.local), notes };
}

/** Production reader: plain git, no shell. */
export const gitHistoryReader: RemoteHistoryReader = {
  fetchBranch(branch) {
    try {
      execFileSync(
        "git",
        ["fetch", "--quiet", "origin", `${branch}:refs/remotes/origin/${branch}`],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
      return undefined;
    } catch {
      return "fetch failed or no such branch";
    }
  },
  readFile(branch, path) {
    try {
      return execFileSync("git", ["show", `origin/${branch}:${path}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return undefined;
    }
  },
};

function parseBranch(value: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith("-")) {
    throw new Error(`Invalid --branch "${value}".`);
  }
  return value;
}

function percent(rate: number | null): string {
  return rate === null ? "-" : `${Math.round(rate * 100)}%`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

/** Render the trend as a table plus the "new fails" and "declining" lists. Pure. */
export function formatTrend(
  entries: TrendEntry[],
  opts: { days: number; split?: string }
): TrendOutput {
  const label = opts.split ?? "all";
  if (entries.length === 0) {
    return {
      text: `no history: no ${label} rows in the last ${opts.days} day(s)`,
      newFailCount: 0,
    };
  }

  const header = ["Runner", "Use case", "Metric", "Runs", "Pass rate", "Latest", "Flags"];
  const rows = entries.map((e) => {
    const flags = [e.newFails ? "NEW FAIL" : "", e.declining ? "declining" : ""].filter(Boolean);
    return [
      e.runner,
      e.useCase ?? "-",
      e.metric,
      String(e.runs.length),
      percent(e.passRate),
      e.latestStatus,
      flags.join(", ") || "-",
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const renderRow = (cells: string[]) =>
    cells
      .map((c, i) => pad(c, widths[i] ?? 0))
      .join("  ")
      .trimEnd();

  const newFails = entries.filter((e) => e.newFails);
  const declining = entries.filter((e) => e.declining);
  const list = (items: TrendEntry[]) =>
    items.length === 0
      ? ["  none"]
      : items.map((e) => `  - ${e.runner} / ${e.useCase ?? "-"} / ${e.metric}`);

  const lines = [
    `Eval trend: ${label}, last ${opts.days} day(s), ${entries.length} metric row(s)`,
    "",
    renderRow(header),
    renderRow(widths.map((w) => "-".repeat(w))),
    ...rows.map(renderRow),
    "",
    "New fails since previous run:",
    ...list(newFails),
    "",
    "Declining (pass rate fell over the last 3+ runs):",
    ...list(declining),
  ];
  return { text: lines.join("\n"), newFailCount: newFails.length };
}

function parseDays(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1) {
    throw new Error("--days takes a positive integer.");
  }
  return n;
}

function parseSplitArg(value: string): string {
  if (!(SPLITS as readonly string[]).includes(value)) {
    throw new Error(`Invalid --split "${value}". Use ${SPLITS.join(", ")}.`);
  }
  return value;
}

function main(): void {
  let values: { split?: string; days?: string; check?: boolean; branch?: string };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        split: { type: "string" },
        days: { type: "string" },
        check: { type: "boolean" },
        branch: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  let days: number;
  let split: string | undefined;
  let branch: string | undefined;
  try {
    days = values.days !== undefined ? parseDays(values.days) : 14;
    split = values.split !== undefined ? parseSplitArg(values.split) : undefined;
    branch = values.branch !== undefined ? parseBranch(values.branch) : undefined;
  } catch (err) {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const local = loadHistory(HISTORY_DIR, split);
  const merged = loadMergedHistory({ local, split, branch }, gitHistoryReader);
  for (const note of merged.notes) console.log(note);
  const entries = summarizeTrend(merged.rows, { sinceDays: days });
  const { text, newFailCount } = formatTrend(entries, { days, split });
  console.log(text);
  if (merged.rows.length === 0) {
    console.log(`(file: ${historyFilePath(HISTORY_DIR, split)})`);
  }

  process.exit(exitCodeFor({ newFailCount }, { check: values.check ?? false }));
}

if (import.meta.main) main();
