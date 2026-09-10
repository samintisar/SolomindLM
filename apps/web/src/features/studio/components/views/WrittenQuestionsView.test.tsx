import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrittenQuestionsNote } from "@/shared/types/index";
import { WrittenQuestionsView } from "./WrittenQuestionsView";

// --- Mocks -------------------------------------------------------------------
const submitAnswer = vi.fn();
const saveDraft = vi.fn().mockResolvedValue(undefined);
const resetAnswers = vi.fn();
let latestNote: WrittenQuestionsNote | null = null;

vi.mock("../../services/writtenQuestionsApi", () => ({
  useSubmitWrittenAnswer: () => submitAnswer,
  useSaveWrittenAnswerDraft: () => saveDraft,
  useResetWrittenAnswers: () => resetAnswers,
  useUpdateWrittenQuestionsProgress: () => undefined,
  useWrittenQuestionSet: () => latestNote,
}));

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/utils")>()),
  sanitizeMarkdown: (s: string) => s,
}));

function makeNote(overrides: Partial<WrittenQuestionsNote> = {}): WrittenQuestionsNote {
  return {
    id: "wq1",
    title: "Set",
    preview: "",
    type: "writtenQuestions",
    questions: [
      { id: "q1", question: "Q1?", questionType: "short", rubric: { maxPoints: 5, criteria: [] } },
      { id: "q2", question: "Q2?", questionType: "short", rubric: { maxPoints: 5, criteria: [] } },
    ],
    userAnswers: {},
    status: "completed",
    metadata: { questionCount: 2, difficulty: "medium", questionType: "short" },
    ...overrides,
  } as WrittenQuestionsNote;
}

beforeEach(() => {
  vi.clearAllMocks();
  latestNote = null;
});

// --- Results coverage ------------------------------------------------------
describe("WrittenQuestionsView results coverage", () => {
  it("shows graded coverage and does not divide-by-zero", async () => {
    const note = makeNote({
      userAnswers: {
        q1: { answer: "a", graded: true, score: 4, maxScore: 5 },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    // Navigate q1 -> q2 -> Finish
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(screen.getByText("You scored 4 out of 10 points")).toBeInTheDocument();
    expect(screen.getByText("Graded 1 of 2 questions")).toBeInTheDocument();
    expect(screen.getByText(/Ungraded questions count as 0/)).toBeInTheDocument();
  });

  it("renders 0% (never NaN) when maxScore is 0 on the banner and the results screen", async () => {
    const note = makeNote({
      questions: [
        {
          id: "q1",
          question: "Q1?",
          questionType: "short",
          rubric: { maxPoints: 0, criteria: [] },
        },
      ],
      userAnswers: {
        q1: { answer: "a", graded: true, score: 0, maxScore: 0 },
      },
      metadata: { questionCount: 1, difficulty: "medium", questionType: "short" },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    // The answer is already graded, so the per-question banner renders immediately.
    expect(screen.getByText("Answer Graded")).toBeInTheDocument();
    expect(screen.getByText("0 / 0")).toBeInTheDocument();
    // The guard at maxScore === 0 must yield 0, not NaN. The numeric guard output and
    // the literal "%" are sibling text nodes in one element, so the text normalises to "0 %".
    expect(screen.getByText(/^0\s*%$/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(screen.getByText("You scored 0 out of 0 points")).toBeInTheDocument();
    // Results screen `{percentage}%` line — no whitespace between value and unit.
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});

// --- Draft autosave ------------------------------------------------------
describe("WrittenQuestionsView draft autosave", () => {
  it("persists typed text for an ungraded question after a debounce", () => {
    vi.useFakeTimers();
    try {
      const note = makeNote();
      latestNote = note;
      render(<WrittenQuestionsView note={note} />);

      // fireEvent (not userEvent) because userEvent's internal scheduling
      // deadlocks against fake timers + the lazy/Suspense subtree here.
      fireEvent.change(screen.getByPlaceholderText(/Type your short answer/i), {
        target: { value: "photosynthesis basics" },
      });

      expect(saveDraft).not.toHaveBeenCalled(); // still within debounce window
      vi.advanceTimersByTime(900);

      expect(saveDraft).toHaveBeenCalledWith({
        writtenQuestionsId: "wq1",
        questionId: "q1",
        answer: "photosynthesis basics",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not autosave a question that is already graded", async () => {
    vi.useFakeTimers();
    try {
      const note = makeNote({
        userAnswers: { q1: { answer: "done", graded: true, score: 5, maxScore: 5 } },
      });
      latestNote = note;
      render(<WrittenQuestionsView note={note} />);

      vi.advanceTimersByTime(2000);
      expect(saveDraft).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
