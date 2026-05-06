import React, { useId, useState } from "react";
import { Loader2, Compass, ChevronUp, ChevronDown } from "lucide-react";
import { useSourceGuide } from "../hooks/useSourceGuide";

interface SourceGuideProps {
  documentId: string;
  onTopicClick: (topic: string) => void;
}

/** Render a source-guide summary: **bold** → <strong>, \n → <br />. No raw HTML. */
function SummaryText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="font-serif text-sm leading-relaxed text-foreground/95">
      {lines.map((line, lineIndex) => {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <React.Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {parts.map((part, partIndex) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return (
                  <strong key={partIndex} className="font-semibold text-foreground">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={partIndex}>{part}</span>;
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export const SourceGuide: React.FC<SourceGuideProps> = ({ documentId, onTopicClick }) => {
  const { summary, topics, isLoading } = useSourceGuide(documentId);
  const [isExpanded, setIsExpanded] = useState(true);
  const panelId = useId();
  const headingId = useId();

  if (!isLoading && !summary && !topics) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm ring-1 ring-border/40">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Compass
            className="size-5 shrink-0 text-primary"
            strokeWidth={2}
            aria-hidden
          />
          <div className="min-w-0">
            <p
              id={headingId}
              className="font-display text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              Source guide
            </p>
          </div>
        </div>
        <span
          className="flex shrink-0 items-center justify-center text-muted-foreground transition-colors group-hover:text-foreground"
          aria-hidden
        >
          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>

      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          className="space-y-4 border-t border-border/60 bg-muted/12 px-4 py-4 dark:bg-muted/8"
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
              <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Summarizing source…
              </p>
              <div className="w-full max-w-[18rem] space-y-2" aria-hidden>
                <div className="h-2.5 w-full animate-pulse rounded-sm bg-muted-foreground/15" />
                <div className="h-2.5 w-[88%] animate-pulse rounded-sm bg-muted-foreground/15" />
                <div className="h-2.5 w-[72%] animate-pulse rounded-sm bg-muted-foreground/15" />
              </div>
            </div>
          ) : (
            <>
              {summary && <SummaryText text={summary} />}
              {topics && topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic: string) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => onTopicClick(topic)}
                      title={topic}
                      className="max-w-[min(100%,16rem)] cursor-pointer truncate rounded-md border border-border/60 bg-background px-3 py-1.5 text-left text-xs font-medium text-foreground shadow-sm transition-[color,background-color,border-color,box-shadow] hover:border-primary/35 hover:bg-accent/40 hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
