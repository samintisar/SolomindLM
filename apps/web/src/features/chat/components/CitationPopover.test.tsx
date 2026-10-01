import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReferenceChunk } from "@/shared/types/index";
import { CitationChip } from "./CitationChip";
import { useCitationPopover } from "./CitationPopover";

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

const TITLES: Record<number, string> = { 1: "Doc A", 2: "Doc B" };

function resolveReference(messageId: string, refId: number): ReferenceChunk | null {
  if (messageId !== "m1" || !TITLES[refId]) return null;
  return {
    id: refId,
    sourceId: "s",
    sourceTitle: TITLES[refId],
    sourceUrl: "https://example.com/a",
    content: "Snippet text",
    chunkIndex: 0,
  };
}

/** The plan's harness: plain elements calling the handlers directly. */
function Harness() {
  const { handlers, popover } = useCitationPopover({ resolveReference });
  return (
    <div>
      <button type="button" onClick={(e) => handlers.onRefToggle(1, "m1", e.currentTarget)}>
        chip
      </button>
      <button
        type="button"
        data-citation-chip
        onClick={(e) => handlers.onRefToggle(2, "m1", e.currentTarget)}
      >
        chip two
      </button>
      <button type="button">outside</button>
      {popover}
    </div>
  );
}

/** Real chips in a message row inside a scroller; chips can remount or unmount. */
function ChipHarness({ onAddToNotebook }: { onAddToNotebook?: () => void }) {
  const [version, setVersion] = useState(0);
  const [showChips, setShowChips] = useState(true);
  const { handlers, popover } = useCitationPopover({
    resolveReference,
    onAddToNotebook: onAddToNotebook ? () => onAddToNotebook : undefined,
  });
  return (
    <div>
      <div data-testid="scroller">
        <div data-message-id="m1">
          {showChips && (
            <p key={version}>
              <CitationChip refId={1} messageId="m1" handlers={handlers} />
              <CitationChip refId={2} messageId="m1" handlers={handlers} />
            </p>
          )}
        </div>
      </div>
      <button type="button" onClick={() => setVersion((v) => v + 1)}>
        remount chips
      </button>
      <button type="button" onClick={() => setShowChips(false)}>
        unmount chips
      </button>
      {popover}
    </div>
  );
}

const chip = (n: number) => screen.getByRole("button", { name: `Reference ${n}` });
const isOpen = (title: string) => screen.queryByText(title) !== null;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const hoverIn = (el: Element) => fireEvent.pointerEnter(el, { pointerType: "mouse" });
const hoverOut = (el: Element) => fireEvent.pointerLeave(el, { pointerType: "mouse" });

describe("CitationPopover: hover and pinning", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("hover intent opens after the delay; leaving closes after the delay", () => {
    render(<ChipHarness />);
    hoverIn(chip(1));
    advance(40);
    expect(isOpen("Doc A")).toBe(false);
    advance(60);
    expect(isOpen("Doc A")).toBe(true);
    hoverOut(chip(1));
    advance(100);
    expect(isOpen("Doc A")).toBe(true);
    advance(60);
    expect(isOpen("Doc A")).toBe(false);
  });

  test("a brief hover that leaves before the open delay never opens", () => {
    render(<ChipHarness />);
    hoverIn(chip(1));
    advance(40);
    hoverOut(chip(1));
    advance(100);
    expect(isOpen("Doc A")).toBe(false);
  });

  test("moving the pointer from the chip into the card keeps it open", () => {
    render(<ChipHarness />);
    hoverIn(chip(1));
    advance(100);
    hoverOut(chip(1));
    advance(50);
    expect(isOpen("Doc A")).toBe(true);
    hoverIn(screen.getByRole("dialog"));
    advance(300);
    expect(isOpen("Doc A")).toBe(true);
    hoverOut(screen.getByRole("dialog"));
    advance(160);
    expect(isOpen("Doc A")).toBe(false);
  });

  test("clicking a hover-opened chip pins it; clicking again closes it", () => {
    render(<ChipHarness />);
    hoverIn(chip(1));
    advance(100);
    fireEvent.click(chip(1));
    hoverOut(chip(1));
    advance(300);
    expect(isOpen("Doc A")).toBe(true);
    fireEvent.click(chip(1));
    expect(isOpen("Doc A")).toBe(false);
  });

  test("hovering another chip while pinned does not retarget", () => {
    render(<ChipHarness />);
    fireEvent.click(chip(1));
    hoverIn(chip(2));
    advance(300);
    expect(isOpen("Doc A")).toBe(true);
    expect(isOpen("Doc B")).toBe(false);
  });

  test("a toggle cancels a pending hover open", () => {
    render(<ChipHarness />);
    hoverIn(chip(2));
    advance(40);
    fireEvent.click(chip(1));
    advance(300);
    expect(isOpen("Doc A")).toBe(true);
    expect(isOpen("Doc B")).toBe(false);
  });

  test("marks the active chip aria-expanded", () => {
    render(<ChipHarness />);
    fireEvent.click(chip(1));
    expect(chip(1)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(chip(2));
    expect(chip(1)).toHaveAttribute("aria-expanded", "false");
    expect(chip(2)).toHaveAttribute("aria-expanded", "true");
  });

  test("follows a chip that remounts instead of closing", () => {
    render(<ChipHarness />);
    const original = chip(1);
    fireEvent.click(original);
    fireEvent.click(screen.getByRole("button", { name: "remount chips" }));
    const replacement = chip(1);
    expect(replacement).not.toBe(original);
    expect(isOpen("Doc A")).toBe(true);
    expect(replacement).toHaveAttribute("aria-expanded", "true");
    // The replacement counts as the open chip: toggling it closes the pinned card.
    fireEvent.click(replacement);
    expect(isOpen("Doc A")).toBe(false);
  });

  test("closes when the chip unmounts", () => {
    render(<ChipHarness />);
    fireEvent.click(chip(1));
    fireEvent.click(screen.getByRole("button", { name: "unmount chips" }));
    expect(isOpen("Doc A")).toBe(false);
  });

  test("ignores scrolls inside the card; closes when the chip scrolls out of its scroller", () => {
    render(<ChipHarness />);
    fireEvent.click(chip(1));
    const scroller = screen.getByTestId("scroller");
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 100, width: 500, height: 400 })
    );
    const chipRect = vi
      .spyOn(chip(1), "getBoundingClientRect")
      .mockReturnValue(DOMRect.fromRect({ x: 10, y: 50, width: 20, height: 20 }));

    // The chip is out of view, but the scroll happened inside the card: ignored.
    fireEvent.scroll(screen.getByRole("dialog").querySelector(".overflow-y-auto") as Element);
    expect(isOpen("Doc A")).toBe(true);

    chipRect.mockReturnValue(DOMRect.fromRect({ x: 10, y: 200, width: 20, height: 20 }));
    fireEvent.scroll(scroller);
    expect(isOpen("Doc A")).toBe(true);

    chipRect.mockReturnValue(DOMRect.fromRect({ x: 10, y: 50, width: 20, height: 20 }));
    fireEvent.scroll(scroller);
    expect(isOpen("Doc A")).toBe(false);
  });
});

describe("CitationPopover: click, keyboard and focus", () => {
  // userEvent and Radix's deferred outside-click listener need real time to pass.
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());
  const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  test("tap toggles open and closed", async () => {
    const u = user();
    render(<Harness />);
    await u.click(screen.getByRole("button", { name: "chip" }));
    expect(await screen.findByText("Doc A")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "chip" }));
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("clicking a different chip retargets instead of closing", async () => {
    const u = user();
    render(<Harness />);
    await u.click(screen.getByRole("button", { name: "chip" }));
    await screen.findByText("Doc A");
    await u.click(screen.getByRole("button", { name: "chip two" }));
    expect(await screen.findByText("Doc B")).toBeInTheDocument();
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("Escape closes", async () => {
    const u = user();
    render(<Harness />);
    await u.click(screen.getByRole("button", { name: "chip" }));
    await screen.findByText("Doc A");
    await u.keyboard("{Escape}");
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("an outside click closes", async () => {
    const u = user();
    render(<Harness />);
    await u.click(screen.getByRole("button", { name: "chip" }));
    await screen.findByText("Doc A");
    await act(async () => vi.advanceTimersByTime(10));
    await u.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("Add to notebook calls the handler", async () => {
    const u = user();
    const onAdd = vi.fn();
    render(<ChipHarness onAddToNotebook={onAdd} />);
    await u.click(chip(1));
    await u.click(await screen.findByRole("button", { name: "Add to notebook" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test("keyboard open focuses the card itself; a held Enter does not add; Escape returns focus", async () => {
    const u = user();
    const onAdd = vi.fn();
    render(<ChipHarness onAddToNotebook={onAdd} />);
    act(() => chip(1).focus());
    await u.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Reference 1" });
    expect(dialog).toHaveFocus();

    // Auto-repeat of the Enter that opened it lands on the card (and the chip ignores repeats).
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter", repeat: true });
    fireEvent.keyDown(chip(1), { key: "Enter", repeat: true });
    await u.keyboard("{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await u.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip(1)).toHaveFocus();
  });

  test("a pointer-opened card returns focus to the chip if focus was inside it", async () => {
    const u = user();
    render(<ChipHarness />);
    await u.click(chip(1));
    const dialog = await screen.findByRole("dialog");
    act(() => dialog.focus());
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip(1)).toHaveFocus();
  });

  test("an outside click does not pull focus back to the chip", async () => {
    const u = user();
    render(<ChipHarness />);
    act(() => chip(1).focus());
    await u.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await act(async () => vi.advanceTimersByTime(10));
    await u.click(screen.getByRole("button", { name: "remount chips" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "remount chips" })).toHaveFocus();
  });
});

describe("CitationChip", () => {
  const handlers = () => ({ onRefEnter: vi.fn(), onRefLeave: vi.fn(), onRefToggle: vi.fn() });

  test("renders a labelled button that keeps the e2e title", () => {
    render(<CitationChip refId={3} messageId="m1" handlers={handlers()} />);
    const el = chip(3);
    expect(el).toHaveAttribute("title", "Reference 3");
    expect(el).toHaveTextContent("3");
  });

  test("Enter and Space toggle; held keys don't repeat; click toggles", () => {
    const h = handlers();
    render(<CitationChip refId={3} messageId="m1" handlers={h} />);
    const el = chip(3);
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.keyDown(el, { key: " " });
    fireEvent.keyDown(el, { key: "Enter", repeat: true });
    expect(h.onRefToggle).toHaveBeenCalledTimes(2);
    expect(h.onRefToggle).toHaveBeenCalledWith(3, "m1", el, "keyboard");
    fireEvent.click(el);
    expect(h.onRefToggle).toHaveBeenLastCalledWith(3, "m1", el, "pointer");
  });

  test("hover intent is mouse-only", () => {
    const h = handlers();
    render(<CitationChip refId={3} messageId="m1" handlers={h} />);
    const el = chip(3);
    fireEvent.pointerEnter(el, { pointerType: "touch" });
    fireEvent.pointerLeave(el, { pointerType: "touch" });
    expect(h.onRefEnter).not.toHaveBeenCalled();
    expect(h.onRefLeave).not.toHaveBeenCalled();
    hoverIn(el);
    hoverOut(el);
    expect(h.onRefEnter).toHaveBeenCalledWith(3, "m1", el);
    expect(h.onRefLeave).toHaveBeenCalledTimes(1);
  });

  test("without handlers it is a plain, non-interactive label", () => {
    render(<CitationChip refId={3} messageId="m1" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTitle("Reference 3")).toHaveTextContent("3");
  });
});
