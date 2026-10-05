import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FlipCard } from "./FlipCard";

describe("FlipCard", () => {
  it("shows the front until flipped, then the back", () => {
    const { rerender } = render(<FlipCard flipped={false} front={<p>Q</p>} back={<p>A</p>} />);
    expect(screen.getByText("Q").closest("[data-face]")).toHaveAttribute("data-shown", "true");
    expect(screen.getByText("A").closest("[data-face]")).toHaveAttribute("data-shown", "false");
    rerender(<FlipCard flipped front={<p>Q</p>} back={<p>A</p>} />);
    expect(screen.getByText("A").closest("[data-face]")).toHaveAttribute("data-shown", "true");
  });

  it("activates on click, Enter and Space when interactive", async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(
      <FlipCard
        flipped={false}
        front="Q"
        back="A"
        onActivate={onActivate}
        label="Flashcard question"
      />
    );
    const card = screen.getByRole("button", { name: "Flashcard question" });
    await user.click(card);
    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it("is not a button when it has no action", () => {
    render(<FlipCard flipped={false} front="Q" back="A" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
