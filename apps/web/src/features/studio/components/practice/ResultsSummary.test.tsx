import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResultsSummary } from "./ResultsSummary";

describe("ResultsSummary", () => {
  it("shows the title, headline, score text and actions", () => {
    render(
      <ResultsSummary
        title="Quiz Complete!"
        fraction={2 / 3}
        value={2}
        caption="of 3"
        questions={[]}
        actions={<button type="button">Try Again</button>}
      >
        <p>You scored 2 out of 3</p>
      </ResultsSummary>
    );
    expect(screen.getByRole("heading", { name: "Quiz Complete!" })).toBeInTheDocument();
    expect(screen.getByText("Good effort")).toBeInTheDocument();
    expect(screen.getByText("You scored 2 out of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  });

  it("puts a value suffix in the same text as the number", () => {
    render(
      <ResultsSummary
        title="Done"
        fraction={0}
        value={0}
        valueSuffix="%"
        questions={[]}
        actions={null}
      >
        <p>x</p>
      </ResultsSummary>
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("offers one review chip per question", async () => {
    const onReview = vi.fn();
    render(
      <ResultsSummary
        title="Done"
        fraction={0.5}
        value={1}
        questions={[
          { state: "correct", onReview: () => {} },
          { state: "incorrect", onReview },
        ]}
        actions={null}
      >
        <p>x</p>
      </ResultsSummary>
    );
    await userEvent.click(screen.getByRole("button", { name: /Question 2, incorrect/ }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Question 1, correct/ })).toHaveAttribute(
      "data-state",
      "correct"
    );
  });
  it("says each question's result in words, not just colour", () => {
    render(
      <ResultsSummary
        title="Done"
        fraction={0.5}
        value={1}
        questions={[
          { state: "partial", onReview: () => {} },
          { state: "answered", onReview: () => {} },
          { state: undefined, onReview: () => {} },
        ]}
        actions={null}
      >
        <p>x</p>
      </ResultsSummary>
    );
    expect(
      screen.getByRole("button", { name: "Question 1, partly correct. Review" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Question 2, answered, not graded. Review" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Question 3, not answered. Review" })
    ).toBeInTheDocument();
  });

  it("bursts on a perfect score only", () => {
    const { container, rerender } = render(
      <ResultsSummary title="Done" fraction={1} value={3} questions={[]} actions={null}>
        <p>x</p>
      </ResultsSummary>
    );
    expect(container.querySelector("[data-slot=burst]")).not.toBeNull();
    rerender(
      <ResultsSummary title="Done" fraction={0.9} value={3} questions={[]} actions={null}>
        <p>x</p>
      </ResultsSummary>
    );
    expect(container.querySelector("[data-slot=burst]")).toBeNull();
  });

  it("draws no ring arc at zero, so a round cap cannot leave a dot", () => {
    const { container } = render(
      <ResultsSummary title="Done" fraction={0} value={0} questions={[]} actions={null}>
        <p>x</p>
      </ResultsSummary>
    );
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });
});
