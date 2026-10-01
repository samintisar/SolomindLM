import React, { Suspense } from "react";
import { sanitizeMarkdown } from "@/shared/utils";
import { replaceCitationMarkersOutsideMath } from "./citationMarkers";
import { MarkdownRendererLazy } from "./MarkdownRendererLazy";
import { type RefHandlers, stripReferencesSection } from "./messageRendering.utils";

/**
 * Inline citation pill. With handlers it is a keyboard- and touch-operable button that drives the
 * panel's citation popover; without them it is a plain label. `title="Reference N"` is an e2e hook.
 */
export function CitationChip({
  refId,
  messageId,
  handlers,
}: {
  refId: number;
  messageId: string;
  handlers?: RefHandlers;
}) {
  if (!handlers) {
    return (
      <span
        title={`Reference ${refId}`}
        className="mx-1 inline-flex size-5 items-center justify-center rounded-full bg-primary align-middle font-sans text-xs font-bold text-primary-foreground"
      >
        {refId}
      </span>
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      data-citation-chip=""
      title={`Reference ${refId}`}
      aria-label={`Reference ${refId}`}
      onPointerEnter={(e) =>
        e.pointerType === "mouse" && handlers.onRefEnter(refId, messageId, e.currentTarget)
      }
      onPointerLeave={(e) => e.pointerType === "mouse" && handlers.onRefLeave()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handlers.onRefToggle(refId, messageId, e.currentTarget, "pointer");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlers.onRefToggle(refId, messageId, e.currentTarget, "keyboard");
        }
      }}
      className="mx-1 inline-flex size-5 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-primary align-middle font-sans text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/80"
    >
      {refId}
    </span>
  );
}

export function renderMessageWithReferences(
  messageId: string,
  content: string,
  _references: any[] | undefined,
  handlers: RefHandlers | undefined,
  options?: { isStreamingVisual?: boolean }
): React.ReactNode {
  const cleanContent = stripReferencesSection(content);
  const sanitizedContent = sanitizeMarkdown(cleanContent);
  const processedContent = replaceCitationMarkersOutsideMath(sanitizedContent);
  const streaming = !!options?.isStreamingVisual;

  return (
    <Suspense
      fallback={
        <div className="prose max-w-none font-serif animate-pulse h-4 rounded bg-secondary/30" />
      }
    >
      <div className="prose max-w-none space-y-2 font-serif text-base leading-relaxed">
        <MarkdownRendererLazy
          mode={streaming ? "streaming" : "static"}
          parseIncompleteMarkdown={streaming}
          isAnimating={streaming}
          animated={streaming}
          components={{
            img: () => null,
            a: ({ children }) => <span className="text-foreground">{children}</span>,
            video: () => null,
            audio: () => null,
            iframe: () => null,
            table: ({ children }) =>
              React.createElement(
                "table",
                {
                  className:
                    "w-full border-collapse border border-border rounded-lg overflow-hidden",
                },
                children
              ),
            thead: ({ children }) =>
              React.createElement("thead", { className: "bg-secondary/50" }, children),
            tbody: ({ children }) => React.createElement("tbody", null, children),
            tr: ({ children }) =>
              React.createElement("tr", { className: "border-b border-border" }, children),
            th: ({ children }) =>
              React.createElement(
                "th",
                {
                  className:
                    "px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0",
                },
                children
              ),
            td: ({ children }) =>
              React.createElement(
                "td",
                { className: "px-4 py-2 text-foreground border-r border-border last:border-r-0" },
                children
              ),
            p: ({ children }) => <p className="text-base leading-relaxed">{children}</p>,
            /** Citation pills: backend replaces [n] with `CITE:n` (inline code). Streamdown uses `inlineCode` for backticks. */
            inlineCode: ({ children }: any) => {
              const text = String(children);
              if (text.startsWith("CITE:")) {
                const refId = parseInt(text.slice(5), 10);
                if (!Number.isNaN(refId)) {
                  return <CitationChip refId={refId} messageId={messageId} handlers={handlers} />;
                }
              }
              return (
                <code className="bg-secondary/50 px-1.5 py-0.5 rounded text-sm">{children}</code>
              );
            },
          }}
        >
          {processedContent}
        </MarkdownRendererLazy>
      </div>
    </Suspense>
  );
}
