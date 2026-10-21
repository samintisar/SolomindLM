import { render, screen } from "@testing-library/react";
import type { StreamdownProps } from "streamdown";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MarkdownRenderer from "./MarkdownRenderer";

/** Props of every Streamdown render, to check what MarkdownRenderer passes down. */
const streamdownProps = vi.hoisted(() => [] as StreamdownProps[]);
vi.mock("streamdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("streamdown")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    Streamdown: (props: StreamdownProps) => {
      streamdownProps.push(props);
      return createElement(actual.Streamdown, props);
    },
  };
});

beforeEach(() => {
  streamdownProps.length = 0;
});

describe("MarkdownRenderer", () => {
  // Streamdown <2.6 memoized elements by AST source position only, so new content with the same
  // shape (e.g. flashcard -> next flashcard of equal length) kept rendering the old text.
  test("re-renders when content changes but has the same length", () => {
    const { rerender } = render(<MarkdownRenderer>Card one</MarkdownRenderer>);
    expect(screen.getByText("Card one")).toBeInTheDocument();

    rerender(<MarkdownRenderer>Card two</MarkdownRenderer>);

    expect(screen.getByText("Card two")).toBeInTheDocument();
    expect(screen.queryByText("Card one")).not.toBeInTheDocument();
  });

  // Single-dollar math read "costs $5 and $10" as the formula "5and10" (#569).
  test("renders two amounts in one paragraph as text, and real formulas as math", () => {
    const { container } = render(
      <MarkdownRenderer>
        {"Price rose to $33.00 after a $1.00 increase, where $x^2$ is demand."}
      </MarkdownRenderer>
    );

    expect(container.textContent).toContain("Price rose to $33.00 after a $1.00 increase");
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
  });

  // Streamdown's top-level memo compares props by identity: a fresh default array per render
  // would defeat it for every caller.
  test("passes the same default theme and plugins on every render", () => {
    const { rerender } = render(<MarkdownRenderer>Same text</MarkdownRenderer>);
    rerender(<MarkdownRenderer>Same text</MarkdownRenderer>);

    expect(streamdownProps).toHaveLength(2);
    const [first, second] = streamdownProps;
    expect(first?.shikiTheme).toEqual(["github-light", "github-light"]);
    expect(second?.shikiTheme).toBe(first?.shikiTheme);
    expect(second?.plugins).toBe(first?.plugins);
  });
});
