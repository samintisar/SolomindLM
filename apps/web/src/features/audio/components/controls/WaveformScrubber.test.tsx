import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WaveformScrubber } from "./WaveformScrubber";

beforeAll(() => {
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(props: Partial<React.ComponentProps<typeof WaveformScrubber>> = {}) {
  const onSeek = vi.fn();
  render(
    <WaveformScrubber seed="note-1" currentTime={30} duration={120} onSeek={onSeek} {...props} />
  );
  const slider = screen.getByRole("slider", { name: "Seek" });
  return { onSeek, slider };
}

describe("WaveformScrubber", () => {
  it("is a slider that reads out the time", () => {
    const { slider } = setup();
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "120");
    expect(slider).toHaveAttribute("aria-valuenow", "30");
    expect(slider).toHaveAttribute("aria-valuetext", "0:30 of 2:00");
    expect(screen.getByText("0:30")).toBeInTheDocument();
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("draws 64 bars by default, with the played ones filled", () => {
    const { slider } = setup();
    const bars = slider.querySelectorAll("span");
    expect(bars).toHaveLength(64);
    // 30 of 120 seconds: the first quarter is played.
    expect(bars[0]).toHaveClass("bg-primary");
    expect(bars[15]).toHaveClass("bg-primary");
    expect(bars[16]).not.toHaveClass("bg-primary");
    expect(bars[63]).not.toHaveClass("bg-primary");
  });

  it("draws the same bars for the same seed", () => {
    const heights = () =>
      Array.from(screen.getByRole("slider").querySelectorAll("span")).map((bar) =>
        (bar as HTMLElement).style.getPropertyValue("--audio-bar")
      );
    const { unmount } = render(
      <WaveformScrubber seed="a" currentTime={0} duration={10} onSeek={() => {}} />
    );
    const first = heights();
    unmount();
    render(<WaveformScrubber seed="a" currentTime={0} duration={10} onSeek={() => {}} />);
    expect(heights()).toEqual(first);
  });

  it("skips 10 seconds with the arrow keys and stops them reaching the player", () => {
    const { onSeek, slider } = setup();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(40);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(20);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("jumps to the start and end with Home and End", () => {
    const { onSeek, slider } = setup();
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onSeek).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onSeek).toHaveBeenLastCalledWith(120);
  });

  it("clamps arrow seeks to the track", () => {
    const { onSeek, slider } = setup({ currentTime: 115 });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(120);
  });

  it("seeks to where the pointer lands, then follows a drag", () => {
    const { onSeek, slider } = setup();
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
      right: 200,
      top: 0,
      bottom: 36,
      height: 36,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(30);
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(60);
    fireEvent.pointerUp(slider, { pointerId: 1 });
    onSeek.mockClear();
    fireEvent.pointerMove(slider, { clientX: 150, pointerId: 1 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const { onSeek, slider } = setup({ disabled: true });
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("ignores non-primary pointer buttons", () => {
    const { onSeek, slider } = setup();
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1, button: 2 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("stops following the pointer when capture is lost", () => {
    const { onSeek, slider } = setup();
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
      right: 200,
      top: 0,
      bottom: 36,
      height: 36,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    fireEvent.lostPointerCapture(slider, { pointerId: 1 });
    onSeek.mockClear();
    fireEvent.pointerMove(slider, { clientX: 150, pointerId: 1 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("is inert and out of the tab order before the duration is known", () => {
    const { onSeek, slider } = setup({ duration: 0, currentTime: 0 });
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
