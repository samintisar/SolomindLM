import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import {
  LlmJudgeParseError,
  llmJudgeCorrectness,
  parseJsonResponse,
  requireJudgeScore,
} from "./llmJudge";

const judgeFixture: EvalFixture = {
  schemaVersion: 1,
  id: "judge-test",
  runner: "chat",
  question: "What is X?",
  notebookId: "nb",
  expectedAnswer: "Expected answer text",
  expectedItems: [],
  expectedBehavior: "test",
  tags: ["chat"],
};

const judgeArtifact: EvalRunArtifact = {
  caseId: judgeFixture.id,
  runner: "chat",
  configHash: "hash",
  answer: "Actual answer text",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [{ id: "c1", sourceTitle: "Doc", content: "context".repeat(20) }],
  subQueries: [],
  latencyMs: 0,
  timestamp: new Date().toISOString(),
};

describe("parseJsonResponse", () => {
  it("parses bare JSON objects", () => {
    const result = parseJsonResponse(
      '{"score":0.9,"reasoning":"Good","hallucinations":[],"missing":[]}'
    );
    expect(result.score).toBe(0.9);
  });

  it("strips markdown fences", () => {
    const result = parseJsonResponse('```json\n{"score":0.7,"reasoning":"ok"}\n```');
    expect(result.score).toBe(0.7);
  });

  it("extracts JSON embedded in prose", () => {
    const result = parseJsonResponse('Here is my evaluation:\n{"score":0.6,"reasoning":"partial"}');
    expect(result.score).toBe(0.6);
  });

  it("throws instead of returning a synthetic passing score", () => {
    expect(() => parseJsonResponse("not json at all")).toThrow(LlmJudgeParseError);
  });

  it("rejects JSON arrays", () => {
    expect(() => parseJsonResponse("[1,2,3]")).toThrow(LlmJudgeParseError);
  });
});

describe("requireJudgeScore", () => {
  it("rejects scores outside 0-1", () => {
    expect(() => requireJudgeScore({ score: 1.5, reasoning: "high" })).toThrow(LlmJudgeParseError);
    expect(() => requireJudgeScore({ score: -0.1, reasoning: "low" })).toThrow(/between 0 and 1/i);
  });

  it("accepts scores in range", () => {
    expect(requireJudgeScore({ score: 0.85 })).toBe(0.85);
  });

  it("coerces string scores and alternate field names", () => {
    expect(requireJudgeScore({ score: "0.75" })).toBe(0.75);
    expect(requireJudgeScore({ completeness_score: 0.6 })).toBe(0.6);
  });
});

describe("llmJudgeCorrectness", () => {
  it("returns fail when judge response cannot be parsed", async () => {
    const result = await llmJudgeCorrectness(judgeFixture, judgeArtifact, {
      invoke: async () => "not json at all",
    });
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
  });

  it("returns fail when judge JSON omits numeric score", async () => {
    const result = await llmJudgeCorrectness(judgeFixture, judgeArtifact, {
      invoke: async () => '{"reasoning":"no score field"}',
    });
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
    expect(result.detail).toMatch(/numeric score/i);
  });
});
