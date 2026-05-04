import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js worker for Vite (unpkg has every pdfjs-dist version)
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

// Module-level constant computed once at load time.
const BASE_PAGE_WIDTH = Math.min(420, typeof window !== "undefined" ? window.innerWidth - 80 : 420);
/** 100% = minimum (readable baseline); 200% = max for detail */
const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
/** A4 aspect ratio (height/width) so placeholder height matches real page; gap is on container */
const PAGE_ASPECT = 297 / 210;

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
  return (
    <div className="flex justify-center">
      <Page
        pageNumber={pageNumber}
        width={pageWidth}
        renderTextLayer={true}
        renderAnnotationLayer={true}
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
  }, [file]);

  // Observe page slots and only mark as visible when in viewport (reduces lag by rendering fewer pages)
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
      { root: container, rootMargin: "200px", threshold: 0 }
    );

    const refs = pageRefs.current;
    refs.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  if (error) {
    return (
      <div className={`rounded-lg border border-border bg-muted/30 p-4 ${className}`}>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <Document
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
          <>
            <div className="mb-3 flex items-center gap-3">
              <label
                htmlFor="pdf-zoom"
                className="text-xs font-medium text-muted-foreground whitespace-nowrap"
              >
                Zoom
              </label>
              <input
                id="pdf-zoom"
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="pdf-zoom-range flex-1 cursor-pointer"
                aria-label="PDF zoom"
              />
              <span className="min-w-10 text-right text-xs text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>
            <div
              ref={containerRef}
              className="flex flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-muted/20 py-2"
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
          </>
        )}
      </Document>
    </div>
  );
};
