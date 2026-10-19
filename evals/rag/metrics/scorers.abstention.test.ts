import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { scoreAllMetrics } from "./scorers";

const base = {
  schemaVersion: 1,
  id: "wiring/unanswerable-02",
  question: "Which vaccine schedule do the studies recommend?",
  expectedItems: [],
  expectedBehavior: "Declines; must not invent facts.",
  runner: "chat",
  tags: ["unanswerable"],
} as EvalFixture;

const artifact = {
  caseId: base.id,
  runner: "chat",
  configHash: "h",
  answer: "Based on the retrieved passages, I cannot find information about vaccine schedules.",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [],
  subQueries: ["vaccine schedule"],
  latencyMs: 1,
  timestamp: "2026-10-17T00:00:00.000Z",
} as EvalRunArtifact;

const judgeInvoke = async () => '{"answerable": false, "pass": true, "reason": "ok"}';

describe("scoreAllMetrics abstention wiring", () => {
  it("runs binary_judge_abstention for expectAbstain fixtures", async () => {
    const metrics = await scoreAllMetrics({ ...base, expectAbstain: true }, artifact, undefined, {
      judgeInvoke,
    });
    const judge = metrics.filter((m) => m.metric === "binary_judge_abstention");
    expect(judge.map((m) => m.status)).toEqual(["pass"]);
    const abstention = metrics.find((m) => m.metric === "abstention_correctness");
    expect(abstention?.breakdown?.category).toBe("correct_abstention");
  });

  it("does not run binary_judge_abstention for other fixtures", async () => {
    const metrics = await scoreAllMetrics(base, artifact, undefined, { judgeInvoke });
    expect(metrics.some((m) => m.metric === "binary_judge_abstention")).toBe(false);
  });

  it("does not run the abstention judge in a dry run", async () => {
    const metrics = await scoreAllMetrics({ ...base, expectAbstain: true }, artifact, undefined, {
      dryRun: true,
    });
    expect(metrics.some((m) => m.metric === "binary_judge_abstention")).toBe(false);
  });
});

/** Answers the abstention judge with `verdict`; every other judge passes. */
function abstentionVerdict(verdict: boolean) {
  return async (prompt: string) =>
    prompt.includes("checking an answer to a question that the sources may not cover")
      ? `{"answerable": false, "pass": ${verdict}, "reason": "judge reason"}`
      : '{"pass": true, "reason": "ok"}';
}

function withAnswer(answer: string): EvalRunArtifact {
  return { ...artifact, answer };
}

describe("abstention reconciliation", () => {
  const declines =
    "Based on the retrieved passages, I cannot find information about vaccine schedules.";
  const asserts = "The recommended schedule is three doses at 0, 1 and 6 months.";

  it("downgrades the deterministic row to warn when the judge passes an answer the rule failed", async () => {
    const metrics = await scoreAllMetrics(
      { ...base, expectAbstain: true },
      withAnswer(asserts),
      undefined,
      { judgeInvoke: abstentionVerdict(true) }
    );
    const det = metrics.find((m) => m.metric === "abstention_correctness");
    const judge = metrics.find((m) => m.metric === "binary_judge_abstention");
    expect(det?.status).toBe("warn");
    expect(det?.breakdown?.overriddenByJudge).toBe(true);
    expect(det?.detail).toContain("judge passed");
    expect(judge?.status).toBe("pass");
  });

  it("downgrades a deterministic pass to warn when the judge fails it, and keeps the judge fail", async () => {
    const metrics = await scoreAllMetrics(
      { ...base, expectAbstain: true },
      withAnswer(declines),
      undefined,
      { judgeInvoke: abstentionVerdict(false) }
    );
    const det = metrics.find((m) => m.metric === "abstention_correctness");
    const judge = metrics.find((m) => m.metric === "binary_judge_abstention");
    expect(det?.status).toBe("warn");
    expect(det?.breakdown?.overriddenByJudge).toBe(true);
    expect(det?.detail).toContain("judge failed");
    expect(judge?.status).toBe("fail");
  });

  it("leaves the deterministic row alone when the judge agrees", async () => {
    const metrics = await scoreAllMetrics(
      { ...base, expectAbstain: true },
      withAnswer(declines),
      undefined,
      { judgeInvoke: abstentionVerdict(true) }
    );
    const det = metrics.find((m) => m.metric === "abstention_correctness");
    expect(det?.status).toBe("pass");
    expect(det?.breakdown?.overriddenByJudge).toBeUndefined();
  });

  it("keeps a deterministic fail when the judge also fails", async () => {
    const metrics = await scoreAllMetrics(
      { ...base, expectAbstain: true },
      withAnswer(asserts),
      undefined,
      { judgeInvoke: abstentionVerdict(false) }
    );
    const det = metrics.find((m) => m.metric === "abstention_correctness");
    expect(det?.status).toBe("fail");
    expect(det?.breakdown?.overriddenByJudge).toBeUndefined();
  });

  it("does not override on a judge error, since the error gives no verdict", async () => {
    const metrics = await scoreAllMetrics(
      { ...base, expectAbstain: true },
      withAnswer(asserts),
      undefined,
      {
        judgeInvoke: async (prompt) => {
          if (prompt.includes("checking an answer to a question that the sources may not cover")) {
            throw new Error("HTTP 503");
          }
          return '{"pass": true, "reason": "ok"}';
        },
      }
    );
    const det = metrics.find((m) => m.metric === "abstention_correctness");
    const judge = metrics.find((m) => m.metric === "binary_judge_abstention");
    expect(judge?.breakdown?.error).toBe("HTTP 503");
    expect(det?.status).toBe("fail");
    expect(det?.breakdown?.overriddenByJudge).toBeUndefined();
  });
});
