import React, { useState, useCallback, useRef, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { InfographicNote } from "@/shared/types/index";

export type InfographicViewControls = {
  download: () => void;
  toggleFullscreen: () => void;
};

export interface InfographicViewProps {
  note: InfographicNote;
  onNoteUpdate?: (note: InfographicNote) => void;
  /** Register Download / Fullscreen actions for StudioPanelHeader (desktop + mobile). */
  registerControls?: (controls: InfographicViewControls | null) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export const InfographicView: React.FC<InfographicViewProps> = ({
  note,
  onNoteUpdate: _onNoteUpdate,
  registerControls,
  onFullscreenChange,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
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

  useEffect(() => {
    const handleFullscreenChange = () => {
      const el = containerRef.current;
      const open = el != null && document.fullscreenElement === el;
      setIsFullscreen(open);
      onFullscreenChange?.(open);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [onFullscreenChange]);

  useEffect(() => {
    if (!registerControls) return;

    if (note.status === "generating" || note.status === "failed" || imageError) {
      registerControls(null);
      return;
    }

    registerControls({
      download: handleDownload,
      toggleFullscreen,
    });
    return () => registerControls(null);
  }, [note.status, imageError, registerControls, handleDownload, toggleFullscreen]);

  // Loading state
  if (note.status === "generating") {
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
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300 ${
        isFullscreen ? "fixed inset-0 z-50" : ""
      }`}
    >
      <div className={`flex-1 flex flex-col items-center justify-center min-h-0 ${isFullscreen ? "p-2" : "p-4 md:p-8"}`}>
        <div
          className={`relative bg-black overflow-hidden shadow-2xl ${
            isFullscreen ? "h-full max-h-full" : "max-w-5xl w-full rounded-xl"
          }`}
        >
          {note.imageUrl && !imageError ? (
            <img
              src={note.imageUrl}
              alt={note.title || "Infographic"}
              className="w-full h-full object-contain"
              onError={() => setImageError(true)}
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

        {!isFullscreen && note.title && (
          <h2 className="mt-6 text-xl md:text-2xl font-bold text-center font-serif text-foreground">
            {note.title}
          </h2>
        )}
      </div>
    </div>
  );
};
