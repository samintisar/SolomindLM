import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrittenQuestion } from "../../_agents/written_questions/prompts";
import { createJobDeadline } from "../_job/jobDeadline";
import { checkWrittenQuestions } from "./writtenQuestionsJobPhases";

const { invokeStructuredOutput } = vi.hoisted(() => ({ invokeStructuredOutput: vi.fn() }));

vi.mock("../../_agents/_shared/structuredLlm", () => ({ invokeStructuredOutput }));

function question(id: string, modelAnswer = `Answer ${id}.`): WrittenQuestion {
  return {
    id,
    question: `Question ${id}`,
    questionType: "short",
    rubric: { maxPoints: 5, criteria: ["accuracy"] },
    modelAnswer,
  };
}

const verdict = (id: string, v: "ok" | "fix" | "drop") => ({
  id,
  verdict: v,
  reason: v === "drop" ? "rubric contradicts the answer" : "",
  question: "",
  modelAnswer: v === "fix" ? `Fixed ${id}.` : "",
  criteria: [],
});

const noUsage = () => {};

beforeEach(() => {
  invokeStructuredOutput.mockReset();
});

describe("checkWrittenQuestions", () => {
  it("replaces dropped questions from the pool and checks the replacements", async () => {
    invokeStructuredOutput
      .mockResolvedValueOnce({
        checks: [verdict("a", "ok"), verdict("b", "drop"), verdict("c", "fix")],
      })
      .mockResolvedValueOnce({ checks: [verdict("d", "ok")] });
    const pool = ["a", "b", "c", "d", "e"].map((id) => question(id));

    const result = await checkWrittenQuestions({
      questions: pool.slice(0, 3),
      pool,
      request: "Grade on citing the right section of the filing",
      deadline: createJobDeadline(540_000),
      onUsage: noUsage,
    });

    expect(result.questions.map((q) => q.id)).toEqual(["a", "c", "d"]);
    expect(result.questions[1].modelAnswer).toBe("Fixed c.");
    expect(result).toMatchObject({ dropped: 1, fixed: 1 });
    expect(invokeStructuredOutput.mock.calls[0][0].userPrompt).toContain(
      "right section of the filing"
    );
    expect(invokeStructuredOutput.mock.calls[1][0].userPrompt).toContain('"id": "d"');
    expect(invokeStructuredOutput.mock.calls[0][0].reasoningEnabled).toBe(true);
  });

  it("keeps the selected questions without working when the check fails", async () => {
    invokeStructuredOutput.mockRejectedValue(new Error("bad gateway"));
    const questions = [question("a"), question("b", "Wait, let me re-calculate.")];

    const result = await checkWrittenQuestions({
      questions,
      pool: questions,
      deadline: createJobDeadline(540_000),
      onUsage: noUsage,
    });

    expect(result.questions.map((q) => q.id)).toEqual(["a"]);
    expect(result.dropped).toBe(1);
  });

  it("skips the check when the budget is nearly spent", async () => {
    const result = await checkWrittenQuestions({
      questions: [question("a")],
      pool: [question("a")],
      deadline: createJobDeadline(40_000),
      onUsage: noUsage,
    });

    expect(result.questions.map((q) => q.id)).toEqual(["a"]);
    expect(invokeStructuredOutput).not.toHaveBeenCalled();
  });
});
