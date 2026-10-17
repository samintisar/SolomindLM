/**
 * Per-cell summary for a sweep, and the Pareto front over (quality up, tokens down, p95 latency
 * down). Pure: takes the metric rows and artifacts a cell produced.
 */

import type { ChatConfigOverrides } from "../../../convex/_agents/chat/chatConfigOverrides";
import type { EvalRunArtifact, MetricResult } from "../types";

/** The two judged metrics quality is built from. */
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
  /** Mean of the two metric pass rates */
  quality: number;
  /** Pass rate of binary_judge_chat_grounding over judged cases */
  grounding: number;
  /** Pass rate of expected_item_recall over judged cases */
  recall: number;
  /** Cases with an artifact in this cell */
  cases: number;
  /** Mean provider tokens per case (0 when none were reported) */
  tokensMean: number;
  /** True when any artifact's tokens were estimated, not reported by the provider */
  tokensEstimated: boolean;
  /** Nearest-rank 95th percentile of case latency, ms */
  latencyP95: number;
  /** Mean selected-context tokens per case, estimated from characters (~4 per token) */
  selectedTokensMean: number;
  /** On the Pareto front (set by the sweep, not by summarizeCell) */
  pareto: boolean;
}

/** The three values the Pareto front compares. */
export interface ParetoPoint {
  quality: number;
  tokensMean: number;
  latencyP95: number;
}

/** Pass rate of one metric: pass over pass + fail + warn. Info rows are absent. */
function passRate(metrics: MetricResult[], name: string): number {
  const judged = metrics.filter((m) => m.metric === name && m.status !== "info");
  if (judged.length === 0) return 0;
  return judged.filter((m) => m.status === "pass").length / judged.length;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
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
  const tokenTotals = input.artifacts.map((a) => a.tokenUsage?.total ?? 0);
  const selectedTokens = input.artifacts.map((a) =>
    a.selectedChunks.reduce((sum, c) => sum + estimatedTokens(c.content), 0)
  );
  return {
    id: input.id,
    overrides: input.overrides,
    quality: mean([grounding, recall]),
    grounding,
    recall,
    cases: input.artifacts.length,
    tokensMean: mean(tokenTotals),
    tokensEstimated: input.artifacts.some((a) => a.tokenUsageSource === "estimated"),
    latencyP95: nearestRank(
      input.artifacts.map((a) => a.latencyMs),
      0.95
    ),
    selectedTokensMean: mean(selectedTokens),
    pareto: false,
  };
}

/** The cells with `pareto` set on the ones on the front. */
export function markPareto(cells: CellSummary[]): CellSummary[] {
  const front = new Set(paretoFront(cells));
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
