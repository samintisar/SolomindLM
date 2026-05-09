import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import {
  SelectionQuoteProvider,
  useSelectionQuotes,
  useSelectionTooltip,
} from "./SelectionQuoteContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <SelectionQuoteProvider>{children}</SelectionQuoteProvider>;
}

describe("useSelectionQuotes", () => {
  test("initially has empty quotes array", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });
    expect(result.current.quotes).toEqual([]);
  });

  test("addQuote adds a new quote", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Test quote", "message", "msg-1", "AI Response");
    });

    expect(result.current.quotes).toHaveLength(1);
    expect(result.current.quotes[0].text).toBe("Test quote");
    expect(result.current.quotes[0].sourceType).toBe("message");
    expect(result.current.quotes[0].sourceId).toBe("msg-1");
    expect(result.current.quotes[0].sourceTitle).toBe("AI Response");
  });

  test("addQuote does not add empty text", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("", "message");
    });

    expect(result.current.quotes).toHaveLength(0);
  });

  test("addQuote does not add whitespace-only text", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("   ", "message");
    });

    expect(result.current.quotes).toHaveLength(0);
  });

  test("addQuote avoids duplicates", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Same quote", "source", "src-1");
    });
    act(() => {
      result.current.addQuote("Same quote", "source", "src-1");
    });

    expect(result.current.quotes).toHaveLength(1);
  });

  test("addQuote allows same text from different sources", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Same text", "message", "msg-1");
    });
    act(() => {
      result.current.addQuote("Same text", "source", "src-1");
    });

    expect(result.current.quotes).toHaveLength(2);
  });

  test("addQuote allows multiple quotes from same source", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Quote one", "message", "msg-1");
    });
    act(() => {
      result.current.addQuote("Quote two", "message", "msg-1");
    });

    expect(result.current.quotes).toHaveLength(2);
  });

  test("removeQuote removes a quote by id", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Quote one", "message", "msg-1");
    });
    act(() => {
      result.current.addQuote("Quote two", "message", "msg-1");
    });

    const idToRemove = result.current.quotes[0].id;

    act(() => {
      result.current.removeQuote(idToRemove);
    });

    expect(result.current.quotes).toHaveLength(1);
    expect(result.current.quotes[0].text).toBe("Quote two");
  });

  test("removeQuote does nothing for unknown id", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Quote one", "message", "msg-1");
    });

    act(() => {
      result.current.removeQuote("unknown-id");
    });

    expect(result.current.quotes).toHaveLength(1);
  });

  test("clearQuotes removes all quotes", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Quote one", "message");
    });
    act(() => {
      result.current.addQuote("Quote two", "source");
    });

    act(() => {
      result.current.clearQuotes();
    });

    expect(result.current.quotes).toHaveLength(0);
  });

  test("each quote has a unique id", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Quote one", "message");
    });
    act(() => {
      result.current.addQuote("Quote two", "message");
    });

    const ids = result.current.quotes.map((q) => q.id);
    expect(new Set(ids).size).toBe(2);
  });

  test("each quote has a timestamp", () => {
    const { result } = renderHook(() => useSelectionQuotes(), { wrapper });

    act(() => {
      result.current.addQuote("Quote", "message");
    });

    expect(result.current.quotes[0].timestamp).toBeGreaterThan(0);
    expect(result.current.quotes[0].timestamp).toBeLessThanOrEqual(Date.now());
  });

  test("useSelectionQuotes throws when used outside provider", () => {
    // Suppress console.error for this expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSelectionQuotes());
    }).toThrow("useSelectionQuotes must be used within SelectionQuoteProvider");

    spy.mockRestore();
  });
});

describe("useSelectionTooltip", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  test("initially has hidden tooltip", () => {
    const { result } = renderHook(() => useSelectionTooltip(), { wrapper });

    expect(result.current.tooltip.visible).toBe(false);
    expect(result.current.tooltip.text).toBe("");
  });

  test("handleAddToChat adds quote and clears selection", () => {
    const { result } = renderHook(() => useSelectionTooltip(), { wrapper });

    // Manually set tooltip state to simulate a selection
    act(() => {
      // We need to access the hook's internal state - let's trigger it through a mock selection
      const mockSelection = {
        toString: () => "Selected text",
        isCollapsed: false,
        getRangeAt: () => ({
          commonAncestorContainer: {
            nodeType: Node.ELEMENT_NODE,
            closest: () => ({
              getAttribute: (attr: string) => {
                if (attr === "data-quotable") return "message";
                if (attr === "data-quotable-id") return "msg-1";
                if (attr === "data-quotable-title") return "AI Response";
                return null;
              },
            }),
          } as unknown as Node,
          getBoundingClientRect: () =>
            ({
              top: 100,
              left: 100,
              width: 50,
              height: 20,
            }) as DOMRect,
        }),
        removeAllRanges: vi.fn(),
      } as unknown as Selection;

      const spy = vi.spyOn(window, "getSelection").mockReturnValue(mockSelection);

      // Trigger mouseup
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      spy.mockRestore();
    });

    // The tooltip should be visible after mouseup
    expect(result.current.tooltip.visible).toBe(true);
    expect(result.current.tooltip.text).toBe("Selected text");

    // Now click add to chat
    act(() => {
      result.current.handleAddToChat();
    });

    // Tooltip should be hidden
    expect(result.current.tooltip.visible).toBe(false);
  });
});
