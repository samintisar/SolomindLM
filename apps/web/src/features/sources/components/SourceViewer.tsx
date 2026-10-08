import { BookOpenText, ChevronDown, FileText, FileType, Tags, XCircle } from "lucide-react";
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MarkdownRendererProps } from "@/shared/components/MarkdownRenderer.utils";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Spinner } from "@/shared/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { Source } from "@/shared/types";
import { sanitizeMarkdown } from "@/shared/utils";
import { extractYouTubeVideoId } from "@/shared/utils/youtubeEmbed";
import { useGenerateSourceGuide, useGetSignedUrl } from "../services/documentsApi";
import { isYouTubeSource } from "../utils/sourceTypes";
import { PdfViewer } from "./PdfViewer";
import { YouTubeEmbedUnavailable, YouTubeVideoPreview } from "./YouTubeVideoPreview";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

type MarkdownComponents = NonNullable<MarkdownRendererProps["components"]>;

/**
 * Overrides for the source body. Module scope keeps the map's identity stable: Streamdown's
 * blocks skip re-rendering only while each override is the same function as last render.
 */
const SOURCE_MARKDOWN_COMPONENTS: MarkdownComponents = {
  img: () => null,
  a: ({ children }) => <span className="text-foreground">{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }) => (
    <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-xl ring-1 ring-hairline">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-4 py-2 text-left font-semibold text-foreground border-b border-r border-border/60 last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 text-foreground border-b border-r border-border/60 last:border-r-0">
      {children}
    </td>
  ),
};

type PdfViewMode = "pdf" | "markdown";

function isPdfViewMode(value: string): value is PdfViewMode {
  return value === "pdf" || value === "markdown";
}

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
      .catch((error) => {
        console.error("Failed to load PDF URL:", error);
        setPdfUrl(null);
      })
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

  const youtubeVideoId = isYouTubeSource(source) ? extractYouTubeVideoId(source.url) : null;

  // DOMPurify over the whole document is the costliest step here; the panel re-renders on every
  // streamed chat token, so only re-sanitize when the content itself changes.
  const sanitizedContent = useMemo(
    () => sanitizeMarkdown(content || "No content available."),
    [content]
  );

  return (
    <div className="p-6 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Source Guide */}
      {source.sourceGuide ? (
        <Card variant="flush">
          <Collapsible open={sourceGuideExpanded} onOpenChange={setSourceGuideExpanded}>
            <h3 className="m-0">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="disclosure"
                  className="group/trigger w-full justify-between"
                  title={sourceGuideExpanded ? "Hide source guide" : "Show source guide"}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <BookOpenText className="text-primary" aria-hidden />
                    Source guide
                  </span>
                  <ChevronDown
                    className="text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/trigger:rotate-180"
                    aria-hidden
                  />
                </Button>
              </CollapsibleTrigger>
            </h3>

            <CollapsibleContent>
              <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
                <div data-testid="source-guide-summary">
                  <div className="prose max-w-none font-serif text-foreground">
                    <MarkdownRenderer>{source.sourceGuide.summary}</MarkdownRenderer>
                  </div>
                </div>

                {source.sourceGuide.topics.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 font-sans text-xs font-semibold uppercase text-muted-foreground">
                      <Tags className="size-3.5" aria-hidden />
                      Topics
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {source.sourceGuide.topics.map((topic, i) => (
                        <Button
                          key={i}
                          type="button"
                          variant="secondary"
                          size="chip"
                          aria-label={`Discuss ${topic}`}
                          onClick={() => onDiscussTopic?.(topic)}
                        >
                          {topic}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ) : generatingGuide ? (
        <div className="space-y-3">
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden />
            Generating source guide...
          </div>
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : guideError ? (
        <Alert variant="destructive">
          <AlertDescription>{guideError}</AlertDescription>
        </Alert>
      ) : null}

      {isYouTubeSource(source) ? (
        youtubeVideoId ? (
          <YouTubeVideoPreview key={youtubeVideoId} videoId={youtubeVideoId} title={source.title} />
        ) : (
          <YouTubeEmbedUnavailable url={source.url} />
        )
      ) : null}

      {/* Error State */}
      {source.status === "failed" && (
        <Alert variant="destructive">
          <XCircle aria-hidden />
          <AlertTitle>Failed to process document</AlertTitle>
          <AlertDescription>
            {source.failureReason ??
              "There was an error while processing this document. Please try uploading it again."}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div role="status" className="flex flex-col items-center gap-3">
            <Spinner className="size-6" aria-hidden />
            <p className="text-sm text-muted-foreground">Loading content...</p>
          </div>
        </div>
      )}

      {/* Error State for Content Loading */}
      {error && !isLoading && (
        <Alert variant="destructive">
          <XCircle aria-hidden />
          <AlertTitle>Failed to load content</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <p>
              The content will automatically reload when available. Please ensure you are logged in.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* PDF / Markdown view toggle (PDF sources only when pdfUrl is available) */}
      {canShowPdf && !isLoading && !error && (
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Source view"
          value={viewMode}
          onValueChange={(value) => {
            if (isPdfViewMode(value)) setViewMode(value);
          }}
        >
          <ToggleGroupItem value="markdown">
            <FileType aria-hidden />
            Markdown
          </ToggleGroupItem>
          <ToggleGroupItem value="pdf">
            <FileText aria-hidden />
            Original PDF
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {/* Content Display */}
      {!isLoading && !error && (
        <>
          {canShowPdf && viewMode === "pdf" ? (
            pdfUrlLoading ? (
              <div
                role="status"
                className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
              >
                <Spinner className="size-6" aria-hidden />
                Loading PDF…
              </div>
            ) : pdfUrl ? (
              <PdfViewer file={pdfUrl} />
            ) : (
              <Alert variant="destructive">
                <XCircle aria-hidden />
                <AlertDescription>Could not load PDF.</AlertDescription>
              </Alert>
            )
          ) : (
            <div className="prose max-w-none font-serif leading-relaxed text-foreground/90 select-text">
              <Suspense fallback={<Skeleton className="h-4 w-full" />}>
                <MarkdownRenderer components={SOURCE_MARKDOWN_COMPONENTS}>
                  {sanitizedContent}
                </MarkdownRenderer>
              </Suspense>
            </div>
          )}
        </>
      )}
    </div>
  );
};
