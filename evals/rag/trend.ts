/**
 * Print the eval trend over a window of stored history (see history.ts).
 *
 *   bun run eval:trend -- [--split smoke] [--days 14] [--check]
 *
 * `--check` exits 1 when any metric's latest run is a new fail, else 0. A missing or empty
 * history file is not an error: it prints "no history" and exits 0.
 */

import { parseArgs } from "node:util";
import {
  HISTORY_DIR,
  historyFilePath,
  loadHistory,
  summarizeTrend,
  type TrendEntry,
} from "./history";

const SPLITS = ["smoke", "train", "holdout", "all"] as const;

export interface TrendOutput {
  text: string;
  /** Entries whose latest run is a new fail */
  newFailCount: number;
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
  let values: { split?: string; days?: string; check?: boolean };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        split: { type: "string" },
        days: { type: "string" },
        check: { type: "boolean" },
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
  try {
    days = values.days !== undefined ? parseDays(values.days) : 14;
    split = values.split !== undefined ? parseSplitArg(values.split) : undefined;
  } catch (err) {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const history = loadHistory(HISTORY_DIR, split);
  const entries = summarizeTrend(history, { sinceDays: days });
  const { text, newFailCount } = formatTrend(entries, { days, split });
  console.log(text);
  if (history.length === 0) {
    console.log(`(file: ${historyFilePath(HISTORY_DIR, split)})`);
  }

  if (values.check && newFailCount > 0) process.exit(1);
  process.exit(0);
}

if (import.meta.main) main();
