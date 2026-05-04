import React, { useState, useRef, useEffect } from "react";
import { XCircle, ZoomIn, ZoomOut, Maximize2, Minimize2, ArrowLeft } from "lucide-react";
import { MindMapNote } from "@/shared/types/index";

export interface MindMapViewProps {
  note: MindMapNote;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onBack?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeNodeTree(node: any, fallbackTopic: string, isRoot = false): any {
  if (!node || typeof node !== "object") {
    return {
      id: isRoot ? "root" : `node-${Math.random().toString(36).slice(2, 9)}`,
      topic: isRoot ? fallbackTopic : "Untitled",
      children: [],
    };
  }

  const rawTopic = typeof node.topic === "string" ? node.topic : "";
  const topic = rawTopic.trim().length > 0 ? rawTopic : isRoot ? fallbackTopic : "Untitled";
  const id =
    typeof node.id === "string" && node.id.trim().length > 0
      ? node.id
      : isRoot
        ? "root"
        : `node-${Math.random().toString(36).slice(2, 9)}`;

  const children = Array.isArray(node.children)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      node.children.map((child: any) => sanitizeNodeTree(child, fallbackTopic, false))
    : [];

  return {
    ...node,
    id,
    topic,
    children,
  };
}

export const MindMapView: React.FC<MindMapViewProps> = ({
  note,
  isExpanded = false,
  onToggleExpanded,
  onBack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mindRef = useRef<any>(null);
  const [scale, setScale] = useState(1);
  const mindMapData = note.mindMapData;

  // Initialize Mind Elixir after data is loaded
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl || !mindMapData) return;

    // Clean up previous instance
    if (mindRef.current) {
      mindRef.current = null;
    }

    // Dynamic import Mind Elixir
    import("mind-elixir").then(({ default: MindElixir }) => {
      const el = containerRef.current;
      if (!el) return;
      const sanitizedRoot = sanitizeNodeTree(
        mindMapData?.nodeData,
        (note.title && note.title.trim()) || "Mind Map",
        true
      );

      const options = {
        el,
        direction: MindElixir.RIGHT, // Right-growing tree (Left-to-Right)
        draggable: true,
        contextMenu: false, // Disable right-click context menu
        toolBar: false, // Disable default toolbar to use custom controls
        nodeMenu: false, // Disable node menu on right-click
        keypress: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        locale: "en" as any,
        overflowHidden: false,
        mainLinkStyle: 2,
        // Keep drag-to-pan on left mouse; marquee selection only on right mouse.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mouseSelectionButton: 2 as any,
        before: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          insertSibling(_el: any, _obj: any) {
            return true;
          },

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async addChild(_el: any, _obj: any) {
            return true;
          },
        },
        // SolomindLM theme: clean, card-based, minimalist
        theme: {
          name: "SolomindLM",
          // Uniform blue/gray palette - monochrome with blue accents
          palette: ["#1a73e8", "#5f6368", "#3c4043"],
          cssVar: {
            "--main-color": "#1f1f1f", // Dark grey text for root
            "--main-bgcolor": "#ffffff", // White background for root
            "--color": "#3c4043", // Dark grey text for nodes
            "--bgcolor": "#ffffff", // White background for nodes
            "--panel-color": "#3c4043", // Text color for panel
            "--panel-bgcolor": "#f8f9fa", // Light grey background for canvas
            "--panel-border-color": "#dadce0", // Google-style soft border grey
            // Rounded corners for Material Design look
            "--root-radius": "12px",
            "--main-radius": "8px",
            "--topic-radius": "8px",
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      const mind = new MindElixir(options);
      mind.init({ nodeData: sanitizedRoot });
      mindRef.current = mind;

      // Center map on first render so root is visible.
      requestAnimationFrame(() => {
        try {
          if (typeof mind.toCenter === "function") {
            mind.toCenter();
          }
        } catch {
          // Ignore non-critical centering errors.
        }
      });

      // Set initial scale
      setScale(mind.scaleVal || 1);

      // Track manual zoom changes via Ctrl+Scroll or mouse wheel
      let lastScale = mind.scaleVal || 1;
      const pollInterval = setInterval(() => {
        if (mindRef.current && mindRef.current.scaleVal) {
          const currentScale = mindRef.current.scaleVal;
          // Only update if scale has actually changed
          if (Math.abs(currentScale - lastScale) > 0.001) {
            lastScale = currentScale;
            setScale(currentScale);
          }
        }
      }, 100); // Poll every 100ms

      if (containerEl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (containerEl as any)._cleanupSelection = () => {
          clearInterval(pollInterval);
        };
      }
    });

    return () => {
      // Clean up selection prevention
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (containerEl && (containerEl as any)._cleanupSelection) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (containerEl as any)._cleanupSelection();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (containerEl as any)._cleanupSelection;
      }
      if (mindRef.current) {
        mindRef.current = null;
      }
    };
  }, [mindMapData, note.title]);

  // Control functions
  const handleZoomIn = () => {
    if (mindRef.current) {
      const newScale = Math.min(scale + 0.2, 2);
      mindRef.current.scale(newScale);
      setScale(newScale);
    }
  };

  const handleZoomOut = () => {
    if (mindRef.current) {
      const newScale = Math.max(scale - 0.2, 0.3);
      mindRef.current.scale(newScale);
      setScale(newScale);
    }
  };

  // Generating/loading state
  const isFailed = note.status === "failed";

  if (isFailed) {
    return (
      <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="p-4 border-b border-border bg-destructive/10">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Mind map generation failed</p>
              <p className="text-xs text-destructive/70 mt-1">
                {typeof note.metadata?.error === "object"
                  ? (note.metadata.error as { message?: string }).message ||
                    "An unknown error occurred"
                  : note.metadata?.error || "An unknown error occurred"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted-foreground">Failed to generate mind map</p>
        </div>
      </div>
    );
  }

  if (!mindMapData) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted-foreground">No mind map data available</p>
        </div>
      </div>
    );
  }

  const containerClasses = isExpanded
    ? "fixed inset-0 z-50 flex flex-col h-screen bg-background"
    : "flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300";

  return (
    <div className={containerClasses}>
      {/* Custom Control Bar */}
      <div className="relative z-30 shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card/85 backdrop-blur supports-backdrop-filter:bg-card/75">
        <div className="flex items-center gap-2">
          {/* Mobile Back Button */}
          {onBack && !isExpanded && (
            <button
              onClick={onBack}
              className="md:hidden p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
              aria-label="Back to Studio"
            >
              <ArrowLeft className="w-5 h-5 shrink-0" />
            </button>
          )}
          {isExpanded && <h2 className="text-sm font-bold text-foreground mr-4">{note.title}</h2>}
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-md hover:bg-secondary transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-md hover:bg-secondary transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-muted-foreground ml-2">
            {Math.round(scale * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <button
              onClick={onToggleExpanded}
              className="p-2 rounded-md hover:bg-secondary transition-colors"
              title="Exit Full Screen"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onToggleExpanded}
              className="p-2 rounded-md hover:bg-secondary transition-colors"
              title="Expand to Full Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mind Map Container */}
      <div className="flex-1 relative overflow-hidden">
        {isExpanded && (
          <div className="absolute top-3 right-3 z-40 flex items-center gap-1 rounded-md border border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/85 p-1 shadow-sm">
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-md hover:bg-secondary transition-colors"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomIn}
              className="p-2 rounded-md hover:bg-secondary transition-colors"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleExpanded}
              className="p-2 rounded-md hover:bg-secondary transition-colors"
              title="Exit Full Screen"
              aria-label="Exit Full Screen"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        )}
        <div ref={containerRef} className="mind-map-container w-full h-full" />
      </div>

      {/* Keyboard shortcuts hint */}
      {!isExpanded && (
        <div className="px-4 py-2 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Tip:</span> Drag to pan, use controls to zoom.
          </p>
        </div>
      )}
    </div>
  );
};
