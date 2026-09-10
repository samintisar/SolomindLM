import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("does not autosave a question that is already graded", () => {
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

  it("does not flush a retracted edit", () => {
    vi.useFakeTimers();
    try {
      const note = makeNote({
        userAnswers: { q1: { answer: "cats", graded: false } },
      });
      latestNote = note;
      render(<WrittenQuestionsView note={note} />);

      const textarea = screen.getByPlaceholderText(/Type your short answer/i);
      // Type an addition, then delete it back to exactly the saved server value,
      // all inside the debounce window.
      fireEvent.change(textarea, { target: { value: "cats and dogs" } });
      vi.advanceTimersByTime(100);
      fireEvent.change(textarea, { target: { value: "cats" } });
      vi.advanceTimersByTime(100);

      // Navigate away before the debounce timer could fire.
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      // The reconcile step cleared the stale pending snapshot, so the flush on
      // navigation has nothing to persist: the only edit was retracted.
      expect(saveDraft).not.toHaveBeenCalled();

      vi.advanceTimersByTime(900);
      expect(saveDraft).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // Verifies debounce coalescing only. The mock keeps `saveDraft` identity
  // stable across renders, so this is not a regression guard for the
  // hook-identity fix — that fix is verified separately.
  it("coalesces rapid successive edits into exactly one save carrying the final text", () => {
    vi.useFakeTimers();
    try {
      const note = makeNote();
      latestNote = note;
      render(<WrittenQuestionsView note={note} />);

      const textarea = screen.getByPlaceholderText(/Type your short answer/i);
      fireEvent.change(textarea, { target: { value: "photo" } });
      vi.advanceTimersByTime(200);
      fireEvent.change(textarea, { target: { value: "photosyn" } });
      vi.advanceTimersByTime(200);
      fireEvent.change(textarea, { target: { value: "photosynthesis, in full" } });

      expect(saveDraft).not.toHaveBeenCalled(); // every edit stayed within the window
      vi.advanceTimersByTime(900);

      expect(saveDraft).toHaveBeenCalledTimes(1);
      expect(saveDraft).toHaveBeenCalledWith({
        writtenQuestionsId: "wq1",
        questionId: "q1",
        answer: "photosynthesis, in full",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes the pending draft for q1 when navigating Next within the debounce window", () => {
    vi.useFakeTimers();
    try {
      const note = makeNote();
      latestNote = note;
      render(<WrittenQuestionsView note={note} />);

      fireEvent.change(screen.getByPlaceholderText(/Type your short answer/i), {
        target: { value: "answer typed just before navigating" },
      });
      expect(saveDraft).not.toHaveBeenCalled(); // still mid-debounce

      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      // The debounce timer never elapsed; the flush-on-change effect persisted it.
      expect(saveDraft).toHaveBeenCalledTimes(1);
      expect(saveDraft).toHaveBeenCalledWith({
        writtenQuestionsId: "wq1",
        questionId: "q1",
        answer: "answer typed just before navigating",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("WrittenQuestionsView grade-on-Finish", () => {
  it("grades answered-but-ungraded questions on Finish then shows a real score", async () => {
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) => ({
      success: true,
      score: questionId === "q1" ? 4 : 3,
      maxScore: 5,
    }));
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    // Loop ran once per pending question
    expect(submitAnswer).toHaveBeenCalledTimes(2);
    expect(submitAnswer).toHaveBeenCalledWith({
      writtenQuestionsId: "wq1",
      questionId: "q1",
      answer: "answer one",
    });

    expect(await screen.findByText("You scored 7 out of 10 points")).toBeInTheDocument();
    expect(screen.getByText("Graded 2 of 2 questions")).toBeInTheDocument();
  });

  it("counts a grading failure as ungraded and surfaces it", async () => {
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) => {
      if (questionId === "q2") throw new Error("grader down");
      return { success: true, score: 5, maxScore: 5 };
    });
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText("You scored 5 out of 10 points")).toBeInTheDocument();
    expect(screen.getByText("Graded 1 of 2 questions")).toBeInTheDocument();
    expect(screen.getByText(/1 answer\(s\) couldn't be graded/)).toBeInTheDocument();
  });

  it("skips grading and goes straight to results when nothing is pending", async () => {
    const note = makeNote({
      userAnswers: { q1: { answer: "a", graded: true, score: 5, maxScore: 5 } },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(submitAnswer).not.toHaveBeenCalled();
    expect(screen.getByText("You scored 5 out of 10 points")).toBeInTheDocument();
  });

  it("clears a prior failure banner after a subsequent clean finish", async () => {
    // First run: q2 grading fails -> gradingAll.failed = 1
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) => {
      if (questionId === "q2") throw new Error("grader down");
      return { success: true, score: 5, maxScore: 5 };
    });
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    const { rerender } = render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/1 answer\(s\) couldn't be graded/)).toBeInTheDocument();

    // Try Again -> local state (incl. gradingAll) resets, then the server sync
    // effect injects a fully-graded set, so the next Finish has nothing pending.
    await user.click(screen.getByRole("button", { name: "Try Again" }));

    const gradedNote = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: true, score: 5, maxScore: 5 },
        q2: { answer: "answer two", graded: true, score: 4, maxScore: 5 },
      },
    });
    latestNote = gradedNote;
    rerender(<WrittenQuestionsView note={gradedNote} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText("You scored 9 out of 10 points")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't be graded/)).not.toBeInTheDocument();
  });

  it("shows progress and disables navigation while grading", async () => {
    let resolveFirst: (v: { success: boolean; score: number; maxScore: number }) => void;
    const firstCall = new Promise<{ success: boolean; score: number; maxScore: number }>((r) => {
      resolveFirst = r;
    });
    // Set up inside the test (not a shared mockImplementationOnce) so leftover
    // implementations from earlier tests in this block can't reach q2. The q1
    // call parks on the deferred promise so the in-progress screen is observable.
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) =>
      questionId === "q1" ? firstCall : { success: true, score: 3, maxScore: 5 }
    );
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    // Progress screen is up, loop parked on the first (unresolved) grade call
    expect(await screen.findByText(/Grading your answers/)).toBeInTheDocument();
    expect(screen.getByText(/0 of 2/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish" })).not.toBeInTheDocument();

    // Let the loop finish
    resolveFirst!({ success: true, score: 4, maxScore: 5 });
    expect(await screen.findByText("You scored 7 out of 10 points")).toBeInTheDocument();
  });

  // --- Hardening: re-entrancy, stop feedback, error recovery, no stale snapshot ---

  type GradeResult = { success: boolean; score: number; maxScore: number };

  // Reach into the React fiber to call the button's onClick directly, so two
  // invocations land in the same tick with no re-render (and no fresh closure)
  // between them — the double-click / double-tap / Enter+click race.
  function reactOnClick(el: Element): () => void {
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    if (!key) throw new Error("no React props on element");
    return (el as unknown as Record<string, { onClick: () => void }>)[key].onClick;
  }

  it("does not launch two grade loops when Finish fires twice before a re-render", async () => {
    let resolve1!: (v: GradeResult) => void;
    let resolve2!: (v: GradeResult) => void;
    const queue: Promise<GradeResult>[] = [
      new Promise<GradeResult>((r) => {
        resolve1 = r;
      }),
      new Promise<GradeResult>((r) => {
        resolve2 = r;
      }),
    ];
    submitAnswer.mockImplementation(
      () => queue.shift() ?? Promise.resolve({ success: true, score: 3, maxScore: 5 })
    );
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    render(<WrittenQuestionsView note={note} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const onFinish = reactOnClick(screen.getByRole("button", { name: "Finish" }));

    act(() => {
      onFinish();
      onFinish();
    });

    resolve1({ success: true, score: 4, maxScore: 5 });
    resolve2({ success: true, score: 3, maxScore: 5 });

    expect(await screen.findByText(/You scored/)).toBeInTheDocument();
    // One grade call per pending question — a second Finish must not double it.
    expect(submitAnswer).toHaveBeenCalledTimes(2);
  });

  it("reflects a pressed Stop in render state before the in-flight grade call resolves", async () => {
    let resolveFirst!: (v: GradeResult) => void;
    const firstCall = new Promise<GradeResult>((r) => {
      resolveFirst = r;
    });
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) =>
      questionId === "q1" ? firstCall : { success: true, score: 3, maxScore: 5 }
    );
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText(/Grading your answers/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop grading" }));

    // Render state shows the stop immediately — the parked grade call is still
    // unresolved, so this can only be driven by state, not the loop.
    const stoppingBtn = screen.getByRole("button", { name: /Stopping/ });
    expect(stoppingBtn).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Stop grading" })).not.toBeInTheDocument();

    // Let the parked call resolve so the loop can exit cleanly.
    resolveFirst({ success: true, score: 4, maxScore: 5 });
    expect(await screen.findByText(/You scored/)).toBeInTheDocument();
  });

  it("does not strand the view when notifying the parent after grading throws", async () => {
    submitAnswer.mockImplementation(async () => ({ success: true, score: 4, maxScore: 5 }));
    const onNoteUpdate = vi.fn(() => {
      throw new Error("parent boom");
    });
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} onNoteUpdate={onNoteUpdate} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    // The grade-on-Finish flow must reach the results screen regardless of what
    // the parent callback does, and must not get stuck on the grading spinner.
    expect(await screen.findByText("Assessment Complete!")).toBeInTheDocument();
    expect(screen.getByText(/You scored/)).toBeInTheDocument();
    expect(screen.queryByText(/Grading your answers/)).not.toBeInTheDocument();
  });

  it("does not push a stale pre-grading note snapshot to the parent on Finish", async () => {
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) => ({
      success: true,
      score: questionId === "q1" ? 4 : 3,
      maxScore: 5,
    }));
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const onNoteUpdate = vi.fn();
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} onNoteUpdate={onNoteUpdate} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText("You scored 7 out of 10 points")).toBeInTheDocument();

    // The reactive useWrittenQuestionSet query already propagates freshly-persisted
    // grades; Finish must not hand the parent a note captured before grading (its
    // userAnswers still show graded !== true).
    const staleCalls = onNoteUpdate.mock.calls.filter(
      ([n]) => n && (n as WrittenQuestionsNote).userAnswers?.q1?.graded !== true
    );
    expect(staleCalls).toEqual([]);
  });
});
