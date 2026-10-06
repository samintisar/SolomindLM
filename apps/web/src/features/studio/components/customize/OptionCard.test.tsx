import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionCard } from "./OptionCard";

describe("OptionCard", () => {
  it("is a button named by its title and described by its description", async () => {
    const onSelect = vi.fn();
    render(<OptionCard title="Summary" description="A concise synthesis." onSelect={onSelect} />);
    const card = screen.getByRole("button", { name: "Summary" });
    expect(card).toHaveAccessibleDescription("A concise synthesis.");
    expect(card).not.toHaveAttribute("aria-pressed");
    await userEvent.click(card);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("marks the chosen card in a single-choice picker", () => {
    render(<OptionCard title="Debate" description="Two hosts." selected onSelect={vi.fn()} />);
    const card = screen.getByRole("button", { name: "Debate" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card.closest("[data-slot=card]")).toHaveAttribute("data-selected", "true");
  });

  it("shows a decorative check on the chosen card only", () => {
    const { container, rerender } = render(
      <OptionCard title="Debate" description="Two hosts." selected onSelect={vi.fn()} />
    );
    const check = container.querySelector("[data-slot=option-card-check]");
    expect(check).toHaveAttribute("aria-hidden", "true");
    expect(check).toHaveClass("right-2");
    expect(check?.querySelector("svg")).not.toBeNull();
    rerender(
      <OptionCard title="Debate" description="Two hosts." selected={false} onSelect={vi.fn()} />
    );
    expect(container.querySelector("[data-slot=option-card-check]")).toBeNull();
    expect(screen.getByRole("button", { name: "Debate" })).toHaveAttribute("aria-pressed", "false");
  });

  it("puts the check in the other corner from the corner action", () => {
    const { container } = render(
      <OptionCard
        title="Briefing Doc"
        description="Key insights."
        selected
        onSelect={vi.fn()}
        action={<button type="button">Edit the Briefing Doc prompt</button>}
      />
    );
    const check = container.querySelector("[data-slot=option-card-check]");
    expect(check).toHaveClass("left-2");
    expect(check).not.toHaveClass("right-2");
    expect(check?.contains(screen.getByRole("button", { name: /edit the briefing doc/i }))).toBe(
      false
    );
  });

  it("keeps its corner action separate from selecting", async () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(
      <OptionCard
        title="Briefing Doc"
        description="Key insights."
        onSelect={onSelect}
        action={
          <button type="button" onClick={onEdit}>
            Edit the Briefing Doc prompt
          </button>
        }
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit the Briefing Doc prompt" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
