import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PLAYBACK_RATES } from "../../hooks/useAudioPlayer";
import { SpeedPill } from "./SpeedPill";

describe("SpeedPill", () => {
  it("shows the normal rate quietly", () => {
    render(<SpeedPill rate={1} onCycle={() => {}} />);
    const pill = screen.getByRole("button", { name: "Playback speed 1×" });
    expect(pill).toHaveTextContent("1×");
    expect(pill).toHaveAttribute("data-active", "false");
  });

  it("highlights any other rate", () => {
    render(<SpeedPill rate={1.5} onCycle={() => {}} />);
    const pill = screen.getByRole("button", { name: "Playback speed 1.5×" });
    expect(pill).toHaveTextContent("1.5×");
    expect(pill).toHaveAttribute("data-active", "true");
  });

  it("labels every rate in the cycle", () => {
    for (const rate of PLAYBACK_RATES) {
      const { unmount } = render(<SpeedPill rate={rate} onCycle={() => {}} />);
      expect(screen.getByRole("button", { name: `Playback speed ${rate}×` })).toBeInTheDocument();
      unmount();
    }
  });

  it("calls onCycle on click", async () => {
    const onCycle = vi.fn();
    render(<SpeedPill rate={1.25} onCycle={onCycle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onCycle).toHaveBeenCalledOnce();
  });

  it("does nothing when disabled", async () => {
    const onCycle = vi.fn();
    render(<SpeedPill rate={1} onCycle={onCycle} disabled />);
    await userEvent.click(screen.getByRole("button"));
    expect(onCycle).not.toHaveBeenCalled();
  });
});
