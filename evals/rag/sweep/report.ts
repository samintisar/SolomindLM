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

/** Quality high to low, then tokens low to high, then latency low to high, then id. */
export function sortForReport(cells: CellSummary[]): CellSummary[] {
  return [...cells].sort(
    (a, b) =>
      b.quality - a.quality ||
      a.tokensMean - b.tokensMean ||
      a.latencyP95 - b.latencyP95 ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** `key=value` pairs in key order, or the baseline name for the empty set. */
function formatOverrides(overrides: ChatConfigOverrides): string {
  const pairs = Object.entries(overrides)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length > 0 ? pairs.join(", ") : "(baseline)";
}

const pct = (share: number) => share.toFixed(3);

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
    "Quality is the mean of the grounding and item-recall pass rates. `*` marks the Pareto front " +
      "(quality up, tokens down, p95 latency down). Tokens marked (est.) are estimated, not reported by the provider.",
    "",
    "| front | cell | overrides | quality | grounding | recall | tokens/case | p95 ms | selected tok (est.) | cases |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of sortForReport(cells)) {
    lines.push(
      `| ${c.pareto ? "*" : " "} | ${c.id} | ${formatOverrides(c.overrides)} | ${pct(c.quality)} | ` +
        `${pct(c.grounding)} | ${pct(c.recall)} | ${Math.round(c.tokensMean)}${c.tokensEstimated ? " (est.)" : ""} | ` +
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
