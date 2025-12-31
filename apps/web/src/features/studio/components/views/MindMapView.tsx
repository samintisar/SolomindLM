import React, { useState, useRef, useEffect } from 'react';
import {
  XCircle,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Note } from '@/shared/types/index';

export interface MindMapViewProps {
  note: Note;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export const MindMapView: React.FC<MindMapViewProps> = ({ note, isExpanded = false, onToggleExpanded }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<any>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [scale, setScale] = useState(1);
  const mindMapData = note.mindMapData;

  // Initialize Mind Elixir after data is loaded
  useEffect(() => {
    if (!containerRef.current || !mindMapData) return;

    // Clean up previous instance
    if (mindRef.current) {
      mindRef.current = null;
    }

    // Dynamic import Mind Elixir
    import('mind-elixir').then(({ default: MindElixir }) => {
      const options = {
        el: containerRef.current,
        direction: MindElixir.RIGHT, // Right-growing tree (Left-to-Right) like NotebookLM
        draggable: true,
        contextMenu: false, // Disable right-click context menu
        toolBar: false, // Disable default toolbar to use custom controls
        nodeMenu: false, // Disable node menu on right-click
        keypress: true,
        locale: 'en' as any,
        overflowHidden: false,
        mainLinkStyle: 2,
        mouseSelectionButton: -1 as any, // Disable left-click selection
        before: {
          insertSibling(el: any, obj: any) {
            return true;
          },
          async addChild(el: any, obj: any) {
            return true;
          },
        },
        // NotebookLM-inspired theme: clean, card-based, minimalist
        theme: {
          name: 'NotebookLM',
          // Uniform blue/gray palette - monochrome with blue accents
          palette: ['#1a73e8', '#5f6368', '#3c4043'],
          // Google NotebookLM color variables
          cssVar: {
            '--main-color': '#1f1f1f',       // Dark grey text for root
            '--main-bgcolor': '#ffffff',     // White background for root
            '--color': '#3c4043',            // Dark grey text for nodes
            '--bgcolor': '#ffffff',          // White background for nodes
            '--panel-color': '#3c4043',      // Text color for panel
            '--panel-bgcolor': '#f8f9fa',    // Light grey background for canvas
            '--panel-border-color': '#dadce0', // Google-style soft border grey
            // Rounded corners for Material Design look
            '--root-radius': '12px',
            '--main-radius': '8px',
            '--topic-radius': '8px',
          },
        } as any,
      };

      const mind = new MindElixir(options);
      mind.init({ nodeData: mindMapData.nodeData });
      mindRef.current = mind;

      // Disable context menu on the container
      if (containerRef.current) {
        containerRef.current.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          return false;
        });

        // Prevent selection rectangle on mouse drag
        const preventSelection = (e: MouseEvent) => {
          // Prevent default drag selection behavior
          if (e.buttons === 1) { // Left mouse button
            e.preventDefault();
          }
        };

        // Prevent selection start
        const preventSelectionStart = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          return false;
        };

        containerRef.current.addEventListener('mousedown', preventSelection, { passive: false });
        containerRef.current.addEventListener('selectstart', preventSelectionStart, { passive: false });
        containerRef.current.addEventListener('dragstart', (e) => e.preventDefault(), { passive: false });

        // Remove any selection rectangles that might be created
        const removeSelectionRectangles = () => {
          if (!containerRef.current) return;
          const selectors = [
            '.map-select',
            '.select-rectangle',
            '.selection-box',
            '.selection-rect',
            '[class*="selection"]',
            '[class*="select-rect"]',
          ];
          selectors.forEach(selector => {
            const elements = containerRef.current!.querySelectorAll(selector);
            elements.forEach(el => {
              (el as HTMLElement).style.display = 'none';
              (el as HTMLElement).style.visibility = 'hidden';
              (el as HTMLElement).style.opacity = '0';
            });
          });
        };

        // Use MutationObserver to catch dynamically added selection elements
        const observer = new MutationObserver(removeSelectionRectangles);
        observer.observe(containerRef.current, { childList: true, subtree: true });

        // Store cleanup function
        (containerRef.current as any)._cleanupSelection = () => {
          containerRef.current?.removeEventListener('mousedown', preventSelection);
          containerRef.current?.removeEventListener('selectstart', preventSelectionStart);
          observer.disconnect();
        };

        // Initial cleanup
        setTimeout(removeSelectionRectangles, 100);
      }

      // Collapse all nodes by default (only show root)
      const collapseAllNodes = (mindInstance: any) => {
        try {
          const rootNode = mindInstance.nodeData;
          if (rootNode.children && rootNode.children.length > 0) {
            const collapseRecursive = (node: any) => {
              if (node.children && node.children.length > 0) {
                // Find the DOM element for this node by ID
                const nodeElement = containerRef.current?.querySelector(`[data-nodeid="${node.id}"]`);
                if (nodeElement && mindInstance.expandNode) {
                  try {
                    mindInstance.expandNode(nodeElement, false);
                  } catch (e) {
                    // Silently ignore if expandNode fails
                  }
                }
                // Recursively collapse children
                node.children.forEach((child: any) => collapseRecursive(child));
              }
            };
            rootNode.children.forEach((child: any) => collapseRecursive(child));
          }
        } catch (e) {
          // Silently ignore collapse errors
        }
      };

      // Collapse all nodes after a brief delay to ensure DOM is ready
      setTimeout(() => {
        collapseAllNodes(mind);
      }, 150);

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

      if (containerRef.current) {
        // Store cleanup function to clear the interval
        const originalCleanup = (containerRef.current as any)._cleanupSelection;
        (containerRef.current as any)._cleanupSelection = () => {
          if (originalCleanup) originalCleanup();
          clearInterval(pollInterval);
        };
      }
    });

    return () => {
      // Clean up selection prevention
      if (containerRef.current && (containerRef.current as any)._cleanupSelection) {
        (containerRef.current as any)._cleanupSelection();
        delete (containerRef.current as any)._cleanupSelection;
      }
      if (mindRef.current) {
        mindRef.current = null;
      }
    };
  }, [mindMapData, renderKey]);

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
  const isGenerating = note.status === 'generating' || note.status === 'mapping' ||
                       note.status === 'collapsing' || note.status === 'reducing';
  const isFailed = note.status === 'failed';

  if (isGenerating) {
    return (
      <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="p-4 border-b border-border bg-secondary/30">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-sm font-medium text-muted-foreground">
              Creating mind map...
            </span>
          </div>
          <p className="text-xs text-center text-muted-foreground/60 mt-2">
            This may take a moment
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-muted-foreground font-serif italic">
              Generating mind map from your sources...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="p-4 border-b border-border bg-destructive/10">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Mind map generation failed</p>
              <p className="text-xs text-destructive/70 mt-1">
                {note.metadata?.error || 'An unknown error occurred'}
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/30">
        <div className="flex items-center gap-2">
          {isExpanded && (
            <h2 className="text-sm font-bold text-foreground mr-4">
              {note.title}
            </h2>
          )}
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
        <div
          key={renderKey}
          ref={containerRef}
          className="mind-map-container w-full h-full"
        />
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
