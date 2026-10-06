import { ImageOff } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Spinner } from "@/shared/components/ui/spinner";
import { InfographicNote } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";

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
  // Keyed by URL so a regenerated image starts blurred again and a past error doesn't stick.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const imageError = erroredUrl !== null && erroredUrl === note.imageUrl;
  const loaded = loadedUrl !== null && loadedUrl === note.imageUrl;

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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Spinner className="size-8" />
        <p className="italic text-muted-foreground">Generating your infographic…</p>
        {note.metadata?.currentStep && (
          <p className="font-sans text-xs text-muted-foreground">{note.metadata.currentStep}</p>
        )}
      </div>
    );
  }

  // Error state
  if (note.status === "failed" || imageError) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageOff />
          </EmptyMedia>
          <EmptyTitle>Infographic unavailable</EmptyTitle>
          <EmptyDescription>
            {note.metadata?.error || "The image could not be loaded"}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full flex-col bg-background animate-in fade-in slide-in-from-right-4 duration-300",
        isFullscreen && "fixed inset-0 z-50"
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center",
          isFullscreen ? "p-2" : "p-4 md:p-8"
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden bg-muted shadow-md",
            isFullscreen ? "h-full max-h-full" : "w-full max-w-5xl rounded-xl",
            !loaded && "aspect-video"
          )}
        >
          {!loaded && <Skeleton className="absolute inset-0" />}
          {note.imageUrl && (
            <img
              src={note.imageUrl}
              alt={note.title || "Infographic"}
              className={cn(
                "relative size-full object-contain transition duration-700 ease-out motion-reduce:blur-none motion-reduce:scale-100",
                loaded ? "scale-100 opacity-100 blur-none" : "scale-105 opacity-0 blur-md"
              )}
              onLoad={() => setLoadedUrl(note.imageUrl ?? null)}
              onError={() => setErroredUrl(note.imageUrl ?? null)}
              draggable={false}
            />
          )}
        </div>

        {!isFullscreen && note.title && (
          <h2 className="mt-6 text-center font-display text-xl text-foreground md:text-2xl">
            {note.title}
          </h2>
        )}
      </div>
    </div>
  );
};
