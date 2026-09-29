import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import MarkdownRenderer from "./MarkdownRenderer";

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
});
