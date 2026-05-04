import React from "react";

import { getNotebookLucideIcon } from "@/shared/notebook/notebookLucideIcon";

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
  /** Tailwind bg class from notebook (e.g. bg-vintage-amber-300); used for icon tint. */
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
  const displaySuggestions = hasSources && suggestions?.length ? suggestions : STARTER_PROMPTS;
  const notebookGlyph = getNotebookLucideIcon(notebookIcon);
  const iconTintClass = notebookCoverColor?.length
    ? notebookCoverColor.replace("bg-", "text-")
    : "text-primary";
  const iconBgClass = notebookCoverColor?.length
    ? notebookCoverColor.replace("-300", "-50").replace("-400", "-50").replace("-600", "-100")
    : "bg-primary/10";
  const heading =
    notebookTitle?.trim() ||
    (hasSources ? "What would you like to know?" : "Ask anything about your sources");

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-10 px-6 py-8 select-none overscroll-y-contain pb-[calc(16rem+env(safe-area-inset-bottom,0px))]">
      {/* Header */}
      <div className="flex w-full max-w-xl flex-col items-center gap-5 text-center">
        {/* Icon */}
        <div
          className={`flex size-16 items-center justify-center rounded-2xl ${iconBgClass} ring-1 ring-border shadow-sm`}
          aria-hidden
        >
          {React.createElement(notebookGlyph, {
            className: `size-8 ${iconTintClass}`,
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
      <div className="flex w-full max-w-xl items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Try asking
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Suggestion chips */}
      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2.5">
        {isLoadingSuggestions ? (
          <>
            {[38, 52, 44, 48].map((w, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-xl border border-border bg-muted/70"
                style={{ width: `${w}%` }}
              />
            ))}
          </>
        ) : (
          displaySuggestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSendMessage(prompt)}
              className="inline-flex items-center rounded-xl border border-border bg-card px-4 py-2 font-serif text-sm leading-relaxed text-foreground shadow-sm transition-colors hover:bg-accent hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
            >
              {prompt}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
