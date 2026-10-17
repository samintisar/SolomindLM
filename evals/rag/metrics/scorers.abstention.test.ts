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
