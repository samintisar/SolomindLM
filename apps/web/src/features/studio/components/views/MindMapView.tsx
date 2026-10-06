import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Network,
  Scan,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { MindElixirInstance, NodeObj, Theme } from "mind-elixir";
import type React from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import type { MindMapNote } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import {
  collapseLargeTree,
  fitScale,
  openingScale,
  SCALE_MAX,
  SCALE_MIN,
  sanitizeNodeTree,
  stepScale,
} from "../mindmap/mindMapViewport";

export interface MindMapViewProps {
  note: MindMapNote;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onBack?: () => void;
  onAskInChat?: (prompt: string, documentIds?: string[]) => void;
}

/** Branch line colours, as app tokens. Mind Elixir writes them into SVG `stroke` attributes. */
const BRANCH_TOKENS = ["--studio-mindmap", "--muted-foreground"];

/**
 * The map's theme, on the app's tokens so the canvas follows light and dark. The `cssVar` values
 * are set as custom properties on the map, so `var()` resolves there. The palette can't use
 * `var()`: an SVG presentation attribute doesn't resolve it, so it reads the tokens' current values.
 */
function mindMapTheme(): Theme {
  const styles = getComputedStyle(document.documentElement);
  const palette = BRANCH_TOKENS.map(
    (token) => styles.getPropertyValue(token).trim() || "currentColor"
  );
  return {
    name: "SolomindLM",
    palette,
    cssVar: {
      "--main-color": "var(--foreground)",
      "--main-bgcolor": "var(--card)",
      "--main-bgcolor-transparent": "color-mix(in oklab, var(--card) 80%, transparent)",
      "--color": "var(--foreground)",
      // The canvas: topics sit on it as cards (see `.mind-map-container me-tpc` in index.css).
      "--bgcolor": "var(--background)",
      "--root-color": "var(--foreground)",
      "--root-bgcolor": "var(--card)",
      "--root-border-color": "var(--border)",
      "--selected": "var(--ring)",
      "--accent-color": "var(--studio-mindmap)",
      "--panel-color": "var(--foreground)",
      "--panel-bgcolor": "var(--background)",
      "--panel-border-color": "var(--border)",
      "--root-radius": "calc(var(--radius) * 1.5)",
      "--main-radius": "var(--radius)",
    } as Theme["cssVar"],
  };
}

/** The stored error as text. Metadata isn't validated, so only a non-empty string is shown. */
function errorMessage(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string" && message) return message;
  }
  return "An unknown error occurred";
}

export const MindMapView: React.FC<MindMapViewProps> = ({
  note,
  isExpanded = false,
  onToggleExpanded,
  onBack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<MindElixirInstance | null>(null);
  const [scale, setScale] = useState(1);
  const [loadFailed, setLoadFailed] = useState(false);
  const mindMapData = note.mindMapData;

  useEffect(() => {
    if (!containerRef.current || !mindMapData) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;
    setLoadFailed(false);

    import("mind-elixir")
      .then(({ default: MindElixir }) => {
        const el = containerRef.current;
        if (cancelled || !el) return;

        const root = sanitizeNodeTree(
          mindMapData.nodeData,
          (note.title && note.title.trim()) || "Mind Map",
          true
        );

        const mind = new MindElixir({
          el,
          direction: MindElixir.RIGHT,
          // Read-only: the generated map has nowhere to save edits, renames or moved nodes.
          editable: false,
          draggable: false,
          contextMenu: false,
          toolBar: false,
          keypress: false,
          locale: "en",
          overflowHidden: false,
          // Keep drag-to-pan on the left button; marquee selection only on the right.
          mouseSelectionButton: 2,
          scaleMin: SCALE_MIN,
          scaleMax: SCALE_MAX,
          theme: mindMapTheme(),
        });
        mind.init({ nodeData: collapseLargeTree(root) as NodeObj });
        mindRef.current = mind;

        // Every zoom, the wheel included, reports its scale here.
        const onScale = (value: number) => setScale(value);
        mind.bus.addListener("scale", onScale);

        // The palette holds resolved colours, so re-apply the theme when the app's theme class flips.
        const themeObserver = new MutationObserver(() => mind.changeTheme(mindMapTheme()));
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });

        // Open fitted, but never so small the topics can't be read (#171): scaleFit ignores scaleMin.
        requestAnimationFrame(() => {
          if (cancelled) return;
          mind.scaleFit();
          const fitted = mind.scaleVal;
          const opening = openingScale(fitted);
          if (opening !== fitted) {
            mind.toCenter();
            mind.scale(opening);
          }
          setScale(mind.scaleVal);
        });

        teardown = () => {
          themeObserver.disconnect();
          mind.bus.removeListener("scale", onScale);
          mind.destroy();
        };
      })
      .catch((error: unknown) => {
        // The chunk failed to download, or the map couldn't be built from this data.
        if (cancelled) return;
        console.error("Couldn't load the mind map:", error);
        setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      teardown?.();
      mindRef.current = null;
    };
  }, [mindMapData, note.title]);

  // Escape leaves full screen. The notebook also mounts a hidden copy of the Studio panel, so only
  // the visible map answers.
  const rootRef = useRef<HTMLDivElement>(null);
  const exitOnEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const root = rootRef.current;
    if (!root || (typeof root.checkVisibility === "function" && !root.checkVisibility())) return;
    onToggleExpanded?.();
  });
  useEffect(() => {
    if (!isExpanded) return;
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [isExpanded]);

  const zoom = (direction: "in" | "out") => {
    mindRef.current?.scale(stepScale(scale, direction));
  };

  const fitToView = () => {
    const mind = mindRef.current;
    if (!mind) return;
    mind.scaleFit();
    const target = fitScale(mind.scaleVal);
    if (target !== mind.scaleVal) {
      mind.toCenter();
      mind.scale(target);
    }
  };

  if (note.status === "failed") {
    return (
      <div className="flex h-full flex-col gap-4 bg-background p-4 duration-300 ease-out animate-in fade-in slide-in-from-right-4">
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>Mind map generation failed</AlertTitle>
          <AlertDescription>{errorMessage(note.metadata?.error)}</AlertDescription>
        </Alert>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <XCircle />
            </EmptyMedia>
            <EmptyTitle>Failed to generate mind map</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!mindMapData) {
    return (
      <div className="flex h-full flex-col bg-background">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network />
            </EmptyMedia>
            <EmptyTitle>No mind map data available</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col bg-background",
        // Full screen sits on the portal layer, above the z-70 app header, so its toolbar shows.
        isExpanded
          ? "fixed inset-0 z-100 h-screen"
          : "h-full duration-300 ease-out animate-in fade-in slide-in-from-right-4"
      )}
    >
      <div className="relative z-30 flex shrink-0 items-center justify-between gap-2 bg-surface-raised px-3 py-2 shadow-xs">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && !isExpanded && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={onBack}
              aria-label="Back to Studio"
            >
              <ArrowLeft />
            </Button>
          )}
          {isExpanded && (
            <h2 className="truncate font-display text-base text-foreground">{note.title}</h2>
          )}
          <ButtonGroup variant="tray" aria-label="Zoom">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              onClick={() => zoom("out")}
            >
              <ZoomOut />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Fit to view" onClick={fitToView}>
              <Scan />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoom("in")}>
              <ZoomIn />
            </Button>
          </ButtonGroup>
          <span
            role="status"
            aria-live="polite"
            className="font-sans text-xs text-muted-foreground tabular-nums"
          >
            {Math.round(scale * 100)}%
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isExpanded ? "Exit full screen" : "Expand to full screen"}
          onClick={onToggleExpanded}
        >
          {isExpanded ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="mind-map-container size-full" />
        {loadFailed && (
          <div className="absolute inset-0 flex bg-background">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <XCircle />
                </EmptyMedia>
                <EmptyTitle>Couldn't load the mind map</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>

      {!isExpanded && (
        <p className="px-4 py-2 font-sans text-xs text-muted-foreground">
          Drag to pan, use the controls or Ctrl + scroll to zoom.
        </p>
      )}
    </div>
  );
};
