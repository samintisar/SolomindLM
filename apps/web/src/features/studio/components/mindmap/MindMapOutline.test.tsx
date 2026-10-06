import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MindMapOutline } from "./MindMapOutline";
import { askPrompt, type OutlineNode, toMarkdown } from "./outline";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => toast }));

function n(id: string, topic: string, children: OutlineNode[] = []): OutlineNode {
  return { id, topic, children };
}

const TITLE = "Transformers";

/** Six main branches, so the colour wraps; Attention goes three levels deep. */
const ROOT: OutlineNode = n("root", TITLE, [
  n("att", "Attention", [
    n("self", "Self-attention", [n("q", "Queries"), n("k", "Keys")]),
    n("cross", "Cross-attention"),
  ]),
  n("emb", "Embeddings", [n("tok", "Token embeddings"), n("pos", "Positional encoding")]),
  n("ff", "Feed-forward layers"),
  n("train", "Training", [n("opt", "Optimiser"), n("loss", "Loss"), n("data", "Data")]),
  n("dec", "Decoding", [n("beam", "Beam search")]),
  n("app", "Applications"),
]);

const MAIN = [
  "Attention",
  "Embeddings",
  "Feed-forward layers",
  "Training",
  "Decoding",
  "Applications",
];

function item(topic: string): HTMLElement {
  return screen.getByRole("treeitem", { name: topic });
}

function tabStops(): HTMLElement[] {
  return screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0);
}

function renderOutline(props: Partial<Parameters<typeof MindMapOutline>[0]> = {}) {
  const onAsk = vi.fn();
  const utils = render(<MindMapOutline title={TITLE} root={ROOT} onAsk={onAsk} {...props} />);
  return { onAsk, ...utils };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("MindMapOutline", () => {
  test("shows only the main branches at first, with counts and tree semantics", () => {
    renderOutline();
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: TITLE })).toBeInTheDocument();

    const items = screen.getAllByRole("treeitem");
    expect(items.map((el) => el.getAttribute("aria-label"))).toEqual(MAIN);
    items.forEach((el, i) => {
      expect(el).toHaveAttribute("aria-level", "1");
      expect(el).toHaveAttribute("aria-setsize", "6");
      expect(el).toHaveAttribute("aria-posinset", String(i + 1));
    });

    expect(item("Attention")).toHaveAttribute("aria-expanded", "false");
    expect(item("Feed-forward layers")).not.toHaveAttribute("aria-expanded");
    expect(item("Applications")).not.toHaveAttribute("aria-expanded");

    expect(item("Attention")).toHaveTextContent("2");
    expect(item("Training")).toHaveTextContent("3");
    expect(item("Decoding")).toHaveTextContent("1");
    expect(item("Feed-forward layers").textContent).toBe("Feed-forward layers");
  });

  test("never-opened branches keep their children out of the DOM", () => {
    renderOutline();
    expect(screen.queryByText("Self-attention")).toBeNull();
    expect(screen.queryByText("Queries")).toBeNull();
    expect(screen.queryByText("Beam search")).toBeNull();
  });

  test("the arrow opens a branch, shows its children and fades the count", async () => {
    renderOutline();
    await userEvent.click(screen.getByRole("button", { name: "Expand Attention" }));

    const attention = item("Attention");
    expect(attention).toHaveAttribute("aria-expanded", "true");
    expect(item("Self-attention")).toHaveAttribute("aria-level", "2");
    expect(item("Cross-attention")).toHaveAttribute("aria-posinset", "2");
    expect(attention.querySelector('[role="group"]')).toHaveAttribute("data-state", "open");
    const row = attention.firstElementChild as HTMLElement;
    expect(within(row).getByText("2")).toHaveClass("opacity-0");
    expect(within(item("Embeddings")).getByText("2")).not.toHaveClass("opacity-0");
    expect(screen.getByRole("button", { name: "Collapse Attention" })).toBeInTheDocument();
  });

  test("Expand all shows every topic; Collapse all closes every group", async () => {
    renderOutline();
    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    for (const topic of ["Queries", "Keys", "Positional encoding", "Data", "Beam search"]) {
      expect(item(topic)).toBeInTheDocument();
    }
    expect(item("Queries")).toHaveAttribute("aria-level", "3");

    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    const groups = screen.getAllByRole("group", { hidden: true });
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group).toHaveAttribute("data-state", "closed");
    for (const topic of ["Attention", "Training"]) {
      expect(item(topic)).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("clicking a topic asks the chat with its parent as context", async () => {
    const { onAsk } = renderOutline();
    await userEvent.click(screen.getByRole("button", { name: "Attention" }));
    expect(onAsk).toHaveBeenLastCalledWith(askPrompt("Attention", TITLE));

    await userEvent.click(screen.getByRole("button", { name: "Expand Attention" }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Self-attention" }));
    expect(onAsk).toHaveBeenLastCalledWith(askPrompt("Self-attention", "Attention"));
    expect(item("Self-attention").querySelector(".mindmap-flash")).not.toBeNull();
  });

  test("askDisabled disables the topic buttons", async () => {
    const { onAsk } = renderOutline({ askDisabled: true });
    const topic = screen.getByRole("button", { name: "Attention" });
    expect(topic).toBeDisabled();
    await userEvent.click(topic);
    expect(onAsk).not.toHaveBeenCalled();
  });

  test("without onAsk, topics are plain text", () => {
    render(<MindMapOutline title={TITLE} root={ROOT} />);
    expect(screen.queryByRole("button", { name: "Attention" })).toBeNull();
    expect(screen.getByText("Attention")).toBeInTheDocument();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual([
      "Expand all",
      "Collapse all",
      "Copy as Markdown",
      "Expand Attention",
      "Expand Embeddings",
      "Expand Training",
      "Expand Decoding",
    ]);
  });

  test("keyboard follows the WAI-ARIA tree pattern", async () => {
    const { onAsk } = renderOutline();
    const user = userEvent.setup();
    expect(tabStops()).toEqual([item("Attention")]);

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(item("Attention")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(item("Embeddings")).toHaveFocus();
    expect(tabStops()).toEqual([item("Embeddings")]);
    await user.keyboard("{ArrowUp}");
    expect(item("Attention")).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(item("Attention")).toHaveAttribute("aria-expanded", "true");
    expect(item("Attention")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(item("Self-attention")).toHaveFocus();
    expect(tabStops()).toEqual([item("Self-attention")]);

    await user.keyboard("{ArrowLeft}");
    expect(item("Attention")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(item("Attention")).toHaveAttribute("aria-expanded", "false");
    expect(item("Attention")).toHaveFocus();

    await user.keyboard("{End}");
    expect(item("Applications")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(item("Attention")).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onAsk).toHaveBeenLastCalledWith(askPrompt("Attention", TITLE));

    await user.keyboard("*");
    for (const topic of ["Attention", "Embeddings", "Training", "Decoding"]) {
      expect(item(topic)).toHaveAttribute("aria-expanded", "true");
    }
    expect(item("Attention")).toHaveFocus();
    expect(tabStops()).toHaveLength(1);
  });

  test("Collapse all moves the tab stop from a nested item to its main branch", async () => {
    renderOutline();
    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await userEvent.click(screen.getByRole("button", { name: "Queries" }));
    expect(tabStops()).toEqual([item("Queries")]);

    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(tabStops()).toEqual([item("Attention")]);
  });

  test("copies the whole map as Markdown", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderOutline();

    await user.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    expect(writeText).toHaveBeenCalledWith(toMarkdown(TITLE, ROOT));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  test("a failed copy shows an error toast", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderOutline();

    await user.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy the mind map"));
    expect(screen.getByRole("button", { name: "Copy as Markdown" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  test("main branches carry a cycling branch colour", () => {
    renderOutline();
    const colours = screen
      .getAllByRole("treeitem")
      .map((el) => el.style.getPropertyValue("--branch"));
    expect(colours).toEqual([
      "var(--mindmap-branch-1)",
      "var(--mindmap-branch-2)",
      "var(--mindmap-branch-3)",
      "var(--mindmap-branch-4)",
      "var(--mindmap-branch-5)",
      "var(--mindmap-branch-1)",
    ]);
  });

  test("a re-render with an equal new root keeps what is open", async () => {
    const { rerender, onAsk } = renderOutline();
    await userEvent.click(screen.getByRole("button", { name: "Expand Attention" }));
    await userEvent.click(screen.getByRole("button", { name: "Self-attention" }));

    rerender(<MindMapOutline title={TITLE} root={structuredClone(ROOT)} onAsk={onAsk} />);
    expect(item("Attention")).toHaveAttribute("aria-expanded", "true");
    expect(item("Self-attention")).toBeInTheDocument();
    expect(tabStops()).toEqual([item("Self-attention")]);
  });

  test("while busy, every treeitem is described as waiting for the chat", () => {
    const { rerender, onAsk } = renderOutline({ askDisabled: true });
    for (const el of screen.getAllByRole("treeitem")) {
      expect(el).toHaveAccessibleDescription("Wait for the chat to finish answering");
    }

    rerender(<MindMapOutline title={TITLE} root={ROOT} onAsk={onAsk} />);
    for (const el of screen.getAllByRole("treeitem")) {
      expect(el).not.toHaveAttribute("aria-describedby");
    }
    expect(screen.queryByText("Wait for the chat to finish answering")).toBeNull();

    rerender(<MindMapOutline title={TITLE} root={ROOT} askDisabled />);
    expect(item("Attention")).not.toHaveAttribute("aria-describedby");
  });

  test("while busy, hovering a topic explains why it can't ask", async () => {
    renderOutline({ askDisabled: true });
    const wrapper = screen.getByRole("button", { name: "Attention" }).parentElement as HTMLElement;
    await userEvent.hover(wrapper);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Wait for the chat to finish answering"
    );
  });

  test("Enter does not ask while busy", async () => {
    const { onAsk } = renderOutline({ askDisabled: true });
    act(() => item("Attention").focus());
    await userEvent.keyboard("{Enter}");
    expect(onAsk).not.toHaveBeenCalled();
    expect(item("Attention")).toHaveFocus();
  });

  test("ArrowRight on a leaf and ArrowLeft on a closed main branch do nothing", async () => {
    renderOutline();
    act(() => item("Feed-forward layers").focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(item("Feed-forward layers")).toHaveFocus();
    expect(screen.getAllByRole("treeitem")).toHaveLength(6);

    act(() => item("Attention").focus());
    await userEvent.keyboard("{ArrowLeft}");
    expect(item("Attention")).toHaveFocus();
    expect(item("Attention")).toHaveAttribute("aria-expanded", "false");
    expect(tabStops()).toEqual([item("Attention")]);
  });

  describe("timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("Copied reverts to Copy as Markdown after 1.5 s", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      renderOutline();

      // fireEvent, not userEvent: userEvent's own delays stall under fake timers.
      fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown" }));
      await act(async () => {});
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1499));
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole("button", { name: "Copy as Markdown" })).toBeInTheDocument();
    });

    test("the asked row's flash is gone after 1.2 s", async () => {
      renderOutline();

      fireEvent.click(screen.getByRole("button", { name: "Attention" }));
      expect(item("Attention").querySelector(".mindmap-flash")).not.toBeNull();

      act(() => vi.advanceTimersByTime(1199));
      expect(item("Attention").querySelector(".mindmap-flash")).not.toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(item("Attention").querySelector(".mindmap-flash")).toBeNull();
    });
  });
});
