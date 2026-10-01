import { X } from "lucide-react";
import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { useSelectionQuotes } from "../contexts/SelectionQuoteContext";

export const QuoteBlocks: React.FC = () => {
  const { quotes, removeQuote } = useSelectionQuotes();

  if (quotes.length === 0) return null;

  return (
    <div className="w-full rounded-2xl bg-muted/25 px-2 py-2">
      <div className="flex w-full flex-wrap gap-2 pl-2 pt-2">
        {quotes.map((quote) => (
          <div key={quote.id} className="group relative w-36 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={() => removeQuote(quote.id)}
              className="absolute top-0 left-0 z-10 size-5 -translate-x-1/2 -translate-y-1/2"
              aria-label="Remove quote"
            >
              <X className="size-2.5" strokeWidth={2.5} />
            </Button>
            <Card variant="flush" className="w-full">
              <div className="flex items-start gap-1 px-1.5 py-2 text-xs leading-snug">
                <div className="my-0.5 w-px shrink-0 self-stretch bg-foreground/80" aria-hidden />
                <div className="ms-0.5 min-w-0 flex-1 overflow-hidden pt-0.5">
                  <p className="m-0 line-clamp-7 min-w-0 wrap-anywhere font-sans text-foreground">
                    {quote.text.trimEnd()}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};
