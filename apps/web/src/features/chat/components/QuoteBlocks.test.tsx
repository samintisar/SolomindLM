import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QuoteBlocks } from "./QuoteBlocks";
import { SelectionQuoteProvider, useSelectionQuotes } from "../contexts/SelectionQuoteContext";

describe("QuoteBlocks", () => {
  test("renders nothing when no quotes", () => {
    const { container } = render(
      <SelectionQuoteProvider>
        <QuoteBlocks />
      </SelectionQuoteProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  test("renders quote cards", () => {
    function TestComponent() {
      const { addQuote } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote("This is a quote from the AI", "message", "msg-1", "AI Response");
      }, [addQuote]);
      return <QuoteBlocks />;
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    expect(screen.getByText(/This is a quote from the AI/)).toBeInTheDocument();
  });

  test("removes quote when clicking X button", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { addQuote, quotes } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote("Quote to remove", "message");
      }, [addQuote]);
      return (
        <>
          <QuoteBlocks />
          <div data-testid="quote-count">{quotes.length}</div>
        </>
      );
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    expect(screen.getByText(/Quote to remove/)).toBeInTheDocument();

    const removeButton = screen.getByLabelText(/remove quote/i);
    await user.click(removeButton);

    expect(screen.queryByText(/Quote to remove/)).not.toBeInTheDocument();
    expect(screen.getByTestId("quote-count")).toHaveTextContent("0");
  });

  test("renders multiple quotes", () => {
    function TestComponent() {
      const { addQuote } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote("First quote", "message", "msg-1");
        addQuote("Second quote", "source", "src-1", "Document 1");
        addQuote("Third quote", "message", "msg-2", "User message");
      }, [addQuote]);
      return <QuoteBlocks />;
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    expect(screen.getByText(/First quote/)).toBeInTheDocument();
    expect(screen.getByText(/Second quote/)).toBeInTheDocument();
    expect(screen.getByText(/Third quote/)).toBeInTheDocument();
  });

  test("truncates long text", () => {
    const longText = "A".repeat(200);

    function TestComponent() {
      const { addQuote } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote(longText, "message");
      }, [addQuote]);
      return <QuoteBlocks />;
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    expect(screen.getByText(new RegExp(longText.slice(0, 50)))).toBeInTheDocument();
  });
});
