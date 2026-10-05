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
    await userEvent.click(screen.getByRole("button", { name: "Review question 2" }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Review question 1" })).toHaveAttribute(
      "data-state",
      "correct"
    );
  });
});
