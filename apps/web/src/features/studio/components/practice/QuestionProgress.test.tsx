import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionProgress } from "./QuestionProgress";

describe("QuestionProgress", () => {
  it("keeps each header phrase whole so a narrow panel wraps between them (#177)", () => {
    render(
      <QuestionProgress
        currentIndex={0}
        states={[undefined, undefined, undefined, undefined, undefined]}
        trailing={<span className="whitespace-nowrap">1 of 5 answered</span>}
      />
    );
    const position = screen.getByText("Question 1 of 5");
    expect(position).toHaveClass("whitespace-nowrap");
    expect(position.parentElement).toHaveClass("flex-wrap");
    expect(screen.getByText("1 of 5 answered")).toBeInTheDocument();
  });

  it("colours one segment per question by result and marks the current one", () => {
    render(
      <QuestionProgress currentIndex={2} states={["correct", "incorrect", undefined, undefined]} />
    );
    const bar = screen.getByRole("progressbar", { name: "Question progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
    const states = [...bar.children].map((segment) => segment.getAttribute("data-state"));
    expect(states).toEqual(["correct", "incorrect", "current", "pending"]);
  });
});
