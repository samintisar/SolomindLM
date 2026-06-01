import { X } from "lucide-react";
import React from "react";
import { useSelectionQuotes } from "../contexts/SelectionQuoteContext";

export const QuoteBlocks: React.FC = () => {
  const { quotes, removeQuote } = useSelectionQuotes();

  if (quotes.length === 0) return null;

  return (
    <div className="w-full rounded-2xl bg-muted/25 px-2 py-2 dark:bg-muted/15">
      <div className="flex w-full flex-wrap gap-2 pl-2 pt-2">
        {quotes.map((quote) => (
          <div
            key={quote.id}
            className="group relative box-border flex w-36 shrink-0 flex-row items-start gap-1 overflow-visible rounded-none border border-border bg-background px-1.5 py-2 text-[11px] leading-snug dark:border-border dark:bg-card"
          >
            <button
              type="button"
              onClick={() => removeQuote(quote.id)}
              className="absolute left-0 top-0 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-[color,background-color,box-shadow] hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Remove quote"
            >
              <X className="h-2.5 w-2.5 stroke-[2.5]" />
            </button>
            <div
              className="my-0.5 w-px shrink-0 self-stretch rounded-none bg-foreground/80 dark:bg-foreground/70"
              aria-hidden
            />
            <div className="ms-0.5 min-w-0 flex-1 overflow-hidden pt-0.5">
              <p className="m-0 line-clamp-7 min-w-0 wrap-anywhere font-sans text-foreground">
                {quote.text.trimEnd()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
