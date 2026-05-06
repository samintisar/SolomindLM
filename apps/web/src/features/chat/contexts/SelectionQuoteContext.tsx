import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export interface QuoteBlock {
  id: string;
  text: string;
  sourceType: "message" | "source";
  sourceId?: string;
  sourceTitle?: string;
  timestamp: number;
}

interface SelectionQuoteContextType {
  quotes: QuoteBlock[];
  addQuote: (
    text: string,
    sourceType: "message" | "source",
    sourceId?: string,
    sourceTitle?: string
  ) => void;
  removeQuote: (id: string) => void;
  clearQuotes: () => void;
}

const SelectionQuoteContext = createContext<SelectionQuoteContextType | undefined>(undefined);

export function useSelectionQuotes() {
  const context = useContext(SelectionQuoteContext);
  if (!context) {
    throw new Error("useSelectionQuotes must be used within SelectionQuoteProvider");
  }
  return context;
}

interface SelectionQuoteProviderProps {
  children: React.ReactNode;
}

export const SelectionQuoteProvider: React.FC<SelectionQuoteProviderProps> = ({ children }) => {
  const [quotes, setQuotes] = useState<QuoteBlock[]>([]);

  const addQuote = useCallback(
    (text: string, sourceType: "message" | "source", sourceId?: string, sourceTitle?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setQuotes((prev) => {
        // Avoid duplicates
        const isDuplicate = prev.some(
          (q) => q.text === trimmed && q.sourceType === sourceType && q.sourceId === sourceId
        );
        if (isDuplicate) return prev;

        return [
          ...prev,
          {
            id: typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`,
            text: trimmed,
            sourceType,
            sourceId,
            sourceTitle,
            timestamp: Date.now(),
          },
        ];
      });
    },
    []
  );

  const removeQuote = useCallback((id: string) => {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const clearQuotes = useCallback(() => {
    setQuotes([]);
  }, []);

  return (
    <SelectionQuoteContext.Provider value={{ quotes, addQuote, removeQuote, clearQuotes }}>
      {children}
    </SelectionQuoteContext.Provider>
  );
};

interface TooltipState {
  visible: boolean;
  text: string;
  sourceType: "message" | "source" | null;
  sourceId?: string;
  sourceTitle?: string;
  x: number;
  y: number;
}

export function useSelectionTooltip() {
  const { addQuote } = useSelectionQuotes();
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    text: "",
    sourceType: null,
    x: 0,
    y: 0,
  });
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectionRef = useRef<string>("");

  const showTooltip = useCallback(
    (
      text: string,
      sourceType: "message" | "source",
      sourceId: string | undefined,
      sourceTitle: string | undefined,
      x: number,
      y: number
    ) => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      lastSelectionRef.current = text;
      setTooltip({ visible: true, text, sourceType, sourceId, sourceTitle, x, y });
    },
    []
  );

  const hideTooltip = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setTooltip((prev) => ({ ...prev, visible: false }));
    }, 150);
  }, []);

  const handleAddToChat = useCallback(() => {
    if (tooltip.text && tooltip.sourceType) {
      addQuote(tooltip.text, tooltip.sourceType, tooltip.sourceId, tooltip.sourceTitle);
      setTooltip((prev) => ({ ...prev, visible: false }));
      // Clear the browser selection
      window.getSelection()?.removeAllRanges();
    }
  }, [tooltip, addQuote]);

  useEffect(() => {
    const handleMouseUp = (_e: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideTooltip();
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length < 2) {
        hideTooltip();
        return;
      }

      // Check if selection is within a quotable container
      const range = selection.getRangeAt(0);
      let element: HTMLElement | null = range.commonAncestorContainer as HTMLElement;
      if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
      }

      const quotableContainer = element?.closest("[data-quotable]");
      if (!quotableContainer) {
        hideTooltip();
        return;
      }

      const sourceType = quotableContainer.getAttribute("data-quotable") as "message" | "source";
      const sourceId = quotableContainer.getAttribute("data-quotable-id") || undefined;
      const sourceTitle = quotableContainer.getAttribute("data-quotable-title") || undefined;

      const rect = range.getBoundingClientRect();
      const tooltipX = rect.left + rect.width / 2;
      const tooltipY = rect.top - 8;

      showTooltip(selectedText, sourceType, sourceId, sourceTitle, tooltipX, tooltipY);
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideTooltip();
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [showTooltip, hideTooltip]);

  return { tooltip, hideTooltip, handleAddToChat };
}
