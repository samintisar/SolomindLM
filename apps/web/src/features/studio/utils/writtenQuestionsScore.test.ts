import { describe, expect, it } from "vitest";
import type { WrittenQuestion, WrittenQuestionAnswer } from "@/shared/types/index";
import { selectPendingGradeIds, summarizeWrittenQuestions } from "./writtenQuestionsScore";

function q(id: string, maxPoints = 5): WrittenQuestion {
  return {
    id,
    question: `Question ${id}`,
    questionType: "short",
    rubric: { maxPoints, criteria: [] },
  };
}

function graded(score: number): WrittenQuestionAnswer {
  return { answer: "an answer", graded: true, score, maxScore: 5 };
}

describe("summarizeWrittenQuestions", () => {
  it("returns zero score but full maxScore when nothing is graded", () => {
    const questions = [q("q1"), q("q2"), q("q3")];
    const result = summarizeWrittenQuestions(questions, {});
    expect(result).toEqual({
      score: 0,
      maxScore: 15,
      gradedCount: 0,
      totalCount: 3,
      percentage: 0,
    });
  });

  it("sums only graded answers while maxScore covers every question", () => {
    const questions = [q("q1"), q("q2"), q("q3")];
    const userAnswers: Record<string, WrittenQuestionAnswer> = {
      q1: graded(4),
      q2: { answer: "typed but not submitted", graded: false },
    };
    const result = summarizeWrittenQuestions(questions, userAnswers);
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(15);
    expect(result.gradedCount).toBe(1);
    expect(result.totalCount).toBe(3);
    expect(result.percentage).toBe(27); // round(4 / 15 * 100)
  });

  it("treats a missing score on a graded answer as 0", () => {
    const questions = [q("q1")];
    const result = summarizeWrittenQuestions(questions, {
      q1: { answer: "x", graded: true },
    });
    expect(result.score).toBe(0);
    expect(result.gradedCount).toBe(1);
  });

  it("returns percentage 0 (not NaN) when maxScore is 0", () => {
    const questions: WrittenQuestion[] = [
      { id: "q1", question: "Q1", questionType: "short", rubric: { maxPoints: 0, criteria: [] } },
    ];
    const result = summarizeWrittenQuestions(questions, { q1: graded(0) });
    expect(result.maxScore).toBe(0);
    expect(result.percentage).toBe(0);
    expect(Number.isNaN(result.percentage)).toBe(false);
  });

  it("tolerates a question with no rubric", () => {
    const questions = [
      { id: "q1", question: "Q1", questionType: "short" } as unknown as WrittenQuestion,
    ];
    const result = summarizeWrittenQuestions(questions, {});
    expect(result.maxScore).toBe(0);
    expect(result.percentage).toBe(0);
  });
});

describe("selectPendingGradeIds", () => {
  it("returns ids with a non-empty answer that are not graded", () => {
    const questions = [q("q1"), q("q2"), q("q3"), q("q4")];
    const answers = {
      q1: { answer: "real answer", graded: false },
      q2: { answer: "   ", graded: false },
      q3: { answer: "graded already", graded: true },
      q4: { answer: "another", graded: false },
    };
    expect(selectPendingGradeIds(questions, answers)).toEqual(["q1", "q4"]);
  });

  it("returns an empty array when every answered question is graded", () => {
    const questions = [q("q1"), q("q2")];
    const answers = {
      q1: { answer: "a", graded: true },
      q2: { answer: "b", graded: true },
    };
    expect(selectPendingGradeIds(questions, answers)).toEqual([]);
  });

  it("ignores questions with no answer entry", () => {
    const questions = [q("q1"), q("q2")];
    expect(selectPendingGradeIds(questions, { q1: { answer: "", graded: false } })).toEqual([]);
  });

  it("ignores an entry with no answer key at all", () => {
    const questions = [q("q1")];
    expect(selectPendingGradeIds(questions, { q1: { graded: false } })).toEqual([]);
  });
});
