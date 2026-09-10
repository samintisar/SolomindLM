import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrittenQuestionsNote } from "@/shared/types/index";
import { WrittenQuestionsView } from "./WrittenQuestionsView";

// --- Mocks -------------------------------------------------------------------
const submitAnswer = vi.fn();
const saveDraft = vi.fn();
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

vi.mock("@/shared/utils", () => ({
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
});
