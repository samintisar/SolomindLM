import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuizOption } from "./QuizOption";

describe("QuizOption", () => {
  it("shows its letter and calls onSelect", async () => {
    const onSelect = vi.fn();
    render(
      <QuizOption position={1} state="idle" disabled={false} onSelect={onSelect}>
        UNION removes duplicates
      </QuizOption>
    );
    const option = screen.getByRole("button", { name: /UNION removes duplicates/ });
    expect(option).toHaveTextContent("B");
    await userEvent.click(option);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("announces a correct or incorrect result and draws its mark", () => {
    const { rerender } = render(
      <QuizOption position={0} state="correct" disabled onSelect={() => {}}>
        A
      </QuizOption>
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "correct");
    expect(screen.getByText("Correct answer")).toHaveClass("sr-only");
    rerender(
      <QuizOption position={0} state="incorrect" disabled onSelect={() => {}}>
        A
      </QuizOption>
    );
    expect(screen.getByText("Your answer, incorrect")).toBeInTheDocument();
    expect(screen.getByRole("button").className).toContain("animate-studio-shake");
  });

  it("bursts when celebrating", () => {
    const { container } = render(
      <QuizOption position={0} state="correct" disabled celebrate onSelect={() => {}}>
        A
      </QuizOption>
    );
    expect(container.querySelector("[data-slot=burst]")).not.toBeNull();
  });
});
