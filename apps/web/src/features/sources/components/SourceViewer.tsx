import React, { lazy, Suspense, useState, useEffect } from "react";
import { CheckSquare, Square, XCircle, Loader2, FileText, FileType } from "lucide-react";
import { Source } from "@/shared/types";
import { sanitizeMarkdown } from "@/shared/utils";
import { useGetSignedUrl } from "../services/documentsApi";
import { PdfViewer } from "./PdfViewer";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

type PdfViewMode = "pdf" | "markdown";

interface SourceViewerProps {
  source: Source;
  onToggle: (id: string) => void;
  content: string | undefined;
  /** Storage ID for the PDF file; when set, enables PDF/Markdown toggle. URL is fetched only when user switches to PDF tab. */
  pdfStorageId?: string | null;
  isLoading: boolean;
  error: string | undefined;
  /** Wiki (and similar) viewers are not chat sources — hide the include/exclude control. */
  hideInclusionToggle?: boolean;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
  source,
  onToggle,
  content,
  pdfStorageId,
  isLoading,
  error,
  hideInclusionToggle,
}) => {
  const isPdfSource = source.type === "PDF";
  const canShowPdf = isPdfSource && pdfStorageId;
  const [viewMode, setViewMode] = useState<PdfViewMode>("markdown");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfUrlLoading, setPdfUrlLoading] = useState(false);
  const getSignedUrl = useGetSignedUrl();

  // Fetch PDF signed URL only when user switches to Original PDF tab (avoids loading PDF until needed)
  useEffect(() => {
    if (viewMode !== "pdf" || !pdfStorageId) {
      if (viewMode !== "pdf") setPdfUrl(null);
      return;
    }
    if (pdfUrl) return; // already have URL
    setPdfUrlLoading(true);
    getSignedUrl({ storageId: pdfStorageId })
      .then((url) => {
        setPdfUrl(url ?? null);
      })
      .catch(() => setPdfUrl(null))
      .finally(() => setPdfUrlLoading(false));
  }, [viewMode, pdfStorageId, getSignedUrl, pdfUrl]);

  return (
    <div className="p-6 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono bg-sidebar-accent/50 px-2 py-1 rounded-sm">
          {hideInclusionToggle ? `Wiki • ${source.type}` : `${source.type} • ${source.date}`}
        </span>

        {hideInclusionToggle ? (
          <span className="text-xs text-muted-foreground">Notebook wiki</span>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(source.id)}
            className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer select-none"
            aria-pressed={source.selected}
            aria-label={
              source.selected ? "Included (click to exclude)" : "Excluded (click to include)"
            }
          >
            {source.selected ? (
              <CheckSquare className="w-4 h-4 shrink-0" aria-hidden />
            ) : (
              <Square className="w-4 h-4 shrink-0 opacity-60" aria-hidden />
            )}
            <span>Included</span>
          </button>
        )}
      </div>

      {/* Error State */}
      {source.status === "failed" && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive">Failed to process document</p>
          </div>
          <p className="text-xs text-destructive/80">
            There was an error while processing this document. Please try uploading it again.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading content...</p>
          </div>
        </div>
      )}

      {/* Error State for Content Loading */}
      {error && !isLoading && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive">Failed to load content</p>
          </div>
          <p className="text-xs text-destructive/80">{error}</p>
          <p className="text-xs text-muted-foreground">
            The content will automatically reload when available. Please ensure you are logged in.
          </p>
        </div>
      )}

      {/* PDF / Markdown view toggle (PDF sources only when pdfUrl is available) */}
      {canShowPdf && !isLoading && !error && (
        <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setViewMode("markdown")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              viewMode === "markdown"
                ? "border-border bg-card dark:bg-secondary text-foreground shadow-sm"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={viewMode === "markdown"}
          >
            <FileType className="h-4 w-4" />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => setViewMode("pdf")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              viewMode === "pdf"
                ? "border-border bg-card dark:bg-secondary text-foreground shadow-sm"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={viewMode === "pdf"}
          >
            <FileText className="h-4 w-4" />
            Original PDF
          </button>
        </div>
      )}

      {/* Content Display */}
      {!isLoading && !error && (
        <>
          {canShowPdf && viewMode === "pdf" ? (
            pdfUrlLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading PDF…</span>
              </div>
            ) : pdfUrl ? (
              <PdfViewer file={pdfUrl} />
            ) : (
              <p className="text-sm text-destructive">Could not load PDF.</p>
            )
          ) : (
            <div className="prose prose-sm prose-stone dark:prose-invert max-w-none font-serif leading-relaxed text-foreground/90 select-text">
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
                  {sanitizeMarkdown(content || "No content available.")}
                </MarkdownRenderer>
              </Suspense>
            </div>
          )}
        </>
      )}
    </div>
  );
};
