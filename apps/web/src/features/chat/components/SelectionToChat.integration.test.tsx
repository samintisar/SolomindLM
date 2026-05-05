import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ChatInput } from "./ChatInput";
import { QuoteBlocks } from "./QuoteBlocks";
import { SelectionQuoteProvider, useSelectionQuotes } from "../contexts/SelectionQuoteContext";

// Mock the voice transcription hook
vi.mock("../hooks/useChatVoiceTranscription", () => ({
  useChatVoiceTranscription: () => ({
    voiceState: "idle",
    formatElapsed: "0:00",
    toggleRecording: vi.fn(),
  }),
}));

function TestChatComposer() {
  const [value, setValue] = React.useState("");
  const [sentMessage, setSentMessage] = React.useState<string | null>(null);
  const { quotes, clearQuotes } = useSelectionQuotes();

  const handleSend = () => {
    let messageWithQuotes = value.trim();
    if (quotes.length > 0) {
      const quoteBlocks = quotes
        .map((q) => {
          const sourceLabel = q.sourceTitle ? `From ${q.sourceTitle}:\n` : "";
          return `> ${sourceLabel}${q.text.split("\n").join("\n> ")}`;
        })
        .join("\n\n");
      messageWithQuotes = `${quoteBlocks}\n\n${value.trim()}`;
      clearQuotes();
    }
    setSentMessage(messageWithQuotes);
    setValue("");
  };

  return (
    <>
      <div data-testid="quote-blocks">
        <QuoteBlocks />
      </div>
      <ChatInput
        value={value}
        onChange={setValue}
        onSend={handleSend}
        notebookId="test-notebook"
        quotes={quotes}
      />
      {sentMessage && <div data-testid="sent-message">{sentMessage}</div>}
    </>
  );
}

describe("Selection to Chat Integration", () => {
  test("sends message with quotes prepended", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { addQuote } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote("This is a quote from the AI", "message", "msg-1", "AI Response");
      }, [addQuote]);
      return <TestChatComposer />;
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    // Quote should appear
    expect(screen.getAllByText(/This is a quote from the AI/)[0]).toBeInTheDocument();

    // Type a message
    const textarea = screen.getByPlaceholderText(/ask a question/i);
    await user.type(textarea, "Can you explain this further?");

    // Send the message
    const sendButton = screen.getByTitle(/send message/i);
    await user.click(sendButton);

    // Verify sent message contains both quote and user text
    const sentMessage = screen.getByTestId("sent-message");
    expect(sentMessage.textContent).toContain("This is a quote from the AI");
    expect(sentMessage.textContent).toContain("Can you explain this further?");
    expect(sentMessage.textContent).toContain("From AI Response");
  });

  test("multiple quotes from different sources", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { addQuote } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote("First quote from AI", "message", "msg-1", "AI Response");
        addQuote("Second quote from source", "source", "src-1", "Document 1");
      }, [addQuote]);
      return <TestChatComposer />;
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    // Both quotes should be present
    expect(screen.getAllByText(/First quote from AI/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Second quote from source/)[0]).toBeInTheDocument();

    // Send message
    const textarea = screen.getByPlaceholderText(/ask a question/i);
    await user.type(textarea, "Compare these");

    const sendButton = screen.getByTitle(/send message/i);
    await user.click(sendButton);

    const sentMessage = screen.getByTestId("sent-message");
    expect(sentMessage.textContent).toContain("First quote from AI");
    expect(sentMessage.textContent).toContain("Second quote from source");
    expect(sentMessage.textContent).toContain("From AI Response");
    expect(sentMessage.textContent).toContain("From Document 1");
  });

  test("quote is removed when clicking X", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { addQuote } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote("Quote to be removed", "message");
      }, [addQuote]);
      return <TestChatComposer />;
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    expect(screen.getAllByText(/Quote to be removed/)[0]).toBeInTheDocument();

    // Click remove button
    const removeButtons = screen.getAllByLabelText(/remove quote/i);
    await user.click(removeButtons[0]);

    expect(screen.queryAllByText(/Quote to be removed/).length).toBe(0);
  });

  test("clears quotes after sending message", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { addQuote } = useSelectionQuotes();
      React.useEffect(() => {
        addQuote("A quote", "message");
      }, [addQuote]);
      return <TestChatComposer />;
    }

    render(
      <SelectionQuoteProvider>
        <TestComponent />
      </SelectionQuoteProvider>
    );

    expect(screen.getAllByText(/A quote/)[0]).toBeInTheDocument();

    // Send message
    const textarea = screen.getByPlaceholderText(/ask a question/i);
    await user.type(textarea, "test");

    const sendButton = screen.getByTitle(/send message/i);
    await user.click(sendButton);

    // Quote should be cleared from input area (but may appear in sent message)
    const quoteBlocks = screen.queryByTestId("quote-blocks");
    expect(quoteBlocks?.textContent).not.toContain("A quote");
  });

  test("sends plain message without quotes when no quotes added", async () => {
    const user = userEvent.setup();

    render(
      <SelectionQuoteProvider>
        <TestChatComposer />
      </SelectionQuoteProvider>
    );

    // Type a message
    const textarea = screen.getByPlaceholderText(/ask a question/i);
    await user.type(textarea, "Just a regular message");

    // Send
    const sendButton = screen.getByTitle(/send message/i);
    await user.click(sendButton);

    const sentMessage = screen.getByTestId("sent-message");
    expect(sentMessage.textContent).toBe("Just a regular message");
  });
});
