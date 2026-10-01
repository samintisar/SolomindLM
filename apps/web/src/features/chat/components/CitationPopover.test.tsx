import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReferenceChunk } from "@/shared/types/index";
import { CitationChip } from "../utils/messageRendering";
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

function Harness({ onAddToNotebook }: { onAddToNotebook?: () => void }) {
  const { handlers, popover } = useCitationPopover({
    resolveReference,
    onAddToNotebook: onAddToNotebook ? () => onAddToNotebook : undefined,
  });
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
      <span
        data-testid="hover-chip"
        onPointerEnter={(e) => handlers.onRefEnter(1, "m1", e.currentTarget)}
        onPointerLeave={handlers.onRefLeave}
      />
      <button type="button">outside</button>
      {popover}
    </div>
  );
}

/** Real chips inside a scroller that can be unmounted, like a Virtuoso row scrolling away. */
function ChipHarness() {
  const [showChip, setShowChip] = useState(true);
  const { handlers, popover } = useCitationPopover({ resolveReference });
  return (
    <div>
      <div data-testid="scroller">
        {showChip && <CitationChip refId={1} messageId="m1" handlers={handlers} />}
      </div>
      <button type="button" onClick={() => setShowChip(false)}>
        unmount chip
      </button>
      {popover}
    </div>
  );
}

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("CitationPopover", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  test("tap toggles open and closed", async () => {
    const u = user();
    render(<Harness />);
    await u.click(screen.getByRole("button", { name: "chip" }));
    expect(await screen.findByText("Doc A")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "chip" }));
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("hover intent opens; leaving closes after a delay", async () => {
    render(<Harness />);
    const chip = screen.getByTestId("hover-chip");
    fireEvent.pointerEnter(chip, { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(120));
    expect(screen.getByText("Doc A")).toBeInTheDocument();
    fireEvent.pointerLeave(chip, { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(200));
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("a brief hover that leaves before the open delay never opens", async () => {
    render(<Harness />);
    const chip = screen.getByTestId("hover-chip");
    fireEvent.pointerEnter(chip, { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(40));
    fireEvent.pointerLeave(chip, { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(300));
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("moving the pointer from the chip into the popover keeps it open", async () => {
    render(<Harness />);
    const chip = screen.getByTestId("hover-chip");
    fireEvent.pointerEnter(chip, { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(120));
    fireEvent.pointerLeave(chip, { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(50));
    fireEvent.pointerEnter(screen.getByRole("dialog"), { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(300));
    expect(screen.getByText("Doc A")).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByRole("dialog"), { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(200));
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  test("a tapped-open popover is pinned: pointer leave does not close it", async () => {
    const u = user();
    render(<Harness />);
    await u.click(screen.getByRole("button", { name: "chip" }));
    await screen.findByText("Doc A");
    fireEvent.pointerLeave(screen.getByRole("dialog"), { pointerType: "mouse" });
    await act(async () => vi.advanceTimersByTime(300));
    expect(screen.getByText("Doc A")).toBeInTheDocument();
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
    render(<Harness onAddToNotebook={onAdd} />);
    await u.click(screen.getByRole("button", { name: "chip" }));
    await u.click(await screen.findByRole("button", { name: "Add to notebook" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test("keyboard toggle moves focus into the card; Escape returns it to the chip", async () => {
    const u = user();
    render(<ChipHarness />);
    const chip = screen.getByRole("button", { name: "Reference 1" });
    act(() => chip.focus());
    await u.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip).toHaveFocus();
  });

  test("closes on scroll once the anchored chip has unmounted", async () => {
    const u = user();
    render(<ChipHarness />);
    await u.click(screen.getByRole("button", { name: "Reference 1" }));
    await screen.findByText("Doc A");
    await u.click(screen.getByRole("button", { name: "unmount chip" }));
    fireEvent.scroll(screen.getByTestId("scroller"));
    expect(screen.queryByText("Doc A")).toBeNull();
  });
});

describe("CitationChip", () => {
  const handlers = () => ({ onRefEnter: vi.fn(), onRefLeave: vi.fn(), onRefToggle: vi.fn() });

  test("renders a labelled button that keeps the e2e title", () => {
    render(<CitationChip refId={3} messageId="m1" handlers={handlers()} />);
    const chip = screen.getByRole("button", { name: "Reference 3" });
    expect(chip).toHaveAttribute("title", "Reference 3");
    expect(chip).toHaveTextContent("3");
  });

  test("Enter and Space toggle; click toggles", () => {
    const h = handlers();
    render(<CitationChip refId={3} messageId="m1" handlers={h} />);
    const chip = screen.getByRole("button", { name: "Reference 3" });
    fireEvent.keyDown(chip, { key: "Enter" });
    fireEvent.keyDown(chip, { key: " " });
    expect(h.onRefToggle).toHaveBeenCalledTimes(2);
    expect(h.onRefToggle).toHaveBeenCalledWith(3, "m1", chip, "keyboard");
    fireEvent.click(chip);
    expect(h.onRefToggle).toHaveBeenLastCalledWith(3, "m1", chip, "pointer");
  });

  test("hover intent is mouse-only", () => {
    const h = handlers();
    render(<CitationChip refId={3} messageId="m1" handlers={h} />);
    const chip = screen.getByRole("button", { name: "Reference 3" });
    fireEvent.pointerEnter(chip, { pointerType: "touch" });
    fireEvent.pointerLeave(chip, { pointerType: "touch" });
    expect(h.onRefEnter).not.toHaveBeenCalled();
    expect(h.onRefLeave).not.toHaveBeenCalled();
    fireEvent.pointerEnter(chip, { pointerType: "mouse" });
    fireEvent.pointerLeave(chip, { pointerType: "mouse" });
    expect(h.onRefEnter).toHaveBeenCalledWith(3, "m1", chip);
    expect(h.onRefLeave).toHaveBeenCalledTimes(1);
  });

  test("without handlers it is a plain, non-interactive label", () => {
    render(<CitationChip refId={3} messageId="m1" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTitle("Reference 3")).toHaveTextContent("3");
  });
});
