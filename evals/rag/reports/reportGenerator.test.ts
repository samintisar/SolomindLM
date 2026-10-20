import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { formatReport, generateReport } from "./reportGenerator";

const base = { caseId: "case-1", runner: "chat" as const, configHash: "hash" };

function flakyRow(): MetricResult {
  return {
    ...base,
    metric: "binary_judge_chat_grounding",
    status: "warn",
    score: 0.5,
    detail: "Flaky across 2 repeats: pass, fail. First: ok",
    breakdown: { flaky: true, statuses: ["pass", "fail"], repeats: 2 },
  };
}

function passRow(): MetricResult {
  return { ...base, metric: "expected_item_recall", status: "pass", score: 1, detail: "ok" };
}

describe("generateReport flaky rows", () => {
  it("lists flaky rows separately and counts them as warnings", () => {
    const report = generateReport([passRow(), flakyRow()], { commitSha: "abc" });

    expect(report.flaky).toEqual([
      {
        caseId: "case-1",
        runner: "chat",
        metric: "binary_judge_chat_grounding",
        statuses: ["pass", "fail"],
      },
    ]);
    expect(report.summary).toMatchObject({ pass: 1, fail: 0, warn: 1 });
  });

  it("keeps flaky warnings out of failureGroups", () => {
    const report = generateReport([flakyRow()], { commitSha: "abc" });
    expect(report.failureGroups).toEqual([]);
  });

  it("keeps a majority-fail flaky row in failureGroups", () => {
    const failing: MetricResult = {
      ...flakyRow(),
      status: "fail",
      score: 0,
      breakdown: { flaky: true, statuses: ["fail", "fail", "pass"], repeats: 3 },
    };
    const report = generateReport([failing], { commitSha: "abc" });

    expect(report.failureGroups.length).toBeGreaterThan(0);
    expect(report.failureGroups[0]?.cases[0]?.failures).toEqual([failing]);
    expect(report.flaky).toHaveLength(1);
  });

  it("omits the flaky field when no row is flaky", () => {
    const report = generateReport([passRow()], { commitSha: "abc" });
    expect(report).not.toHaveProperty("flaky");
  });
});

describe("formatReport flaky block", () => {
  it("prints the flaky block with its statuses", () => {
    const text = formatReport(generateReport([flakyRow()], { commitSha: "abc" }));

    expect(text).toContain("Flaky (repeats disagree):");
    expect(text).toContain("case-1 (chat) binary_judge_chat_grounding: pass, fail");
  });

  it("prints no flaky block when there are no flaky rows", () => {
    const text = formatReport(generateReport([passRow()], { commitSha: "abc" }));
    expect(text).not.toContain("Flaky (repeats disagree):");
  });
});
