import React, { Suspense, lazy, useMemo } from "react";
import { ReferenceChunk } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

const tooltipMarkdownComponents = {
  img: () => null,
  a: ({ children }: { children?: React.ReactNode }) => (
    <span className="text-foreground">{children}</span>
  ),
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      "table",
      {
        className: "w-full border-collapse border border-border rounded-lg overflow-hidden text-xs",
      },
      children
    ),
  thead: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("thead", { className: "bg-secondary/50" }, children),
  tbody: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("tbody", null, children),
  tr: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("tr", { className: "border-b border-border" }, children),
  th: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      "th",
      {
        className:
          "px-2 py-1.5 text-left font-semibold text-foreground border-r border-border last:border-r-0",
      },
      children
    ),
  td: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      "td",
      { className: "px-2 py-1.5 text-foreground border-r border-border last:border-r-0" },
      children
    ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed my-1 first:mt-0 last:mb-0">{children}</p>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-secondary/50 px-1 py-0.5 rounded text-[0.8em]">{children}</code>
  ),
  inlineCode: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-secondary/50 px-1 py-0.5 rounded text-[0.8em]">{children}</code>
  ),
};

interface ReferenceTooltipProps {
  hoveredRefId: number;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  reference: ReferenceChunk;
  position: { x: number; y: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** When set, the reference header opens this notebook source in the sources panel */
  onOpenInSources?: () => void;
}

export const ReferenceTooltip: React.FC<ReferenceTooltipProps> = ({
  hoveredRefId,
  tooltipRef,
  reference,
  position,
  onMouseEnter,
  onMouseLeave,
  onOpenInSources,
}) => {
  const sanitized = useMemo(() => sanitizeMarkdown(reference.content ?? ""), [reference.content]);

  const headerTypography =
    "text-xs uppercase tracking-widest font-mono text-muted-foreground mb-3 font-bold shrink-0";

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50"
      style={{ left: `${position.x}px`, top: `${position.y}px`, pointerEvents: "auto" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-popover border border-border rounded-2xl shadow-xl p-5 w-96 h-80 text-sm animate-in fade-in zoom-in-95 duration-200 relative flex flex-col">
        {onOpenInSources ? (
          <button
            type="button"
            className={`${headerTypography} cursor-pointer text-left w-full rounded-md -mx-1 px-1 py-0.5 hover:bg-accent/60 hover:text-accent-foreground transition-colors`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenInSources();
            }}
          >
            Reference {hoveredRefId} • {reference.sourceTitle}
          </button>
        ) : (
          <p className={headerTypography}>
            Reference {hoveredRefId} • {reference.sourceTitle}
          </p>
        )}
        <div className="prose font-serif text-sm leading-relaxed max-w-none text-popover-foreground wrap-break-word min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <Suspense fallback={<div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />}>
            <MarkdownRenderer components={tooltipMarkdownComponents as any}>
              {sanitized}
            </MarkdownRenderer>
          </Suspense>
        </div>
      </div>
    </div>
  );
};
