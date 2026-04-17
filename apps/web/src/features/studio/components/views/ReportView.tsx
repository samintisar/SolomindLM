import React, { lazy, Suspense } from "react";
import { XCircle, ArrowLeft } from "lucide-react";
import { ReportNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

export interface ReportViewProps {
  note: ReportNote;
  onBack?: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ note, onBack }) => {
  const isFailed = note.status === "failed";

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-colors transition-transform text-foreground flex items-center justify-center shrink-0 touch-manipulation"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{note.title}</span>
        </div>
      )}
      {/* Error State */}
      {isFailed && (
        <div className="p-4 border-b border-border bg-destructive/10">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Report generation failed</p>
              <p className="text-xs text-destructive/70 mt-1">
                {typeof note.metadata?.error === "object"
                  ? (note.metadata.error as { message?: string }).message ||
                    "An unknown error occurred"
                  : note.metadata?.error || "An unknown error occurred"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-6 md:p-8 bg-card border-t border-border">
        <div className="max-w-3xl mx-auto">
          <div className="prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed select-text">
            {note.content ? (
              <Suspense
                fallback={<div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />}
              >
                <MarkdownRenderer
                  components={{
                    img: () => null,
                    a: ({ children }) => <span className="text-foreground">{children}</span>,
                    video: () => null,
                    audio: () => null,
                    iframe: () => null,
                    table: ({ children }) => (
                      <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
                        {children}
                      </table>
                    ),
                    thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                    th: ({ children }) => (
                      <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {sanitizeMarkdown(note.content)}
                </MarkdownRenderer>
              </Suspense>
            ) : isFailed ? (
              <div className="flex flex-col items-center justify-center py-12">
                <XCircle className="w-12 h-12 text-destructive mb-4" />
                <p className="text-muted-foreground">Report generation failed</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No content available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
