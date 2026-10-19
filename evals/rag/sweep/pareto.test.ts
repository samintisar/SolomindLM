import { describe, expect, it } from "vitest";
import type { EvalRunArtifact, MetricResult, MetricStatus } from "../types";
import {
  type CellSummary,
  markPareto,
  type ParetoPoint,
  paretoFront,
  summarizeCell,
} from "./pareto";

const metric = (
  name: string,
  caseId: string,
  status: MetricStatus,
  breakdown?: Record<string, unknown>
): MetricResult => ({
  metric: name,
  caseId,
  runner: "chat",
  configHash: "h",
  status,
  score: status === "pass" ? 1 : 0,
  detail: "",
  breakdown,
});

/** An expected_item_recall row for a case that has expected items (matched or unmatched). */
const recallWithItems = (caseId: string, status: MetricStatus) =>
  metric("expected_item_recall", caseId, status, { matched: ["a"], unmatched: [] });

/** An expected_item_recall row for a case with no expected items: passes by definition. */
const recallWithoutItems = (caseId: string) =>
  metric("expected_item_recall", caseId, "pass", { matched: [], unmatched: [] });

const grounding = (caseId: string, status: MetricStatus) =>
  metric("binary_judge_chat_grounding", caseId, status);

const artifact = (
  caseId: string,
  latencyMs: number,
  options: {
    total?: number;
    source?: "provider" | "estimated";
    selectedChunkChars?: number;
  } = {}
): EvalRunArtifact => ({
  caseId,
  runner: "chat",
  configHash: "h",
  answer: "",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: options.selectedChunkChars
    ? [{ id: "1", sourceTitle: "s", content: "x".repeat(options.selectedChunkChars) }]
    : [],
  subQueries: [],
  latencyMs,
  tokenUsage:
    options.total !== undefined
      ? { prompt: options.total, completion: 0, total: options.total }
      : undefined,
  tokenUsageSource: options.source,
  timestamp: "t",
});

describe("summarizeCell quality", () => {
  it("is the mean of the grounding and item-recall pass rates", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [
        grounding("c1", "pass"),
        grounding("c2", "fail"),
        recallWithItems("c1", "pass"),
        recallWithItems("c2", "pass"),
      ],
      artifacts: [artifact("c1", 100), artifact("c2", 100)],
    });
    expect(summary.grounding).toBe(0.5);
    expect(summary.groundingCases).toBe(2);
    expect(summary.recall).toBe(1);
    expect(summary.recallCases).toBe(2);
    expect(summary.quality).toBe(0.75);
  });

  it("leaves out recall for fixtures without expected items", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [grounding("c1", "fail"), recallWithoutItems("c1"), recallWithoutItems("c2")],
      artifacts: [artifact("c1", 100), artifact("c2", 100)],
    });
    expect(summary.recall).toBeNull();
    expect(summary.recallCases).toBe(0);
    expect(summary.quality).toBe(0);
  });

  it("uses only the components that have a case", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [grounding("c1", "pass"), grounding("c2", "pass")],
      artifacts: [artifact("c1", 100), artifact("c2", 100)],
    });
    expect(summary.recall).toBeNull();
    expect(summary.quality).toBe(1);
  });

  it("counts info rows as absent rather than as failures", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [recallWithItems("c1", "pass"), metric("expected_item_recall", "c2", "info")],
      artifacts: [],
    });
    expect(summary.recall).toBe(1);
    expect(summary.recallCases).toBe(1);
  });

  it("is null, not zero, for a cell with nothing judged", () => {
    const summary = summarizeCell({ id: "a", overrides: {}, metrics: [], artifacts: [] });
    expect(summary.quality).toBeNull();
    expect(summary.grounding).toBeNull();
    expect(summary.recall).toBeNull();
    expect(summary.tokensMean).toBeNull();
    expect(summary.latencyP95).toBe(0);
  });
});

describe("summarizeCell cost and latency", () => {
  it("averages the reported tokens and marks the cell as estimated when any artifact is", () => {
    const provider = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [],
      artifacts: [
        artifact("c1", 1, { total: 100, source: "provider" }),
        artifact("c2", 1, { total: 300, source: "provider" }),
      ],
    });
    expect(provider.tokensMean).toBe(200);
    expect(provider.tokensPartial).toBe(false);
    expect(provider.tokensEstimated).toBe(false);

    const mixed = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [],
      artifacts: [
        artifact("c1", 1, { total: 100, source: "provider" }),
        artifact("c2", 1, { total: 300, source: "estimated" }),
      ],
    });
    expect(mixed.tokensEstimated).toBe(true);
  });

  it("leaves artifacts without token usage out of the mean and marks the cell partial", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [],
      artifacts: [artifact("c1", 1, { total: 100 }), artifact("c2", 1)],
    });
    expect(summary.tokensMean).toBe(100);
    expect(summary.tokensPartial).toBe(true);
  });

  it("has no token mean when no artifact reported tokens", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [],
      artifacts: [artifact("c1", 1)],
    });
    expect(summary.tokensMean).toBeNull();
    expect(summary.tokensPartial).toBe(false);
  });

  it("takes the nearest-rank 95th percentile of latency", () => {
    const artifacts = Array.from({ length: 20 }, (_, i) => artifact(`c${i}`, i + 1));
    expect(summarizeCell({ id: "a", overrides: {}, metrics: [], artifacts }).latencyP95).toBe(19);
  });

  it("estimates selected context tokens from characters", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [],
      artifacts: [artifact("c1", 1, { selectedChunkChars: 40 })],
    });
    expect(summary.selectedTokensMean).toBe(10);
  });
});

describe("paretoFront", () => {
  const point = (
    id: string,
    quality: number,
    tokensMean: number,
    latencyP95: number
  ): ParetoPoint & { id: string } => ({ id, quality, tokensMean, latencyP95 });

  it("keeps the cells no other cell beats on all three axes", () => {
    const front = paretoFront([
      point("A", 0.9, 100, 500),
      point("B", 0.8, 50, 400),
      // Worse than A on quality and latency, more tokens than A: dominated.
      point("C", 0.8, 120, 600),
      // Same quality and latency as A, more tokens: dominated by A.
      point("D", 0.9, 200, 500),
    ]);
    expect(front.map((p) => p.id)).toEqual(["A", "B"]);
  });

  it("keeps two identical cells, since neither beats the other", () => {
    const front = paretoFront([point("A", 0.5, 10, 10), point("B", 0.5, 10, 10)]);
    expect(front.map((p) => p.id)).toEqual(["A", "B"]);
  });
});

describe("markPareto eligibility", () => {
  const cell = (id: string, values: Partial<CellSummary>): CellSummary => ({
    id,
    overrides: {},
    quality: 0.5,
    grounding: 0.5,
    groundingCases: 1,
    recall: null,
    recallCases: 0,
    cases: 1,
    tokensMean: 100,
    tokensPartial: false,
    tokensEstimated: false,
    latencyP95: 100,
    selectedTokensMean: 0,
    pareto: false,
    ...values,
  });

  it("never puts a cell without token data on the front", () => {
    const flagged = markPareto([cell("tokens-missing", { tokensMean: null, quality: 1 })]);
    expect(flagged[0]?.pareto).toBe(false);
  });

  it("never puts a cell without quality on the front", () => {
    const flagged = markPareto([cell("no-quality", { quality: null })]);
    expect(flagged[0]?.pareto).toBe(false);
  });

  it("compares only the eligible cells", () => {
    // The cell with no token data would dominate on quality and latency if it were compared.
    const flagged = markPareto([
      cell("missing", { tokensMean: null, quality: 1, latencyP95: 1 }),
      cell("kept", { quality: 0.5, tokensMean: 100, latencyP95: 100 }),
    ]);
    expect(flagged.map((c) => [c.id, c.pareto])).toEqual([
      ["missing", false],
      ["kept", true],
    ]);
  });
});
