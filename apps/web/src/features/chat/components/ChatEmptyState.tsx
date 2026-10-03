import React, { useMemo } from "react";

import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import { notebookIcon as resolveNotebookIcon } from "@/shared/notebook/notebookIcons";
import { cn } from "@/shared/utils/cn";

const STARTER_PROMPTS = [
  "Summarize the key concepts",
  "What are the main arguments?",
  "Quiz me on this material",
  "Explain the most important topic simply",
];

interface ChatEmptyStateProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  sourceCount?: number;
  sourceSummary?: string | null;
  suggestions?: string[] | null;
  isLoadingSuggestions?: boolean;
  /** Notebook customize modal icon key (e.g. Folder, Book). */
  notebookIcon?: string | null;
  /** Tailwind bg class from notebook (a COVER_COLORS swatch); used as the icon tile fill. */
  notebookCoverColor?: string | null;
  notebookTitle?: string;
}

export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({
  onSendMessage,
  disabled,
  sourceCount = 0,
  sourceSummary,
  suggestions,
  isLoadingSuggestions,
  notebookIcon,
  notebookCoverColor,
  notebookTitle,
}) => {
  const hasSources = sourceCount > 0;
  const displaySuggestions = useMemo(() => {
    const raw = hasSources && suggestions?.length ? suggestions : STARTER_PROMPTS;
    const seen = new Set<string>();
    return raw.filter((text) => {
      const trimmed = text.trim();
      if (!trimmed || seen.has(trimmed)) return false;
      seen.add(trimmed);
      return true;
    });
  }, [hasSources, suggestions]);
  const notebookGlyph = resolveNotebookIcon(notebookIcon);
  const iconBgClass = coverFillClass(notebookCoverColor);
  const heading =
    notebookTitle?.trim() ||
    (hasSources ? "What would you like to know?" : "Ask anything about your sources");

  return (
    <div className="box-border min-h-full w-full px-6 pt-6 pb-composer-safe sm:pt-10">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 sm:gap-10">
        {/* Header */}
        <div className="flex w-full flex-col items-center gap-5 text-center">
          {/* Icon */}
          <div
            className={cn(
              "flex size-16 items-center justify-center rounded-2xl shadow-sm ring-1 ring-border",
              iconBgClass
            )}
            aria-hidden
          >
            {React.createElement(notebookGlyph, {
              className: cn("size-8", COVER_ICON_CLASS),
              strokeWidth: 1.6,
            })}
          </div>

          {/* Heading */}
          <h2 className="font-serif text-pretty text-2xl font-semibold tracking-tight text-foreground sm:text-3xl sm:leading-tight">
            {heading}
          </h2>

          {/* Sub-copy */}
          {hasSources && sourceSummary ? (
            <p className="font-serif text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg max-w-sm">
              {sourceSummary}
            </p>
          ) : !hasSources ? (
            <p className="font-serif text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg max-w-sm">
              Upload documents or add URLs, then ask questions — I'll answer with citations.
            </p>
          ) : null}
        </div>

        {/* Divider */}
        <div className="flex w-full items-center gap-3">
          <Separator className="flex-1" />
          <span className="shrink-0 font-sans text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Try asking
          </span>
          <Separator className="flex-1" />
        </div>

        {/* Suggestion chips */}
        <div className="flex w-full flex-wrap justify-center gap-2.5">
          {isLoadingSuggestions ? (
            <>
              <Skeleton className="h-10 w-2/5" />
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-10 w-5/12" />
              <Skeleton className="h-10 w-1/2" />
            </>
          ) : (
            displaySuggestions.map((prompt, index) => (
              <Button
                key={`suggestion-${index}`}
                type="button"
                variant="outline"
                size="chip"
                disabled={disabled}
                onClick={() => onSendMessage(prompt)}
              >
                {prompt}
              </Button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
