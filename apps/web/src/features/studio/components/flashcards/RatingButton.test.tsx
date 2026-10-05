import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RatingButton } from "./RatingButton";
import { RATINGS } from "./ratings";

describe("RatingButton", () => {
  it("names the button with the label and the interval, separated by a space", () => {
    render(<RatingButton config={RATINGS[0]} subtext="in 1 min" onRate={() => {}} />);
    expect(screen.getByRole("button", { name: /Again\s+in 1 min/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "1"
    );
  });

  it("rates on click and not when disabled", async () => {
    const onRate = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <RatingButton config={RATINGS[2]} subtext="in 10 min" onRate={onRate} />
    );
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(onRate).toHaveBeenCalledWith("good");
    rerender(<RatingButton config={RATINGS[2]} subtext="in 10 min" onRate={onRate} disabled />);
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(onRate).toHaveBeenCalledTimes(1);
  });
});
