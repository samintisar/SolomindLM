import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderLine } from "../transcript/transcriptLines";
import { TranscriptReader } from "./TranscriptReader";

let reduceMotion = false;
vi.mock("motion/react", () => ({
  useReducedMotion: () => reduceMotion,
}));

const lines: ReaderLine[] = [
  { speaker: "host_a", text: "Welcome to the show.", startMs: 0, endMs: 2000 },
  { speaker: "host_b", text: "Glad to be here.", startMs: 2000, endMs: 4000 },
  { speaker: null, text: "An unlabelled aside.", startMs: 4000, endMs: 6000 },
];

const scrollTo = vi.fn();

// jsdom has no layout. Give the scroller room to scroll and every line a position away from the
// top, so centring has somewhere to go (it skips scrolls that would not move).
beforeAll(() => {
  const define = (name: string, get: (this: HTMLElement) => number) =>
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get });
  define("clientHeight", () => 200);
  define("scrollHeight", () => 2000);
  define("offsetHeight", () => 50);
  define("offsetTop", function (this: HTMLElement) {
    return 300 + Number(this.dataset.lineIndex ?? 0) * 100;
  });
});

beforeEach(() => {
  reduceMotion = false;
  scrollTo.mockReset();
  HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
});

function renderReader(props: Partial<React.ComponentProps<typeof TranscriptReader>> = {}) {
  return render(
    <TranscriptReader
      lines={lines}
      activeIndex={0}
      isPlaying={false}
      approximate={false}
      onSeek={vi.fn()}
      {...props}
    />
  );
}

describe("TranscriptReader", () => {
  it("marks only the active line as current", () => {
    renderReader({ activeIndex: 1 });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).not.toHaveAttribute("aria-current");
    expect(buttons[1]).toHaveAttribute("aria-current", "true");
    expect(buttons[2]).not.toHaveAttribute("aria-current");
  });

  it("marks no line as current when the index is -1", () => {
    renderReader({ activeIndex: -1 });
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-current");
    }
  });

  it("seeks to the start of a clicked line", async () => {
    const onSeek = vi.fn();
    renderReader({ onSeek });
    await userEvent.click(screen.getByRole("button", { name: /Glad to be here/ }));
    expect(onSeek).toHaveBeenCalledWith(2000);
  });

  it("labels the hosts, and leaves a null speaker unlabelled", () => {
    renderReader();
    expect(screen.getByText("Host 1")).toBeInTheDocument();
    expect(screen.getByText("Host 2")).toBeInTheDocument();
    expect(screen.getAllByText(/^Host \d$/)).toHaveLength(2);
  });

  it("shows Approximate sync only for an estimate", () => {
    const { rerender } = renderReader();
    expect(screen.queryByText("Approximate sync")).not.toBeInTheDocument();
    rerender(
      <TranscriptReader
        lines={lines}
        activeIndex={0}
        isPlaying={false}
        approximate
        onSeek={vi.fn()}
      />
    );
    expect(screen.getByText("Approximate sync")).toBeInTheDocument();
  });

  it("shows an empty state without lines", () => {
    renderReader({ lines: [] });
    expect(screen.getByText("No transcript")).toBeInTheDocument();
  });

  it("is a region named Transcript", () => {
    renderReader();
    expect(screen.getByRole("region", { name: "Transcript" })).toBeInTheDocument();
  });

  it("has a single tab stop: the active line", () => {
    renderReader({ activeIndex: 1 });
    const tabbable = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute("aria-current", "true");
  });

  it("makes the first line the tab stop when none is active", () => {
    renderReader({ activeIndex: -1 });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("tabindex", "0");
    expect(buttons[1]).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus between lines with the arrow keys, Home and End", async () => {
    renderReader({ activeIndex: 0 });
    const [first, second, third] = screen.getAllByRole("button");
    first?.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(first).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(third).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("offers Follow along after a scrollbar drag or any other scroll the code did not start", () => {
    const { container } = renderReader({ isPlaying: true });
    expect(screen.queryByRole("button", { name: "Follow along" })).not.toBeInTheDocument();
    const scroller = container.querySelector(".overflow-y-auto") as Element;
    fireEvent(scroller, new Event("scrollend")); // the jump that opened the reader has finished
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: "Follow along" })).toBeInTheDocument();
  });

  it("does not mistake its own centring scroll for the user leaving", () => {
    const { container, rerender } = renderReader({ isPlaying: true, activeIndex: 0 });
    rerender(
      <TranscriptReader
        lines={lines}
        activeIndex={1}
        isPlaying
        approximate={false}
        onSeek={vi.fn()}
      />
    );
    expect(scrollTo).toHaveBeenCalled();
    // The browser reports the scroll it was asked for.
    const scroller = container.querySelector(".overflow-y-auto") as Element;
    fireEvent.scroll(scroller);
    expect(screen.queryByRole("button", { name: "Follow along" })).not.toBeInTheDocument();

    // Once it has finished, the next scroll is the user's.
    fireEvent(scroller, new Event("scrollend"));
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: "Follow along" })).toBeInTheDocument();
  });

  it("puts focus on the active line when rejoining", async () => {
    const { container } = renderReader({ isPlaying: true, activeIndex: 1 });
    fireEvent.wheel(container.querySelector(".overflow-y-auto") as Element);
    await userEvent.click(screen.getByRole("button", { name: "Follow along" }));
    expect(screen.getByRole("button", { name: /Glad to be here/ })).toHaveFocus();
  });

  it("re-centres a clicked line even when it is already the active one", async () => {
    const { container } = renderReader({ isPlaying: true, activeIndex: 1 });
    const scroller = container.querySelector(".overflow-y-auto") as Element;
    fireEvent(scroller, new Event("scrollend"));
    fireEvent.wheel(scroller);
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /Glad to be here/ }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Follow along" })).not.toBeInTheDocument();
  });

  it("offers Follow along after a manual scroll while playing, and hides it on click", async () => {
    const { container } = renderReader({ isPlaying: true });
    expect(screen.queryByRole("button", { name: "Follow along" })).not.toBeInTheDocument();

    const scroller = container.querySelector(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    fireEvent.wheel(scroller as Element);

    const follow = screen.getByRole("button", { name: "Follow along" });
    await userEvent.click(follow);
    expect(screen.queryByRole("button", { name: "Follow along" })).not.toBeInTheDocument();
    // Clicking re-centres straight away.
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("does not offer Follow along for a scroll while paused", () => {
    const { container } = renderReader({ isPlaying: false });
    fireEvent.wheel(container.querySelector(".overflow-y-auto") as Element);
    expect(screen.queryByRole("button", { name: "Follow along" })).not.toBeInTheDocument();
  });

  it("treats only scrolling keys as manual scrolls", () => {
    const { container } = renderReader({ isPlaying: true });
    const scroller = container.querySelector(".overflow-y-auto") as Element;
    fireEvent.keyDown(scroller, { key: "a" });
    expect(screen.queryByRole("button", { name: "Follow along" })).not.toBeInTheDocument();
    fireEvent.keyDown(scroller, { key: "PageDown" });
    expect(screen.getByRole("button", { name: "Follow along" })).toBeInTheDocument();
  });

  it("centres the active line when it changes, and stops once the user scrolls away", () => {
    const { container, rerender } = renderReader({ isPlaying: true, activeIndex: 0 });
    scrollTo.mockClear();

    const next = (activeIndex: number) => (
      <TranscriptReader
        lines={lines}
        activeIndex={activeIndex}
        isPlaying
        approximate={false}
        onSeek={vi.fn()}
      />
    );
    rerender(next(1));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    fireEvent.touchMove(container.querySelector(".overflow-y-auto") as Element);
    scrollTo.mockClear();
    rerender(next(2));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("jumps instead of gliding under reduced motion", () => {
    reduceMotion = true;
    const { rerender } = renderReader({ activeIndex: 0 });
    scrollTo.mockClear();
    rerender(
      <TranscriptReader
        lines={lines}
        activeIndex={1}
        isPlaying
        approximate={false}
        onSeek={vi.fn()}
      />
    );
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});
