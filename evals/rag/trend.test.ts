import { describe, expect, it } from "vitest";
import type { HistoryRow, TrendEntry } from "./history";
import {
  exitCodeFor,
  formatTrend,
  historyRowKey,
  loadMergedHistory,
  mergeHistoryRows,
  type RemoteHistoryReader,
  remoteHistoryPath,
} from "./trend";

describe("exitCodeFor", () => {
  it("exits 1 under --check when there is a new fail", () => {
    expect(exitCodeFor({ newFailCount: 1 }, { check: true })).toBe(1);
    expect(exitCodeFor({ newFailCount: 3 }, { check: true })).toBe(1);
  });

  it("exits 0 under --check when there is no new fail", () => {
    expect(exitCodeFor({ newFailCount: 0 }, { check: true })).toBe(0);
  });

  it("exits 0 without --check even when there are new fails", () => {
    expect(exitCodeFor({ newFailCount: 2 }, { check: false })).toBe(0);
  });
});

function histRow(runId: string, partial: Partial<HistoryRow> = {}): HistoryRow {
  return {
    runId,
    timestamp: "2026-10-17T03:17:00.000Z",
    commitSha: "abc",
    split: "smoke",
    caseId: "case-1",
    runner: "chat",
    metric: "expected_item_recall",
    status: "pass",
    score: 1,
    configHash: "cfg",
    ...partial,
  };
}

/** Injected reader: no git. Records the calls it receives. */
function fakeReader(opts: {
  fetchError?: string;
  files?: Record<string, string>;
}): RemoteHistoryReader & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    fetchBranch: () => opts.fetchError,
    readFile: (branch, path) => {
      reads.push(`${branch}:${path}`);
      return opts.files?.[path];
    },
  };
}

describe("mergeHistoryRows", () => {
  it("dedupes by runId, caseId, runner and metric, keeping the first occurrence", () => {
    const remote = [histRow("r1", { status: "pass" }), histRow("r2")];
    const local = [histRow("r1", { status: "fail" }), histRow("r3")];

    const merged = mergeHistoryRows(remote, local);

    expect(merged.map((r) => r.runId)).toEqual(["r1", "r2", "r3"]);
    expect(merged[0]?.status).toBe("pass");
  });

  it("treats rows that differ in caseId, runner or metric as distinct", () => {
    const rows = [
      histRow("r1"),
      histRow("r1", { caseId: "case-2" }),
      histRow("r1", { runner: "research" }),
      histRow("r1", { metric: "citation_validity" }),
    ];

    expect(mergeHistoryRows(rows)).toHaveLength(4);
    expect(historyRowKey(rows[0] as HistoryRow)).not.toBe(historyRowKey(rows[1] as HistoryRow));
  });
});

describe("loadMergedHistory", () => {
  it("returns the local rows and never touches the reader without --branch", () => {
    const reader = fakeReader({});
    const local = [histRow("r1")];

    const out = loadMergedHistory({ local, split: "smoke" }, reader);

    expect(out).toEqual({ rows: local, notes: [] });
    expect(reader.reads).toEqual([]);
  });

  it("unions remote and local rows and reads the split file from the branch", () => {
    const remoteText = `${JSON.stringify(histRow("r1"))}\n${JSON.stringify(histRow("r2"))}\n`;
    const reader = fakeReader({
      files: { [remoteHistoryPath("smoke")]: remoteText },
    });

    const out = loadMergedHistory(
      { local: [histRow("r2"), histRow("r3")], split: "smoke", branch: "eval-history" },
      reader
    );

    expect(reader.reads).toEqual(["eval-history:evals/rag/history/smoke.jsonl"]);
    expect(out.rows.map((r) => r.runId)).toEqual(["r1", "r2", "r3"]);
    expect(out.notes).toEqual([]);
  });

  it("falls back to local rows with a note when the branch is missing", () => {
    const local = [histRow("r3")];

    const out = loadMergedHistory(
      { local, split: "smoke", branch: "eval-history" },
      fakeReader({ fetchError: "fetch failed or no such branch" })
    );

    expect(out.rows).toEqual(local);
    expect(out.notes[0]).toContain("origin/eval-history not available");
  });

  it("treats a missing split file as empty, with a note", () => {
    const local = [histRow("r3")];

    const out = loadMergedHistory(
      { local, split: "holdout", branch: "eval-history" },
      fakeReader({ files: {} })
    );

    expect(out.rows).toEqual(local);
    expect(out.notes[0]).toContain("evals/rag/history/holdout.jsonl not found");
  });

  it("notes malformed remote lines and keeps the valid ones", () => {
    const text = `${JSON.stringify(histRow("r1"))}\n{broken\n`;

    const out = loadMergedHistory(
      { local: [], split: "smoke", branch: "eval-history" },
      fakeReader({ files: { [remoteHistoryPath("smoke")]: text } })
    );

    expect(out.rows.map((r) => r.runId)).toEqual(["r1"]);
    expect(out.notes.join("\n")).toContain("skipped 1 malformed line");
  });
});

describe("remoteHistoryPath", () => {
  it("uses 'all' when there is no split", () => {
    expect(remoteHistoryPath()).toBe("evals/rag/history/all.jsonl");
    expect(remoteHistoryPath("smoke")).toBe("evals/rag/history/smoke.jsonl");
  });
});

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
