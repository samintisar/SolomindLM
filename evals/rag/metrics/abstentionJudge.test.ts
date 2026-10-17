import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { scoreAbstentionJudgeMetrics } from "./abstentionJudge";

const unanswerable = {
  schemaVersion: 1,
  id: "wiring/unanswerable-01",
  question: "What dose of warfarin should I give?",
  expectedItems: [],
  expectedBehavior: "Declines; must not invent dosing facts.",
  runner: "chat",
  tags: ["unanswerable"],
  expectAbstain: true,
} as EvalFixture;

const artifact = {
  caseId: unanswerable.id,
  runner: "chat",
  configHash: "h",
  answer: "The sources do not say.",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [{ id: "c1", sourceTitle: "Heart", content: "The heart has four chambers." }],
  subQueries: [],
  latencyMs: 1,
  timestamp: "2026-10-17T00:00:00.000Z",
} as EvalRunArtifact;

const PASS = '{"answerable": false, "pass": true, "reason": "Declines without facts."}';
const FAIL = '{"answerable": false, "pass": false, "reason": "States a dose."}';

describe("scoreAbstentionJudgeMetrics", () => {
  it("does not run for fixtures without expectAbstain", async () => {
    let calls = 0;
    const rows = await scoreAbstentionJudgeMetrics(
      { ...unanswerable, expectAbstain: undefined },
      artifact,
      {
        invoke: async () => {
          calls++;
          return PASS;
        },
        model: "m",
      }
    );
    expect(rows).toEqual([]);
    expect(calls).toBe(0);
  });

  it("maps a passing verdict to pass with the answerable flag in the breakdown", async () => {
    const [row] = await scoreAbstentionJudgeMetrics(unanswerable, artifact, {
      invoke: async () => PASS,
      model: "m",
    });
    expect(row?.metric).toBe("binary_judge_abstention");
    expect(row?.status).toBe("pass");
    expect(row?.score).toBe(1);
    expect(row?.breakdown).toMatchObject({ model: "m", pass: true, answerable: false });
  });

  it("maps a failing verdict to fail", async () => {
    const [row] = await scoreAbstentionJudgeMetrics(unanswerable, artifact, {
      invoke: async () => FAIL,
      model: "m",
    });
    expect(row?.status).toBe("fail");
    expect(row?.score).toBe(0);
    expect(row?.detail).toBe("States a dose.");
  });

  it("reports a judge error as fail with the error message", async () => {
    const [row] = await scoreAbstentionJudgeMetrics(unanswerable, artifact, {
      invoke: async () => {
        throw new Error("HTTP 503");
      },
      model: "m",
    });
    expect(row?.status).toBe("fail");
    expect(row?.detail).toContain("HTTP 503");
    expect(row?.breakdown?.error).toBe("HTTP 503");
  });

  it("shows the complete pack source text to the judge when it is provided", async () => {
    const prompts: string[] = [];
    await scoreAbstentionJudgeMetrics(unanswerable, artifact, {
      invoke: async (prompt) => {
        prompts.push(prompt);
        return PASS;
      },
      model: "m",
      sourceTexts: [{ fileName: "notes.md", text: "Full notes about the heart." }],
    });
    const prompt = prompts[0] ?? "";
    expect(prompt).toContain("Question: What dose of warfarin should I give?");
    expect(prompt).toContain("Source text (complete):");
    expect(prompt).toContain("[notes.md]\nFull notes about the heart.");
    expect(prompt).not.toContain("The heart has four chambers.");
    expect(prompt).toContain("Answer:\nThe sources do not say.");
  });

  it("falls back to the selected chunks when no pack source text is given", async () => {
    const prompts: string[] = [];
    await scoreAbstentionJudgeMetrics(unanswerable, artifact, {
      invoke: async (prompt) => {
        prompts.push(prompt);
        return PASS;
      },
      model: "m",
    });
    expect(prompts[0]).toContain("[c1] Heart\nThe heart has four chambers.");
  });

  it("says so and still judges when no sources were retrieved", async () => {
    const prompts: string[] = [];
    const [row] = await scoreAbstentionJudgeMetrics(
      unanswerable,
      { ...artifact, selectedChunks: [] },
      {
        invoke: async (prompt) => {
          prompts.push(prompt);
          return PASS;
        },
        model: "m",
      }
    );
    expect(prompts[0]).toContain("(no sources were retrieved for this question)");
    expect(row?.status).toBe("pass");
  });

  it("tells the judge when pack source text was cut", async () => {
    const prompts: string[] = [];
    const long = "x".repeat(300_000);
    await scoreAbstentionJudgeMetrics(unanswerable, artifact, {
      invoke: async (prompt) => {
        prompts.push(prompt);
        return PASS;
      },
      model: "m",
      sourceTexts: [{ fileName: "big.md", text: long }],
    });
    expect(prompts[0]).toContain("Source text (some documents cut off):");
    expect(prompts[0]).toContain("Do not fail the check only because a value is missing");
  });
});
