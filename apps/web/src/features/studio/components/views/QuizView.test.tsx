import { render, screen, waitFor } from "@testing-library/react";
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

async function finishQuiz(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Right one/ }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(await screen.findByRole("button", { name: /Nope/ }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click((await screen.findAllByRole("button", { name: /Yes/ }))[0]);
  await user.click(screen.getByRole("button", { name: "Finish" }));
  await screen.findByRole("heading", { name: "Quiz Complete!" });
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
    expect(screen.getByText("Incorrect. The correct answer is marked.")).toBeInTheDocument();
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

  it("keeps focus on Next while moving through questions with the keyboard", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Q2?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  });

  it("undoes the answer, streak and announcement when saving fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    submitAnswer.mockRejectedValueOnce(new Error("x"));
    const user = userEvent.setup();
    const { container } = render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Right one/ })).toHaveAttribute(
        "data-state",
        "idle"
      )
    );
    expect(container.querySelector("[aria-live='polite']")).toHaveTextContent("");
    expect(screen.getByText("Score 0")).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("keeps the earlier streak when a later answer fails to save", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: /Yes/ }));
    expect(screen.getByRole("status")).toHaveTextContent("2 in a row");
    await user.click(screen.getByRole("button", { name: "Next" }));
    submitAnswer.mockRejectedValueOnce(new Error("x"));
    await user.click((await screen.findAllByRole("button", { name: /Yes/ }))[0]);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Yes/ })[0]).toHaveAttribute(
        "data-state",
        "idle"
      )
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 in a row");
    consoleError.mockRestore();
  });

  it("scores a legacy five-option question in the options the learner sees", async () => {
    const quiz = makeQuiz();
    quiz.questions[0] = {
      question: "Q1?",
      options: ["o1", "o2", "o3", "o4", "o5"],
      answer: 4,
      hint: "h",
      explanation: "E1",
    } as unknown as QuizNote["questions"][number];
    const user = userEvent.setup();
    render(<QuizView note={quiz} />);
    await user.click(await screen.findByRole("button", { name: /o5/ }));
    expect(screen.getByRole("button", { name: /o5/ })).toHaveAttribute("data-state", "correct");
    expect(screen.getByText("Score 1")).toBeInTheDocument();
  });

  it("disables the options when reviewing a question from the results", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await finishQuiz(user);
    await user.click(screen.getByRole("button", { name: /Question 1, correct/ }));
    expect(await screen.findByText("Review Mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Right one/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Wrong one/ })).toBeDisabled();
  });

  it("clears the score and answers on Try Again", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await finishQuiz(user);
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(resetAnswers).toHaveBeenCalledWith("quiz1");
    expect(await screen.findByText("Score 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Right one/ })).toHaveAttribute("data-state", "idle");
  });

  it("neither announces nor takes focus when an answered question is restored", async () => {
    const quiz = makeQuiz();
    quiz.userAnswers = { 0: 0 };
    const { container } = render(<QuizView note={quiz} />);
    expect(await screen.findByRole("button", { name: /Right one/ })).toHaveAttribute(
      "data-state",
      "correct"
    );
    expect(container.querySelector("[aria-live='polite']")).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "Next" })).not.toHaveFocus();
  });
});
