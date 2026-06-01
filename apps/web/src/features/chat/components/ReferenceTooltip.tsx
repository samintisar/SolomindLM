import { Plus } from "lucide-react";
import React, { lazy, Suspense, useMemo } from "react";
import { Favicon } from "@/shared/components/Favicon";
import { ReferenceChunk } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

type TooltipNodeProps = { children?: React.ReactNode };

const tooltipMarkdownComponents: any = {
  img: () => null,
  a: ({ children }: TooltipNodeProps) => <span className="text-foreground">{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }: TooltipNodeProps) =>
    React.createElement(
      "table",
      {
        className: "w-full border-collapse border border-border rounded-lg overflow-hidden text-xs",
      },
      children
    ),
  thead: ({ children }: TooltipNodeProps) =>
    React.createElement("thead", { className: "bg-secondary/50" }, children),
  tbody: ({ children }: TooltipNodeProps) => React.createElement("tbody", null, children),
  tr: ({ children }: TooltipNodeProps) =>
    React.createElement("tr", { className: "border-b border-border" }, children),
  th: ({ children }: TooltipNodeProps) =>
    React.createElement(
      "th",
      {
        className:
          "px-2 py-1.5 text-left font-semibold text-foreground border-r border-border last:border-r-0",
      },
      children
    ),
  td: ({ children }: TooltipNodeProps) =>
    React.createElement(
      "td",
      { className: "px-2 py-1.5 text-foreground border-r border-border last:border-r-0" },
      children
    ),
  h1: ({ children }: TooltipNodeProps) => (
    <h1 className="text-base font-semibold leading-snug my-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: TooltipNodeProps) => (
    <h2 className="text-[15px] font-semibold leading-snug my-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: TooltipNodeProps) => (
    <h3 className="text-sm font-semibold leading-snug my-2 first:mt-0">{children}</h3>
  ),
  h4: ({ children }: TooltipNodeProps) => (
    <h4 className="text-sm font-semibold leading-snug my-1.5 first:mt-0">{children}</h4>
  ),
  p: ({ children }: TooltipNodeProps) => (
    <p className="text-[13px] leading-relaxed my-1.5 first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: TooltipNodeProps) => (
    <ul className="list-disc my-2 pl-4 space-y-1 marker:text-muted-foreground">{children}</ul>
  ),
  ol: ({ children }: TooltipNodeProps) => (
    <ol className="list-decimal my-2 pl-4 space-y-1 marker:text-muted-foreground">{children}</ol>
  ),
  li: ({ children }: TooltipNodeProps) => (
    <li className="text-[13px] leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }: TooltipNodeProps) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  pre: ({ children }: TooltipNodeProps) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-border/70 bg-secondary/35 p-2 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ children }: TooltipNodeProps) => (
    <code className="bg-secondary/50 px-1 py-0.5 rounded text-[0.8em]">{children}</code>
  ),
  inlineCode: ({ children }: TooltipNodeProps) => (
    <code className="bg-secondary/50 px-1 py-0.5 rounded text-[0.8em]">{children}</code>
  ),
};

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]|_/g, "")
    .trim();
}

function stripLeadingDuplicateTitle(content: string, sourceTitle: string): string {
  const normalizedSourceTitle = normalizeForComparison(sourceTitle);
  if (!normalizedSourceTitle) return content.trim();

  const lines = content.split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentLineIndex === -1) return content.trim();

  const firstLine = lines[firstContentLineIndex].trim();
  const candidateLine = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  const normalizedCandidate = normalizeForComparison(candidateLine);
  const isDuplicateTitle =
    normalizedCandidate === normalizedSourceTitle ||
    normalizedCandidate.includes(normalizedSourceTitle) ||
    normalizedSourceTitle.includes(normalizedCandidate);

  if (!isDuplicateTitle) return content.trim();

  const cleaned = lines.filter((_, index) => index !== firstContentLineIndex).join("\n");
  return cleaned.replace(/^\s*\n+/, "").trim();
}

function getSourceHost(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function stripTooltipImageArtifacts(content: string): string {
  const cleaned = content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      // Some extracted sources include non-renderable image placeholders in markdown.
      if (/^\[Image blocked:[^\]]+\]$/i.test(trimmed)) return false;
      if (/^!\\?\[[^\]]*]\(\s*(?:https?:\/\/|\/)\S*\s*\)?$/i.test(trimmed)) return false;

      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

interface ReferenceTooltipProps {
  hoveredRefId: number;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  reference: ReferenceChunk;
  position: { x: number; y: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** When set, the reference header opens this notebook source in the sources panel */
  onOpenInSources?: () => void;
  /** When set, shows an "Add to notebook" button for external sources */
  onAddToNotebook?: () => void;
}

export const ReferenceTooltip: React.FC<ReferenceTooltipProps> = ({
  hoveredRefId,
  tooltipRef,
  reference,
  position,
  onMouseEnter,
  onMouseLeave,
  onOpenInSources,
  onAddToNotebook,
}) => {
  const sourceHost = useMemo(() => getSourceHost(reference.sourceUrl), [reference.sourceUrl]);

  const sanitized = useMemo(() => {
    const cleaned = stripTooltipImageArtifacts(reference.content ?? "");
    const deduped = stripLeadingDuplicateTitle(cleaned, reference.sourceTitle);
    return sanitizeMarkdown(deduped);
  }, [reference.content, reference.sourceTitle]);

  const headerTypography =
    "text-[11px] uppercase tracking-[0.2em] font-mono text-muted-foreground font-bold shrink-0 leading-[14px]";

  const isExternalSource = !reference.documentId && !!reference.sourceUrl;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50"
      style={{ left: `${position.x}px`, top: `${position.y}px`, pointerEvents: "auto" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-popover border border-border rounded-2xl shadow-xl p-4 sm:p-5 w-96 max-w-[calc(100vw-2rem)] h-80 text-sm animate-in fade-in zoom-in-95 duration-200 relative flex flex-col">
        <div className="flex items-start mb-3 shrink-0 gap-2 min-w-0">
          {reference.sourceUrl && (
            <span className="shrink-0 pt-1">
              <Favicon url={reference.sourceUrl} size={14} className="rounded-sm" />
            </span>
          )}
          {onOpenInSources ? (
            <button
              type="button"
              className="cursor-pointer text-left rounded-md -mx-1 px-1 py-1 hover:bg-accent/60 hover:text-accent-foreground transition-colors min-w-0 flex-1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenInSources();
              }}
            >
              <p className={headerTypography}>
                Reference {hoveredRefId}
                {sourceHost ? ` • ${sourceHost}` : ""}
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug text-foreground wrap-break-word [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {reference.sourceTitle}
              </p>
            </button>
          ) : reference.sourceUrl ? (
            <a
              href={reference.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer text-left rounded-md -mx-1 px-1 py-1 hover:bg-accent/60 hover:text-accent-foreground transition-colors min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <p className={headerTypography}>
                Reference {hoveredRefId}
                {sourceHost ? ` • ${sourceHost}` : ""}
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug text-foreground wrap-break-word [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {reference.sourceTitle}
              </p>
            </a>
          ) : (
            <div className="min-w-0 flex-1">
              <p className={headerTypography}>Reference {hoveredRefId}</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-foreground wrap-break-word [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {reference.sourceTitle}
              </p>
            </div>
          )}
        </div>
        <div className="border-t border-border/60 pt-3 font-sans text-sm leading-relaxed max-w-none text-popover-foreground wrap-break-word min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          <Suspense fallback={<div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />}>
            <MarkdownRenderer components={tooltipMarkdownComponents}>{sanitized}</MarkdownRenderer>
          </Suspense>
        </div>
        {isExternalSource && onAddToNotebook && (
          <div className="shrink-0 mt-3 border-t border-border/50 pt-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToNotebook();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm font-semibold text-muted-foreground shadow-none transition-[color,background-color,border-color,box-shadow] hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
            >
              <Plus className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              Add to notebook
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
