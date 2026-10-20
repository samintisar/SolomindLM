/**
 * Per-cell summary for a sweep, and the Pareto front over (quality up, tokens down, p95 latency
 * down). Pure: takes the metric rows and artifacts a cell produced.
 *
 * Missing data is `null`, never 0: a component with no judged cases is "n/a", it is left out of
 * quality, and a cell without token data cannot sit on the front.
 */

import type { ChatConfigOverrides } from "../../../convex/_agents/chat/chatConfigOverrides";
import type { EvalRunArtifact, MetricResult } from "../types";

const GROUNDING_METRIC = "binary_judge_chat_grounding";
const RECALL_METRIC = "expected_item_recall";

export interface CellInput {
  id: string;
  overrides: ChatConfigOverrides;
  /** Metric rows of every case in the cell (aggregated over repeats) */
  metrics: MetricResult[];
  /** Artifacts of the cell's first repeat */
  artifacts: EvalRunArtifact[];
}

export interface CellSummary {
  id: string;
  overrides: ChatConfigOverrides;
  /** Mean of the components that have at least one case; null when neither has one */
  quality: number | null;
  /** Pass rate of binary_judge_chat_grounding over judged cases; null when none were judged */
  grounding: number | null;
  groundingCases: number;
  /**
   * Pass rate of expected_item_recall over the cases that have expected items; null when none
   * did. Fixtures without expectedItems pass that metric by definition, so they are left out.
   */
  recall: number | null;
  recallCases: number;
  /** Cases with an artifact in this cell */
  cases: number;
  /** Mean provider tokens per case that reported them; null when no case did */
  tokensMean: number | null;
  /** Some case reported no tokens, so tokensMean covers only part of the cell */
  tokensPartial: boolean;
  /** True when any artifact's tokens were estimated, not reported by the provider */
  tokensEstimated: boolean;
  /** Nearest-rank 95th percentile of case latency, ms */
  latencyP95: number;
  /** Mean selected-context tokens per case, estimated from characters (~4 per token) */
  selectedTokensMean: number;
  /** On the Pareto front (set by markPareto, never by summarizeCell) */
  pareto: boolean;
}

/** The three values the Pareto front compares. */
export interface ParetoPoint {
  quality: number;
  tokensMean: number;
  latencyP95: number;
}

/** A metric row counts as a judged case unless it is info. Recall rows need expected items. */
function isJudgedRow(row: MetricResult): boolean {
  if (row.status === "info") return false;
  if (row.metric !== RECALL_METRIC) return true;
  const breakdown = row.breakdown ?? {};
  const matched = Array.isArray(breakdown.matched) ? breakdown.matched.length : 0;
  const unmatched = Array.isArray(breakdown.unmatched) ? breakdown.unmatched.length : 0;
  return matched + unmatched > 0;
}

/** Pass rate over pass + fail + warn rows of one metric, and how many rows that was. */
function passRate(metrics: MetricResult[], name: string): { rate: number | null; cases: number } {
  const judged = metrics.filter((m) => m.metric === name && isJudgedRow(m));
  if (judged.length === 0) return { rate: null, cases: 0 };
  const passes = judged.filter((m) => m.status === "pass").length;
  return { rate: passes / judged.length, cases: judged.length };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Nearest-rank percentile: the value at ceil(p × n) of the sorted list. */
function nearestRank(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function estimatedTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function summarizeCell(input: CellInput): CellSummary {
  const grounding = passRate(input.metrics, GROUNDING_METRIC);
  const recall = passRate(input.metrics, RECALL_METRIC);
  const components = [grounding.rate, recall.rate].filter((r): r is number => r !== null);
  const reported = input.artifacts.flatMap((a) => (a.tokenUsage ? [a.tokenUsage.total] : []));
  const selectedTokens = input.artifacts.map((a) =>
    a.selectedChunks.reduce((sum, c) => sum + estimatedTokens(c.content), 0)
  );
  return {
    id: input.id,
    overrides: input.overrides,
    quality: mean(components),
    grounding: grounding.rate,
    groundingCases: grounding.cases,
    recall: recall.rate,
    recallCases: recall.cases,
    cases: input.artifacts.length,
    tokensMean: mean(reported),
    tokensPartial: reported.length > 0 && reported.length < input.artifacts.length,
    tokensEstimated: input.artifacts.some((a) => a.tokenUsageSource === "estimated"),
    latencyP95: nearestRank(
      input.artifacts.map((a) => a.latencyMs),
      0.95
    ),
    selectedTokensMean: mean(selectedTokens) ?? 0,
    pareto: false,
  };
}

/**
 * The cells with `pareto` set on the ones on the front. Only cells with a quality and a token
 * figure can be on it: a cell without them is not comparable on those axes.
 */
export function markPareto(cells: CellSummary[]): CellSummary[] {
  const eligible = cells.filter(
    (c): c is CellSummary & ParetoPoint => c.quality !== null && c.tokensMean !== null
  );
  const front = new Set<CellSummary>(paretoFront(eligible));
  return cells.map((c) => ({ ...c, pareto: front.has(c) }));
}

/**
 * The points no other point beats: a point is dominated when another is at least as good on all
 * three values and strictly better on one. Identical points dominate neither.
 */
export function paretoFront<T extends ParetoPoint>(points: T[]): T[] {
  return points.filter(
    (p) =>
      !points.some(
        (q) =>
          q !== p &&
          q.quality >= p.quality &&
          q.tokensMean <= p.tokensMean &&
          q.latencyP95 <= p.latencyP95 &&
          (q.quality > p.quality || q.tokensMean < p.tokensMean || q.latencyP95 < p.latencyP95)
      )
  );
}
