import { ChevronLeft, ChevronRight, Loader2, Minus, PanelLeft, Plus } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Document, Outline, Page, pdfjs } from "react-pdf";
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
  const [pageInput, setPageInput] = useState("1");
  const [showOutline, setShowOutline] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageInputEditingRef = useRef(false);
  /** Programmatic scroll in progress — do not sync page field from observer (it flickers mid-scroll). */
  const scrollTargetPageRef = useRef<number | null>(null);
  const scrollTargetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setNumPages(0);
    setLoading(true);
    setError(null);
    setVisiblePages(new Set([1]));
    setCurrentPage(1);
    setPageInput("1");
    setShowOutline(false);
    scrollTargetPageRef.current = null;
    if (scrollTargetTimeoutRef.current !== null) {
      clearTimeout(scrollTargetTimeoutRef.current);
      scrollTargetTimeoutRef.current = null;
    }
  }, [file]);

  /** Page whose area interacts most with the scrollport — avoids stale IntersectionObserver ratio maps (wrong page index). */
  const updatePageFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || numPages < 1) return;
    const cRect = container.getBoundingClientRect();
    let best = 1;
    let bestVisible = -1;
    for (let i = 1; i <= numPages; i++) {
      const el = pageRefs.current.get(i);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const visible = Math.min(r.bottom, cRect.bottom) - Math.max(r.top, cRect.top);
      if (visible > bestVisible + 0.5) {
        bestVisible = visible;
        best = i;
      }
    }
    setCurrentPage((p) => (p === best ? p : best));
  }, [numPages]);

  useEffect(() => {
    if (pageInputEditingRef.current) return;
    if (scrollTargetPageRef.current !== null) return;
    setPageInput(String(currentPage));
  }, [currentPage]);

  const finishProgrammaticScroll = useCallback(() => {
    const target = scrollTargetPageRef.current;
    if (target === null) return;
    scrollTargetPageRef.current = null;
    if (scrollTargetTimeoutRef.current !== null) {
      clearTimeout(scrollTargetTimeoutRef.current);
      scrollTargetTimeoutRef.current = null;
    }
    setPageInput(String(target));
    requestAnimationFrame(() => {
      updatePageFromScroll();
    });
  }, [updatePageFromScroll]);

  useEffect(() => {
    return () => {
      if (scrollTargetTimeoutRef.current !== null) {
        clearTimeout(scrollTargetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || numPages === 0) return;
    el.addEventListener("scrollend", finishProgrammaticScroll, { passive: true });
    return () => el.removeEventListener("scrollend", finishProgrammaticScroll);
  }, [numPages, finishProgrammaticScroll]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || numPages === 0) return;
    let raf = 0;
    const schedule = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (scrollTargetPageRef.current !== null) return;
        updatePageFromScroll();
      });
    };
    el.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      el.removeEventListener("scroll", schedule);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [numPages, updatePageFromScroll]);

  useEffect(() => {
    if (numPages === 0) return;
    const id = requestAnimationFrame(() => {
      updatePageFromScroll();
    });
    return () => cancelAnimationFrame(id);
  }, [zoom, numPages, updatePageFromScroll]);

  // Observe page slots and only mark as visible when in viewport (reduces lag by rendering fewer pages).
  // Do not derive currentPage here — ratio map only updates a subset of pages per callback, so "best ratio" is often wrong.
  useEffect(() => {
    if (numPages === 0) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const pageNum = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(pageNum);
            else next.delete(pageNum);
          }
          return next;
        });
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

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.max(1, Math.min(numPages, page));
      const el = pageRefs.current.get(target);
      if (el) {
        scrollTargetPageRef.current = target;
        if (scrollTargetTimeoutRef.current !== null) {
          clearTimeout(scrollTargetTimeoutRef.current);
        }
        // scrollend is not available in all browsers; unblock input sync shortly after jump.
        scrollTargetTimeoutRef.current = setTimeout(finishProgrammaticScroll, 120);
        // "auto" avoids long smooth-scroll windows where intersection ratios flicker (e.g. shows 22 while jumping to 25).
        el.scrollIntoView({ behavior: "auto", block: "start" });
      }
    },
    [finishProgrammaticScroll, numPages]
  );

  const handleOutlineItemClick = useCallback(
    ({ pageNumber }: { pageNumber?: number }) => {
      if (!pageNumber) return;
      goToPage(pageNumber);
      setShowOutline(false);
    },
    [goToPage]
  );

  const commitPageInput = useCallback(() => {
    if (numPages < 1) return;
    const raw = pageInput.trim();
    const parsed = raw === "" ? currentPage : Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const clamped = Math.max(1, Math.min(numPages, parsed));
    goToPage(clamped);
    setPageInput(String(clamped));
  }, [currentPage, goToPage, numPages, pageInput]);

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
                <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="Go to page"
                    title="Type a page number and press Enter"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                    onFocus={() => {
                      pageInputEditingRef.current = true;
                    }}
                    onBlur={() => {
                      pageInputEditingRef.current = false;
                      commitPageInput();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className={cn(
                      "h-7 w-11 shrink-0 select-text rounded-md border border-border bg-background px-1 text-center text-xs font-medium tabular-nums text-foreground",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    )}
                  />
                  <span className="select-none" aria-hidden>
                    /
                  </span>
                  <span className="min-w-[2ch] select-none text-center">{numPages}</span>
                </div>
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
