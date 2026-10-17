import { describe, expect, it } from "vitest";
import type { TrendEntry } from "./history";
import { formatTrend } from "./trend";

function entry(partial: Partial<TrendEntry>): TrendEntry {
  return {
    key: "chat::-::expected_item_recall",
    runner: "chat",
    metric: "expected_item_recall",
    runs: [
      { runId: "r1", timestamp: "2026-10-16T03:17:00.000Z", status: "pass", passRate: 1 },
      { runId: "r2", timestamp: "2026-10-17T03:17:00.000Z", status: "pass", passRate: 1 },
    ],
    passRate: 1,
    latestStatus: "pass",
    newFails: false,
    declining: false,
    ...partial,
  };
}

describe("formatTrend", () => {
  it("says there is no history when nothing is in the window", () => {
    const out = formatTrend([], { days: 30, split: "smoke" });

    expect(out.text).toContain("no history");
    expect(out.newFailCount).toBe(0);
  });

  it("prints one table row per metric with pass rate and latest status", () => {
    const out = formatTrend(
      [
        entry({
          passRate: 0.5,
          latestStatus: "warn",
        }),
      ],
      { days: 14, split: "smoke" }
    );

    const row = out.text.split("\n").find((line) => line.includes("expected_item_recall"));
    expect(row).toBeDefined();
    expect(row).toMatch(/50%/);
    expect(row).toMatch(/\bwarn\b/);
    expect(row).toMatch(/\b2\b/);
  });

  it("lists new fails and declining metrics and counts the new fails", () => {
    const out = formatTrend(
      [
        entry({ metric: "citation_validity", latestStatus: "fail", newFails: true }),
        entry({ metric: "retrieval_ndcg_at_k", declining: true, useCase: "medical-students" }),
        entry({ metric: "expected_item_recall" }),
      ],
      { days: 14 }
    );

    const newFailsSection = out.text
      .split("New fails since previous run:")[1]
      ?.split("Declining")[0];
    const decliningSection = out.text.split("Declining")[1];
    expect(newFailsSection).toContain("citation_validity");
    expect(newFailsSection).not.toContain("expected_item_recall");
    expect(decliningSection).toContain("retrieval_ndcg_at_k");
    expect(decliningSection).toContain("medical-students");
    expect(out.newFailCount).toBe(1);
  });

  it("prints 'none' under both lists when nothing is flagged", () => {
    const out = formatTrend([entry({})], { days: 14 });

    expect(out.text.match(/^ {2}none$/gm)).toHaveLength(2);
    expect(out.newFailCount).toBe(0);
  });
});
