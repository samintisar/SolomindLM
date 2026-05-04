import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Download,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { InfographicNote } from "@/shared/types/index";

export interface InfographicViewProps {
  note: InfographicNote;
  onNoteUpdate?: (note: InfographicNote) => void;
  onBack?: () => void;
}

export const InfographicView: React.FC<InfographicViewProps> = ({
  note,
  onNoteUpdate: _onNoteUpdate,
  onBack,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleDownload = useCallback(() => {
    if (note.imageUrl) {
      const link = document.createElement("a");
      link.href = note.imageUrl;
      link.download = `${note.title || "infographic"}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [note.imageUrl, note.title]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom > 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && zoom > 1) {
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.max(0.5, Math.min(3, prev + delta)));
    },
    []
  );

  // Loading state
  if (note.status === "generating" || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-muted-foreground font-serif italic">Generating your infographic...</p>
        {note.metadata?.currentStep && (
          <p className="text-xs text-muted-foreground">{note.metadata.currentStep}</p>
        )}
      </div>
    );
  }

  // Error state
  if (note.status === "failed" || imageError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <p className="text-lg font-semibold text-foreground mb-2">Infographic Unavailable</p>
        <p className="text-sm text-muted-foreground">
          {note.metadata?.error || "The image could not be loaded"}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-xl text-sm font-medium transition-colors"
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-background ${isFullscreen ? "fixed inset-0 z-50" : ""}`}
    >
      {/* Mobile Back Button */}
      {onBack && !isFullscreen && (
        <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{note.title}</span>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col items-center justify-center ${isFullscreen ? "p-2" : "p-4 md:p-8"}`}>
        {/* Image Container */}
        <div
          className={`relative bg-black overflow-hidden shadow-2xl ${
            isFullscreen ? "h-full max-h-full" : "max-w-5xl w-full rounded-xl"
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        >
          {note.imageUrl && !imageError ? (
            <img
              ref={imageRef}
              src={note.imageUrl}
              alt={note.title || "Infographic"}
              className="w-full h-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              }}
              onError={() => setImageError(true)}
              onLoad={() => setIsLoading(false)}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center aspect-video">
              <div className="text-center p-8">
                <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading infographic...</p>
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        {!isFullscreen && note.title && (
          <h2 className="mt-6 text-xl md:text-2xl font-bold text-center font-serif text-foreground">
            {note.title}
          </h2>
        )}
      </div>

      {/* Controls */}
      <div
        className={`shrink-0 border-t border-border bg-background/80 backdrop-blur-md z-10 ${
          isFullscreen ? "p-2" : "p-4 md:px-8 md:py-6"
        }`}
      >
        <div
          className={`mx-auto w-full flex items-center justify-between ${
            isFullscreen ? "" : "max-w-5xl"
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="rounded-xl bg-secondary hover:bg-secondary/80 disabled:opacity-30 disabled:hover:bg-secondary transition-all p-3"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-sm font-mono text-muted-foreground min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              className="rounded-xl bg-secondary hover:bg-secondary/80 disabled:opacity-30 disabled:hover:bg-secondary transition-all p-3"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="rounded-xl bg-secondary hover:bg-secondary/80 transition-all p-3 text-xs font-medium"
              aria-label="Reset zoom"
            >
              Reset
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!note.imageUrl}
              className="rounded-xl bg-secondary hover:bg-secondary/80 disabled:opacity-30 disabled:hover:bg-secondary transition-all p-3"
              aria-label="Download infographic"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="rounded-xl bg-secondary hover:bg-secondary/80 transition-all p-3"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Keyboard Hints */}
        {!isFullscreen && (
          <div className="text-center mt-2">
            <p className="text-xs text-muted-foreground">
              Scroll to zoom • Drag to pan when zoomed • F for fullscreen
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
