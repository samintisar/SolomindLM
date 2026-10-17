import { describe, expect, it } from "vitest";
import type { EvalRunArtifact, MetricResult, MetricStatus } from "../types";
import { type ParetoPoint, paretoFront, summarizeCell } from "./pareto";

const metric = (name: string, caseId: string, status: MetricStatus): MetricResult => ({
  metric: name,
  caseId,
  runner: "chat",
  configHash: "h",
  status,
  score: status === "pass" ? 1 : 0,
  detail: "",
});

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
  it("is the mean of the grounding and item-recall pass rates over cases", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [
        metric("binary_judge_chat_grounding", "c1", "pass"),
        metric("binary_judge_chat_grounding", "c2", "fail"),
        metric("expected_item_recall", "c1", "pass"),
        metric("expected_item_recall", "c2", "pass"),
      ],
      artifacts: [artifact("c1", 100), artifact("c2", 100)],
    });
    expect(summary.grounding).toBe(0.5);
    expect(summary.recall).toBe(1);
    expect(summary.quality).toBe(0.75);
  });

  it("counts info rows as absent rather than as failures", () => {
    const summary = summarizeCell({
      id: "a",
      overrides: {},
      metrics: [
        metric("expected_item_recall", "c1", "pass"),
        metric("expected_item_recall", "c2", "info"),
      ],
      artifacts: [],
    });
    expect(summary.recall).toBe(1);
  });

  it("reads zero for a cell with nothing judged, such as a dry run", () => {
    const summary = summarizeCell({ id: "a", overrides: {}, metrics: [], artifacts: [] });
    expect(summary.quality).toBe(0);
    expect(summary.tokensMean).toBe(0);
    expect(summary.latencyP95).toBe(0);
  });
});

describe("summarizeCell cost and latency", () => {
  it("averages provider tokens and marks the cell as estimated when any artifact is", () => {
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
