import { describe, expect, it } from "vitest";
import type { MetricResult, MetricStatus } from "../types";
import { aggregateRepeatMetrics, isFlakyMetric } from "./repeats";

function row(
  status: MetricStatus,
  score: number,
  partial: Partial<MetricResult> = {}
): MetricResult {
  return {
    metric: "binary_judge_chat_grounding",
    caseId: "case-1",
    runner: "chat",
    configHash: "hash",
    status,
    score,
    detail: `detail ${status}`,
    breakdown: { evidence: 2 },
    ...partial,
  };
}

describe("aggregateRepeatMetrics", () => {
  it("returns a single run unchanged", () => {
    const run = [row("pass", 1), row("info", 0, { metric: "latency" })];
    expect(aggregateRepeatMetrics([run])).toEqual(run);
  });

  it("returns no rows for no runs", () => {
    expect(aggregateRepeatMetrics([])).toEqual([]);
  });

  it("keeps a stable pass as pass with the mean score and pass^k fields", () => {
    const result = aggregateRepeatMetrics([[row("pass", 1)], [row("pass", 0.5)], [row("pass", 1)]]);

    expect(result).toHaveLength(1);
    const [agg] = result;
    expect(agg?.status).toBe("pass");
    expect(agg?.score).toBeCloseTo(5 / 6);
    expect(agg?.breakdown).toEqual({
      evidence: 2,
      repeats: 3,
      scores: [1, 0.5, 1],
      passAll: true,
      passAny: true,
    });
    expect(isFlakyMetric(agg!)).toBe(false);
  });

  it("keeps a stable fail as fail with passAll and passAny false", () => {
    const result = aggregateRepeatMetrics([[row("fail", 0)], [row("fail", 0.2)]]);

    expect(result[0]?.status).toBe("fail");
    expect(result[0]?.breakdown).toMatchObject({ repeats: 2, passAll: false, passAny: false });
  });

  it("majority fail: 2 of 3 repeats failing merges to fail, flaky", () => {
    const result = aggregateRepeatMetrics([[row("fail", 0)], [row("pass", 1)], [row("fail", 0)]]);

    expect(result[0]?.status).toBe("fail");
    expect(result[0]?.breakdown).toMatchObject({
      flaky: true,
      statuses: ["fail", "pass", "fail"],
      passAll: false,
      passAny: true,
    });
    expect(isFlakyMetric(result[0]!)).toBe(true);
  });

  it("half failing counts as fail: 1 of 2 repeats", () => {
    const result = aggregateRepeatMetrics([[row("pass", 1)], [row("fail", 0)]]);
    expect(result[0]?.status).toBe("fail");
    expect(result[0]?.breakdown).toMatchObject({ flaky: true });
  });

  it("minority fail: 1 of 3 repeats failing merges to a flaky warn", () => {
    const result = aggregateRepeatMetrics([
      [row("pass", 1, { detail: "first run" })],
      [row("fail", 0)],
      [row("pass", 1)],
    ]);

    const [agg] = result;
    expect(agg?.status).toBe("warn");
    expect(agg?.score).toBeCloseTo(2 / 3);
    expect(agg?.detail).toBe("Flaky across 3 repeats: pass, fail, pass. First: first run");
    expect(agg?.breakdown).toMatchObject({
      evidence: 2,
      repeats: 3,
      flaky: true,
      statuses: ["pass", "fail", "pass"],
      scores: [1, 0, 1],
      passAll: false,
      passAny: true,
    });
    expect(agg?.breakdown?.mean).toBeCloseTo(2 / 3);
    expect(agg?.breakdown?.stdev).toBeCloseTo(Math.sqrt(1 / 3));
    expect(isFlakyMetric(agg!)).toBe(true);
  });

  it("passes info rows through unchanged when every repeat is info", () => {
    const info = row("info", 0, { metric: "token_usage", breakdown: { total: 10 } });
    const result = aggregateRepeatMetrics([[info], [{ ...info, breakdown: { total: 12 } }]]);

    expect(result).toEqual([info]);
    expect(result[0]?.breakdown).toEqual({ total: 10 });
  });

  it("ignores info when comparing statuses: info plus pass is a stable pass", () => {
    const result = aggregateRepeatMetrics([[row("info", 0)], [row("pass", 1)], [row("pass", 1)]]);

    expect(result[0]?.status).toBe("pass");
    expect(result[0]?.breakdown).toMatchObject({ repeats: 3, passAll: true, passAny: true });
    expect(isFlakyMetric(result[0]!)).toBe(false);
  });

  it("drops non-finite scores before averaging, and scores 0 when none are finite", () => {
    const some = aggregateRepeatMetrics([
      [row("pass", 1)],
      [row("pass", Number.NaN)],
      [row("pass", 0)],
    ]);
    expect(some[0]?.score).toBeCloseTo(0.5);
    expect(some[0]?.breakdown?.scores).toEqual([1, 0]);

    const none = aggregateRepeatMetrics([[row("fail", Number.NaN)], [row("fail", Infinity)]]);
    expect(none[0]?.score).toBe(0);
    expect(none[0]?.status).toBe("fail");
  });

  it("treats a metric missing from some repeats as flaky: lone pass is a warn", () => {
    // binary_judge_citation_valid is produced only in repeat 1 of 3.
    const runs = [
      [row("pass", 1), row("pass", 1, { metric: "binary_judge_citation_valid" })],
      [row("pass", 1)],
      [row("pass", 1)],
    ];
    const result = aggregateRepeatMetrics(runs);
    const citation = result.find((r) => r.metric === "binary_judge_citation_valid");

    expect(citation?.status).toBe("warn");
    expect(citation?.breakdown).toMatchObject({
      repeats: 3,
      flaky: true,
      statuses: ["pass", "missing", "missing"],
      passAll: false,
      passAny: true,
    });
  });

  it("treats a lone fail among 3 runs as a flaky warn (not a majority)", () => {
    const runs = [
      [row("fail", 0, { metric: "binary_judge_citation_valid" })],
      [row("pass", 1)],
      [row("pass", 1)],
    ];
    const citation = aggregateRepeatMetrics(runs).find(
      (r) => r.metric === "binary_judge_citation_valid"
    );

    expect(citation?.status).toBe("warn");
    expect(citation?.breakdown).toMatchObject({ repeats: 3, flaky: true });
  });

  it("carries judge-error markers onto the merged breakdown", () => {
    const result = aggregateRepeatMetrics([
      [row("warn", 0, { breakdown: { judgeError: true } })],
      [row("pass", 1, { breakdown: { error: "HTTP 503" } })],
    ]);

    expect(result[0]?.breakdown).toMatchObject({ judgeError: true, error: "HTTP 503" });
  });

  it("takes category from the first non-pass row", () => {
    const result = aggregateRepeatMetrics([
      [row("pass", 1, { breakdown: { category: "retrieval_coverage" } })],
      [row("fail", 0, { breakdown: { category: "context_selection" } })],
      [row("fail", 0, { breakdown: { category: "prompt_answering" } })],
    ]);

    expect(result[0]?.breakdown?.category).toBe("context_selection");
  });

  it("aggregates each caseId, runner and metric separately, in first-run order", () => {
    const first = [
      row("pass", 1, { metric: "a" }),
      row("pass", 1, { metric: "b", caseId: "case-2" }),
      row("fail", 0, { metric: "c", runner: "research" }),
    ];
    const second = [
      row("pass", 1, { metric: "a" }),
      row("pass", 1, { metric: "b", caseId: "case-2" }),
      row("fail", 0, { metric: "c", runner: "research" }),
    ];

    const result = aggregateRepeatMetrics([first, second]);

    expect(result.map((r) => `${r.caseId}::${r.runner}::${r.metric}`)).toEqual([
      "case-1::chat::a",
      "case-2::chat::b",
      "case-1::research::c",
    ]);
  });
});
