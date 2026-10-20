/**
 * Sweep output: the markdown table and the JSON record for one sweep.
 */

import type { ChatConfigOverrides } from "../../../convex/_agents/chat/chatConfigOverrides";
import type { CellSummary } from "./pareto";

export interface SweepMeta {
  split: string;
  repeats: number;
  dryRun: boolean;
  /** The `--grid` text the sweep was run with, if any */
  grid?: string;
}

export interface SweepReport extends SweepMeta {
  generatedAt: string;
  baselineId: string;
  /** Ids of the cells on the Pareto front */
  paretoIds: string[];
  cells: CellSummary[];
}

/**
 * Quality high to low, then tokens low to high, then latency low to high, then id. A cell with
 * no quality or no token figure sorts after the ones that have them.
 */
export function sortForReport(cells: CellSummary[]): CellSummary[] {
  return [...cells].sort(
    (a, b) =>
      compareDesc(a.quality, b.quality) ||
      compareAsc(a.tokensMean, b.tokensMean) ||
      a.latencyP95 - b.latencyP95 ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Higher first; a missing value last. */
function compareDesc(a: number | null, b: number | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return b - a;
}

/** Lower first; a missing value last. */
function compareAsc(a: number | null, b: number | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return a - b;
}

/** `key=value` pairs in key order, or the baseline name for the empty set. */
function formatOverrides(overrides: ChatConfigOverrides): string {
  const pairs = Object.entries(overrides)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length > 0 ? pairs.join(", ") : "(baseline)";
}

/** A rate to three decimals, or n/a when nothing was judged. */
const rate = (share: number | null): string => (share === null ? "n/a" : share.toFixed(3));

export function renderSweepMarkdown(cells: CellSummary[], meta: SweepMeta): string {
  const lines = [
    `# Chat config sweep: ${cells.length} cell(s), split ${meta.split}, ${meta.repeats} repeat(s)${meta.dryRun ? " (dry run)" : ""}`,
    "",
    ...(meta.grid ? [`Grid: \`${meta.grid}\``, ""] : []),
    ...(meta.dryRun
      ? [
          "Dry run: the artifacts are stubs, so these figures show that the pipeline ran, not how the configs compare.",
          "",
        ]
      : []),
    "Quality is the mean of the grounding and item-recall pass rates, over the components that have cases; n/a means no case had that component. " +
      "Recall counts only cases with expected items. `*` marks the Pareto front (quality up, tokens down, p95 latency down); " +
      "a cell with no quality or no token figure is never on it. Tokens marked (est.) are estimated, and (partial) means some cases reported no tokens.",
    "",
    "| front | cell | overrides | quality | grounding (cases) | recall (cases) | tokens/case | p95 ms | selected tok (est.) | cases |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of sortForReport(cells)) {
    const tokens =
      c.tokensMean === null
        ? "n/a"
        : `${Math.round(c.tokensMean)}${c.tokensEstimated ? " (est.)" : ""}${c.tokensPartial ? " (partial)" : ""}`;
    lines.push(
      `| ${c.pareto ? "*" : " "} | ${c.id} | ${formatOverrides(c.overrides)} | ${rate(c.quality)} | ` +
        `${rate(c.grounding)} (${c.groundingCases}) | ${rate(c.recall)} (${c.recallCases}) | ${tokens} | ` +
        `${Math.round(c.latencyP95)} | ${Math.round(c.selectedTokensMean)} | ${c.cases} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

export function sweepReport(cells: CellSummary[], meta: SweepMeta): SweepReport {
  const sorted = sortForReport(cells);
  return {
    ...meta,
    generatedAt: new Date().toISOString(),
    baselineId: sorted.find((c) => Object.keys(c.overrides).length === 0)?.id ?? "",
    paretoIds: sorted.filter((c) => c.pareto).map((c) => c.id),
    cells: sorted,
  };
}
