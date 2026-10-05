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

  it("has the text alone as its accessible name, without the letter", () => {
    render(
      <QuizOption position={2} state="idle" disabled={false} onSelect={() => {}}>
        Some text
      </QuizOption>
    );
    expect(screen.getByRole("button", { name: "Some text" })).toBeInTheDocument();
  });

  it("dims the options that were not chosen", () => {
    render(
      <QuizOption position={0} state="dimmed" disabled onSelect={() => {}}>
        Other
      </QuizOption>
    );
    const option = screen.getByRole("button", { name: "Other" });
    expect(option).toHaveAttribute("data-state", "dimmed");
    expect(option.className).toContain("opacity-50");
  });

  it("does not call onSelect while disabled", async () => {
    const onSelect = vi.fn();
    render(
      <QuizOption position={0} state="idle" disabled onSelect={onSelect}>
        Locked
      </QuizOption>
    );
    await userEvent.click(screen.getByRole("button", { name: "Locked" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("bursts when celebrating", () => {
    const { container } = render(
      <QuizOption position={0} state="correct" disabled celebrate onSelect={() => {}}>
        A
      </QuizOption>
    );
    expect(container.querySelector("[data-slot=burst]")).not.toBeNull();
    expect(screen.getByRole("button").className).toContain("animate-studio-select-pop");
  });
});
