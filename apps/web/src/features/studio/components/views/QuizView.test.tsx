import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizNote } from "@/shared/types/index";
import { QuizView } from "./QuizView";

const submitAnswer = vi.fn().mockResolvedValue(undefined);
const resetAnswers = vi.fn().mockResolvedValue(undefined);
let latestNote: QuizNote | null = null;

vi.mock("@/features/studio/services/quizzesApi", () => ({
  useSubmitQuizAnswer: () => submitAnswer,
  useResetQuizAnswers: () => resetAnswers,
  useUpdateQuizProgress: () => undefined,
  useQuiz: () => latestNote,
}));

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/utils")>()),
  sanitizeMarkdown: (s: string) => s,
}));

function makeQuiz(): QuizNote {
  return {
    id: "quiz1",
    title: "SQL",
    preview: "",
    type: "quiz",
    status: "completed",
    questions: [
      {
        question: "Q1?",
        options: ["Right one", "Wrong one"],
        answer: 0,
        hint: "h1",
        explanation: "E1",
      },
      { question: "Q2?", options: ["Nope", "Yes"], answer: 1, hint: "h2", explanation: "E2" },
      { question: "Q3?", options: ["Yes", "No"], answer: 0, hint: "h3", explanation: "E3" },
    ],
    userAnswers: {},
    metadata: {},
  } as unknown as QuizNote;
}

beforeEach(() => {
  vi.clearAllMocks();
  latestNote = null;
});

describe("QuizView", () => {
  it("marks the right answer, counts the score and explains", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    expect(screen.getByRole("button", { name: /Right one/ })).toHaveAttribute(
      "data-state",
      "correct"
    );
    expect(screen.getByRole("button", { name: /Wrong one/ })).toHaveAttribute(
      "data-state",
      "dimmed"
    );
    expect(screen.getByText("Score 1")).toBeInTheDocument();
    expect(await screen.findByText("E1")).toBeInTheDocument();
    expect(submitAnswer).toHaveBeenCalledWith("quiz1", 0, 0);
  });

  it("shakes a wrong pick and still shows the right answer", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Wrong one/ }));
    expect(screen.getByRole("button", { name: /Wrong one/ })).toHaveAttribute(
      "data-state",
      "incorrect"
    );
    expect(screen.getByRole("button", { name: /Right one/ })).toHaveAttribute(
      "data-state",
      "correct"
    );
    expect(screen.getByText("Score 0")).toBeInTheDocument();
  });

  it("announces the result to screen readers", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Wrong one/ }));
    expect(screen.getByText("Incorrect. The answer is A.")).toBeInTheDocument();
  });

  it("moves focus to Next once an answer is picked", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  });

  it("shows a streak after two right answers in a row", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: /Yes/ }));
    expect(screen.getByRole("status")).toHaveTextContent("2 in a row");
  });

  it("finishes on a results screen whose chips open a question for review", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: /Nope/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click((await screen.findAllByRole("button", { name: /Yes/ }))[0]);
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("heading", { name: "Quiz Complete!" })).toBeInTheDocument();
    expect(screen.getByText("You scored 2 out of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Question 2, incorrect/ }));
    expect(await screen.findByText("Review Mode")).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
  });
});
