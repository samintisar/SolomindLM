import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import {
  isConsistencySampled,
  judgeConsistencyTally,
  resetJudgeConsistencyTally,
  scoreBinaryJudgeMetrics,
} from "./binaryJudges";

const fixture = {
  schemaVersion: 1,
  id: "chat-case",
  question: "What is routing?",
  runner: "chat",
  expectedItems: [],
  expectedBehavior: "Grounded answer.",
  tags: [],
} as unknown as EvalFixture;

const artifact: EvalRunArtifact = {
  caseId: "chat-case",
  runner: "chat",
  configHash: "abc",
  answer: "Routing sends each request to a specialist [1].",
  citations: ["1"],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [{ id: "1", sourceTitle: "Notes", content: "Routing sends requests." }],
  subQueries: [],
  latencyMs: 1,
  timestamp: "2026-10-17T00:00:00.000Z",
};

/**
 * Stub judge: the first call for a prompt gets `first`, every later call for that same prompt gets
 * `second`. Judges run concurrently, so the stub keys on the prompt rather than the call order.
 */
function verdictsPerPrompt(first: string, second: string | Error) {
  const seen = new Map<string, number>();
  return vi.fn(async (prompt: string) => {
    const n = seen.get(prompt) ?? 0;
    seen.set(prompt, n + 1);
    const reply = n === 0 ? first : second;
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

const PASS = '{"pass": true, "reason": "supported"}';
const FAIL = '{"pass": false, "reason": "not supported"}';

beforeEach(() => {
  resetJudgeConsistencyTally();
});

describe("judge self-consistency", () => {
  it("re-runs a sampled judge once, flags a flip, and keeps the first verdict", async () => {
    const invoke = verdictsPerPrompt(PASS, FAIL);
    const results = await scoreBinaryJudgeMetrics(fixture, artifact, undefined, {
      invoke,
      judgeConsistencySample: 1,
    });
    // Chat with citations runs the grounding and citation judges; each is called twice.
    expect(invoke).toHaveBeenCalledTimes(4);
    const grounding = results.find((r) => r.metric === "binary_judge_chat_grounding");
    expect(grounding?.status).toBe("pass");
    expect(grounding?.breakdown).toMatchObject({ judgeUnstable: true, secondVerdict: "fail" });
    expect(judgeConsistencyTally()).toEqual({ sampled: 2, agreed: 0 });
  });

  it("counts a repeat verdict that agrees without flagging the judge", async () => {
    const invoke = verdictsPerPrompt(PASS, PASS);
    const results = await scoreBinaryJudgeMetrics(fixture, artifact, undefined, {
      invoke,
      judgeConsistencySample: 1,
    });
    for (const row of results) {
      expect(row.breakdown?.judgeUnstable).toBeUndefined();
    }
    expect(judgeConsistencyTally()).toEqual({ sampled: 2, agreed: 2 });
  });

  it("makes no second call when the sample is 0", async () => {
    const invoke = verdictsPerPrompt(PASS, FAIL);
    await scoreBinaryJudgeMetrics(fixture, artifact, undefined, {
      invoke,
      judgeConsistencySample: 0,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(judgeConsistencyTally()).toEqual({ sampled: 0, agreed: 0 });
  });

  it("does not count a second call that fails, and keeps the first verdict", async () => {
    const invoke = verdictsPerPrompt(PASS, new Error("HTTP 503"));
    const results = await scoreBinaryJudgeMetrics(fixture, artifact, undefined, {
      invoke,
      judgeConsistencySample: 1,
    });
    const grounding = results.find((r) => r.metric === "binary_judge_chat_grounding");
    expect(grounding?.status).toBe("pass");
    expect(grounding?.breakdown?.judgeUnstable).toBeUndefined();
    expect(judgeConsistencyTally().sampled).toBe(0);
  });

  it("resets the tally", async () => {
    await scoreBinaryJudgeMetrics(fixture, artifact, undefined, {
      invoke: verdictsPerPrompt(PASS, PASS),
      judgeConsistencySample: 1,
    });
    resetJudgeConsistencyTally();
    expect(judgeConsistencyTally()).toEqual({ sampled: 0, agreed: 0 });
  });
});

describe("isConsistencySampled", () => {
  it("is deterministic for a case and metric", () => {
    const first = isConsistencySampled("chat-case", "chat", "binary_judge_chat_grounding", 0.5);
    for (let i = 0; i < 5; i++) {
      expect(isConsistencySampled("chat-case", "chat", "binary_judge_chat_grounding", 0.5)).toBe(
        first
      );
    }
  });

  it("keys the sample on the runner, so one case under two runners is sampled independently", () => {
    const cases = Array.from({ length: 300 }, (_, i) => `case-${i}`);
    const differs = cases.filter(
      (id) =>
        isConsistencySampled(id, "chat", "binary_judge_chat_grounding", 0.5) !==
        isConsistencySampled(id, "quiz", "binary_judge_chat_grounding", 0.5)
    );
    expect(differs.length).toBeGreaterThan(0);
  });

  it("samples about the requested fraction across many cases", () => {
    const hits = Array.from({ length: 1000 }, (_, i) =>
      isConsistencySampled(`case-${i}`, "chat", "binary_judge_chat_grounding", 0.1)
    ).filter(Boolean).length;
    expect(hits).toBeGreaterThan(50);
    expect(hits).toBeLessThan(150);
  });

  it("samples nothing at 0 and everything at 1", () => {
    expect(isConsistencySampled("case-1", "chat", "m", 0)).toBe(false);
    expect(isConsistencySampled("case-1", "chat", "m", 1)).toBe(true);
  });
});
