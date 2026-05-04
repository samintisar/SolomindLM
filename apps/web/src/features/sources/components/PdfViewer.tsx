import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs, Outline } from "react-pdf";
import { Loader2, PanelLeft, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Serve worker locally (copied to public/ by Vite plugin) — avoids unpkg CDN round-trip
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

// Module-level constant computed once at load time.
// Reduced from 420 to 360 to lower canvas pixel count and improve render perf.
const BASE_PAGE_WIDTH = Math.min(360, typeof window !== "undefined" ? window.innerWidth - 80 : 360);
/** 50% = minimum; 200% = max for detail */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
/** A4 aspect ratio (height/width) so placeholder height matches real page; gap is on container */
const PAGE_ASPECT = 297 / 210;
/** Cap device pixel ratio to avoid oversizing canvases on retina screens (e.g. 3x mobile) */
const DPR_CAP = 2;

interface VirtualizedPageProps {
  pageNumber: number;
  pageWidth: number;
  isVisible: boolean;
}

function VirtualizedPage({ pageNumber, pageWidth, isVisible }: VirtualizedPageProps) {
  const placeholderHeight = pageWidth * PAGE_ASPECT;
  if (!isVisible) {
    return <div style={{ height: placeholderHeight, minHeight: placeholderHeight }} aria-hidden />;
  }

  // Cap effective DPR so we don't render enormous canvases on high-DPI screens.
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio, DPR_CAP) : 1;
  const scale = (pageWidth / BASE_PAGE_WIDTH) * dpr;

  return (
    <div className="flex justify-center">
      <Page
        pageNumber={pageNumber}
        scale={scale}
        renderTextLayer={true}
        renderAnnotationLayer={false}
      />
    </div>
  );
}

interface PdfViewerProps {
  /** URL of the PDF (signed URL from Convex storage or blob URL) */
  file: string;
  className?: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ file, className = "" }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [currentPage, setCurrentPage] = useState(1);
  const [showOutline, setShowOutline] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageWidth = BASE_PAGE_WIDTH * zoom;

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    setError(err?.message ?? "Failed to load PDF");
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNumPages(0);
    setLoading(true);
    setError(null);
    setVisiblePages(new Set([1]));
    setCurrentPage(1);
    setShowOutline(false);
  }, [file]);

  // Observe page slots and only mark as visible when in viewport (reduces lag by rendering fewer pages)
  // Also track the most-visible page for the page counter.
  // Reduced rootMargin from 200px to 50px so fewer off-screen pages are eagerly rendered.
  useEffect(() => {
    if (numPages === 0) return;
    const container = containerRef.current;
    if (!container) return;

    const intersectionRatios = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const pageNum = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(pageNum);
            else next.delete(pageNum);
            intersectionRatios.set(pageNum, e.intersectionRatio);
          }
          return next;
        });

        // Determine the page with the highest intersection ratio
        let bestPage = 1;
        let bestRatio = 0;
        for (const [pageNum, ratio] of intersectionRatios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = pageNum;
          }
        }
        if (bestRatio > 0) {
          setCurrentPage(bestPage);
        }
      },
      { root: container, rootMargin: "50px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    const refs = pageRefs.current;
    refs.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10));
  }, []);

  const handleOutlineItemClick = useCallback(({ pageNumber }: { pageNumber?: number }) => {
    if (!pageNumber || !containerRef.current) return;
    const el = pageRefs.current.get(pageNumber);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setShowOutline(false);
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.max(1, Math.min(numPages, page));
      const el = pageRefs.current.get(target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [numPages]
  );

  if (error) {
    return (
      <div className={cn("rounded-lg border border-border bg-muted/30 p-4", className)}>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <Document
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        {!loading && numPages > 0 && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOutline((s) => !s)}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                    showOutline
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                  aria-label="Toggle outline"
                  title="Toggle outline"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[3.5rem] select-none text-center text-xs tabular-nums text-muted-foreground">
                  {currentPage} / {numPages}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= numPages}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= ZOOM_MIN}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  aria-label="Zoom out"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[3rem] select-none text-center text-xs tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= ZOOM_MAX}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  aria-label="Zoom in"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="relative z-0 flex min-h-0 flex-1 gap-4">
              {/* Outline sidebar */}
              {showOutline && (
                <aside
                  className={cn(
                    "sticky top-0 z-10 w-[min(18rem,calc(100vw-3rem))] shrink-0",
                    "max-h-[min(85dvh,42rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]",
                    "rounded-xl border border-border bg-card/80 px-3 py-3 shadow-sm backdrop-blur-sm",
                    "font-sans text-sm text-foreground",
                    "[&_.react-pdf__Outline]:m-0 [&_.react-pdf__Outline]:text-inherit",
                    "[&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0",
                    "[&_ul>li+li]:mt-1",
                    "[&_ul_ul]:mt-2 [&_ul_ul]:space-y-1 [&_ul_ul]:border-l-2 [&_ul_ul]:border-border/50 [&_ul_ul]:pl-3 [&_ul_ul]:ml-1",
                    "[&_a]:block [&_a]:wrap-break-word [&_a]:rounded-md [&_a]:px-2.5 [&_a]:py-2 [&_a]:leading-snug",
                    "[&_a]:text-foreground/90 [&_a]:no-underline [&_a]:transition-colors",
                    "[&_a:hover]:bg-muted/80 [&_a:active]:bg-muted",
                    "[&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-ring [&_a:focus-visible]:ring-offset-2 [&_a:focus-visible]:ring-offset-background"
                  )}
                  aria-label="Document outline"
                >
                  <h3 className="mb-3 border-b border-border/60 pb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Contents
                  </h3>
                  <Outline onItemClick={handleOutlineItemClick} className="react-pdf__Outline" />
                </aside>
              )}

              {/* Page container */}
              <div
                ref={containerRef}
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/20 py-2 [scrollbar-gutter:stable]"
              >
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                  <div
                    key={pageNum}
                    ref={(el) => {
                      if (el) pageRefs.current.set(pageNum, el);
                      else pageRefs.current.delete(pageNum);
                    }}
                    data-page={pageNum}
                  >
                    <VirtualizedPage
                      pageNumber={pageNum}
                      pageWidth={pageWidth}
                      isVisible={visiblePages.has(pageNum)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Document>
    </div>
  );
};
