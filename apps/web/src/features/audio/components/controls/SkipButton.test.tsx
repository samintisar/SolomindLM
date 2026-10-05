import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayButton } from "./PlayButton";
import { SkipButton } from "./SkipButton";

describe("SkipButton", () => {
  it("is labelled by direction and calls onSkip", async () => {
    const onSkip = vi.fn();
    render(
      <>
        <SkipButton direction="back" onSkip={onSkip} />
        <SkipButton direction="forward" onSkip={onSkip} />
      </>
    );
    await userEvent.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    await userEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it("does nothing when disabled", async () => {
    const onSkip = vi.fn();
    render(<SkipButton direction="back" onSkip={onSkip} disabled />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSkip).not.toHaveBeenCalled();
  });
});

describe("PlayButton", () => {
  it("toggles between Play and Pause labels", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<PlayButton isPlaying={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<PlayButton isPlaying onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
});
