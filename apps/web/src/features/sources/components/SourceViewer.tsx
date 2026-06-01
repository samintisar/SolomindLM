import {
  BookOpenText,
  ChevronDown,
  FileText,
  FileType,
  Loader2,
  Tags,
  XCircle,
} from "lucide-react";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Source } from "@/shared/types";
import { sanitizeMarkdown } from "@/shared/utils";
import { cn } from "@/shared/utils/cn";
import { useGenerateSourceGuide, useGetSignedUrl } from "../services/documentsApi";
import { PdfViewer } from "./PdfViewer";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

type PdfViewMode = "pdf" | "markdown";

interface SourceViewerProps {
  source: Source;
  content: string | undefined;
  /** Storage ID for the PDF file; when set, enables PDF/Markdown toggle. URL is fetched only when user switches to PDF tab. */
  pdfStorageId?: string | null;
  isLoading: boolean;
  error: string | undefined;
  onDiscussTopic?: (topic: string) => void;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
  source,
  content,
  pdfStorageId,
  isLoading,
  error,
  onDiscussTopic,
}) => {
  const isPdfSource = source.type === "PDF";
  const canShowPdf = isPdfSource && pdfStorageId;
  const [viewMode, setViewMode] = useState<PdfViewMode>("markdown");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfUrlLoading, setPdfUrlLoading] = useState(false);
  const [generatingGuide, setGeneratingGuide] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [sourceGuideExpanded, setSourceGuideExpanded] = useState(true);
  const hasGeneratedRef = useRef(false);
  const getSignedUrl = useGetSignedUrl();
  const generateSourceGuide = useGenerateSourceGuide();

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

  // Reset generation state when switching documents
  useEffect(() => {
    hasGeneratedRef.current = false;
    setGeneratingGuide(false);
    setGuideError(null);
    setSourceGuideExpanded(true);
  }, [source.id]);

  // Auto-generate source guide on first open if not present
  useEffect(() => {
    if (
      source.status === "completed" &&
      !source.sourceGuide &&
      !generatingGuide &&
      !guideError &&
      !hasGeneratedRef.current
    ) {
      hasGeneratedRef.current = true;
      setGeneratingGuide(true);
      generateSourceGuide(source.id)
        .catch((err) => {
          setGuideError(err instanceof Error ? err.message : "Failed to generate source guide");
        })
        .finally(() => {
          setGeneratingGuide(false);
        });
    }
  }, [
    source.id,
    source.status,
    source.sourceGuide,
    generatingGuide,
    guideError,
    generateSourceGuide,
  ]);

  return (
    <div className="p-6 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Source Guide */}
      {source.sourceGuide ? (
        <section
          aria-labelledby={`source-guide-${source.id}`}
          className="overflow-hidden rounded-2xl border border-border/60 bg-card text-card-foreground shadow-sm ring-1 ring-border/30"
        >
          <h3 id={`source-guide-${source.id}`} className="m-0">
            <button
              type="button"
              className={cn(
                "group flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors",
                "hover:bg-muted/40 active:bg-muted/55",
                "focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                sourceGuideExpanded && "border-b border-border/50"
              )}
              aria-expanded={sourceGuideExpanded}
              aria-controls={`source-guide-panel-${source.id}`}
              title={sourceGuideExpanded ? "Hide source guide" : "Show source guide"}
              onClick={() => setSourceGuideExpanded((open) => !open)}
            >
              <BookOpenText
                className="size-5.5 shrink-0 text-primary/75 transition-colors group-hover:text-primary"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-serif text-[0.9375rem] font-semibold leading-tight tracking-tight text-foreground sm:text-base">
                Source guide
              </span>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground transition-all",
                  "group-hover:border-border group-hover:bg-muted/60 group-hover:text-foreground"
                )}
                aria-hidden
              >
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-200 ease-out",
                    sourceGuideExpanded && "rotate-180"
                  )}
                />
              </span>
            </button>
          </h3>

          {sourceGuideExpanded && (
            <div
              id={`source-guide-panel-${source.id}`}
              className="flex animate-in fade-in slide-in-from-top-1 flex-col gap-4 px-4 pb-4 pt-1 duration-200"
              role="region"
              aria-labelledby={`source-guide-${source.id}`}
            >
              <div data-testid="source-guide-summary">
                <div className="prose prose-sm prose-stone dark:prose-invert prose-p:my-0 prose-p:text-[0.9375rem] prose-p:leading-relaxed prose-p:text-foreground/88 prose-strong:font-semibold prose-strong:text-foreground max-w-none font-serif">
                  <MarkdownRenderer>{source.sourceGuide.summary}</MarkdownRenderer>
                </div>
              </div>

              {source.sourceGuide.topics.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    <Tags className="h-3.5 w-3.5" aria-hidden />
                    Topics
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {source.sourceGuide.topics.map((topic, i) => (
                      <button
                        key={i}
                        type="button"
                        className="inline-flex items-center rounded-full border border-border/60 bg-secondary/45 px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:border-border hover:bg-secondary/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Discuss ${topic}`}
                        onClick={() => onDiscussTopic?.(topic)}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      ) : generatingGuide ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generating source guide...</span>
          </div>
        </div>
      ) : guideError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-xs text-destructive">{guideError}</p>
        </div>
      ) : null}

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
