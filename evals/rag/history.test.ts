import { describe, expect, it } from "vitest";
import {
  type HistoryRow,
  historyRowsFromReport,
  parseHistoryLines,
  summarizeTrend,
} from "./history";
import type { EvalReport, MetricResult, MetricStatus } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-17T12:00:00Z");

function day(offset: number): string {
  return new Date(NOW - offset * DAY).toISOString();
}

function row(
  runId: string,
  timestamp: string,
  status: MetricStatus,
  partial: Partial<HistoryRow> = {}
): HistoryRow {
  return {
    runId,
    timestamp,
    commitSha: "abc12345",
    split: "smoke",
    caseId: "case-1",
    runner: "chat",
    metric: "expected_item_recall",
    status,
    score: status === "pass" ? 1 : 0,
    configHash: "cfg",
    ...partial,
  };
}

/** Rows for one metric key in one run, with `pass` passing rows and `fail` failing rows. */
function runRows(
  runId: string,
  timestamp: string,
  pass: number,
  fail: number,
  partial: Partial<HistoryRow> = {}
): HistoryRow[] {
  return [
    ...Array.from({ length: pass }, (_, i) =>
      row(runId, timestamp, "pass", { caseId: `p-${i}`, ...partial })
    ),
    ...Array.from({ length: fail }, (_, i) =>
      row(runId, timestamp, "fail", { caseId: `f-${i}`, ...partial })
    ),
  ];
}

describe("summarizeTrend", () => {
  it("reports runs seen, pass rate per run in timestamp order, and the latest status", () => {
    const rows = [
      // Deliberately out of order: the summary must sort by timestamp.
      ...runRows("r3", day(1), 1, 1),
      ...runRows("r1", day(3), 2, 0),
      ...runRows("r2", day(2), 1, 1),
    ];

    const [entry] = summarizeTrend(rows, { now: NOW });

    expect(entry?.key).toBe("chat::-::expected_item_recall");
    expect(entry?.runs.map((r) => r.runId)).toEqual(["r1", "r2", "r3"]);
    expect(entry?.runs.map((r) => r.passRate)).toEqual([1, 0.5, 0.5]);
    expect(entry?.runs.length).toBe(3);
    expect(entry?.passRate).toBeCloseTo(4 / 6);
    expect(entry?.latestStatus).toBe("fail");
  });

  it("flags a new fail when the latest run fails and the previous run did not", () => {
    const rows = [...runRows("r1", day(2), 2, 0), ...runRows("r2", day(1), 1, 1)];

    const [entry] = summarizeTrend(rows, { now: NOW });

    expect(entry?.newFails).toBe(true);
  });

  it("does not flag a fail that continues an earlier fail", () => {
    const rows = [...runRows("r1", day(2), 1, 1), ...runRows("r2", day(1), 1, 1)];

    const [entry] = summarizeTrend(rows, { now: NOW });

    expect(entry?.latestStatus).toBe("fail");
    expect(entry?.newFails).toBe(false);
  });

  it("flags a declining pass rate only across at least three strictly decreasing runs", () => {
    const declining = [
      ...runRows("r1", day(3), 4, 0),
      ...runRows("r2", day(2), 3, 1),
      ...runRows("r3", day(1), 2, 2),
    ];
    const flat = [
      ...runRows("r1", day(3), 3, 1),
      ...runRows("r2", day(2), 3, 1),
      ...runRows("r3", day(1), 2, 2),
    ];
    const twoRuns = [...runRows("r1", day(2), 4, 0), ...runRows("r2", day(1), 2, 2)];

    expect(summarizeTrend(declining, { now: NOW })[0]?.declining).toBe(true);
    expect(summarizeTrend(flat, { now: NOW })[0]?.declining).toBe(false);
    expect(summarizeTrend(twoRuns, { now: NOW })[0]?.declining).toBe(false);
  });

  it("keeps runner, use case and metric in the key and drops runs outside the window", () => {
    const rows = [
      ...runRows("old", day(20), 1, 0),
      ...runRows("new", day(1), 1, 0),
      ...runRows("new", day(1), 1, 0, { useCase: "medical-students" }),
      ...runRows("new", day(1), 1, 0, { metric: "citation_validity" }),
    ];

    const entries = summarizeTrend(rows, { now: NOW, sinceDays: 14 });

    expect(entries.map((e) => e.key)).toEqual([
      "chat::-::citation_validity",
      "chat::-::expected_item_recall",
      "chat::medical-students::expected_item_recall",
    ]);
    expect(entries.every((e) => e.runs.length === 1)).toBe(true);
  });

  it("returns no entries for an empty history", () => {
    expect(summarizeTrend([], { now: NOW })).toEqual([]);
  });
});

describe("parseHistoryLines", () => {
  it("parses valid lines, ignores blank lines, and counts malformed ones", () => {
    const good = JSON.stringify(row("r1", day(1), "pass"));
    const text = [good, "", "{not json", JSON.stringify({ runId: "x" }), good].join("\n");

    const { rows, skipped } = parseHistoryLines(text);

    expect(rows).toHaveLength(2);
    expect(skipped).toBe(2);
  });
});

describe("historyRowsFromReport", () => {
  const metric = (partial: Partial<MetricResult>): MetricResult => ({
    metric: "expected_item_recall",
    caseId: "case-1",
    runner: "chat",
    configHash: "cfg",
    status: "pass",
    score: 1,
    detail: "",
    ...partial,
  });

  const report: EvalReport = {
    timestamp: "2026-10-17T03:17:00.000Z",
    commitSha: "abc12345",
    totalCases: 2,
    summary: { pass: 1, fail: 0, warn: 1, info: 0 },
    metrics: [
      metric({}),
      metric({
        caseId: "case-2",
        metric: "binary_judge_chat_grounding",
        status: "warn",
        score: Number.NaN,
        breakdown: { flaky: true },
      }),
    ],
    failureGroups: [],
    flaky: [],
  };

  it("writes one row per metric with the run id, split and flaky flag", () => {
    const rows = historyRowsFromReport(report, {
      runId: "run-1",
      split: "smoke",
      useCaseByCase: new Map([["case-2", "medical-students"]]),
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      runId: "run-1",
      timestamp: "2026-10-17T03:17:00.000Z",
      commitSha: "abc12345",
      split: "smoke",
      caseId: "case-1",
      runner: "chat",
      metric: "expected_item_recall",
      status: "pass",
      score: 1,
      configHash: "cfg",
    });
    expect(rows[1]).toMatchObject({
      useCase: "medical-students",
      status: "warn",
      score: null,
      flaky: true,
    });
  });

  it("uses the report split, then 'all', when no split is given", () => {
    const withSplit = historyRowsFromReport({ ...report, split: "holdout" }, { runId: "r" });
    const without = historyRowsFromReport(report, { runId: "r" });

    expect(withSplit[0]?.split).toBe("holdout");
    expect(without[0]?.split).toBe("all");
  });
});
