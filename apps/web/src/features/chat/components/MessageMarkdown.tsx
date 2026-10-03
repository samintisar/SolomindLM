import React, { Suspense, useMemo } from "react";
import type { MarkdownRendererProps } from "@/shared/components/MarkdownRenderer.utils";
import { sanitizeMarkdown } from "@/shared/utils";
import { replaceCitationMarkersOutsideMath } from "../utils/citationMarkers";
import { MarkdownRendererLazy } from "../utils/MarkdownRendererLazy";
import { type RefHandlers, stripReferencesSection } from "../utils/messageRendering.utils";
import { CitationChip } from "./CitationChip";

/** Plain text of rendered children; Streamdown's streaming animation wraps text in spans. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node))
    return textOf(node.props.children);
  return "";
}

type MarkdownComponents = NonNullable<MarkdownRendererProps["components"]>;

/** Message markdown overrides that don't depend on the message; module scope keeps them stable. */
const STATIC_MESSAGE_COMPONENTS: MarkdownComponents = {
  img: () => null,
  a: ({ children }) => <span className="text-foreground">{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }) => (
    <table className="w-full border-collapse overflow-hidden rounded-lg border border-border">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border px-4 py-2 text-left font-semibold text-foreground last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border px-4 py-2 text-foreground last:border-r-0">{children}</td>
  ),
  p: ({ children }) => <p className="text-base leading-relaxed">{children}</p>,
};

interface MessageMarkdownProps {
  messageId: string;
  content: string;
  handlers: RefHandlers | undefined;
  streaming: boolean;
}

/**
 * Streamdown memoizes its component map on the `components` prop's identity and wraps
 * `inlineCode` in a fresh closure whenever it changes, which remounts every inline code node.
 * A map that is stable per message keeps citation chips (popover anchors) mounted across
 * re-renders and streamed tokens, and lets Streamdown skip unchanged blocks.
 */
export const MessageMarkdown = React.memo(function MessageMarkdown({
  messageId,
  content,
  handlers,
  streaming,
}: MessageMarkdownProps) {
  const processedContent = useMemo(
    () => replaceCitationMarkersOutsideMath(sanitizeMarkdown(stripReferencesSection(content))),
    [content]
  );

  const components = useMemo<MarkdownComponents>(
    () => ({
      ...STATIC_MESSAGE_COMPONENTS,
      /** Citation pills: backend replaces [n] with `CITE:n` (inline code). Streamdown uses `inlineCode` for backticks. */
      inlineCode: ({ children }) => {
        const text = textOf(children).trim();
        if (text.startsWith("CITE:")) {
          const refId = parseInt(text.slice(5), 10);
          if (!Number.isNaN(refId)) {
            return <CitationChip refId={refId} messageId={messageId} handlers={handlers} />;
          }
        }
        return <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-sm">{children}</code>;
      },
    }),
    [messageId, handlers]
  );

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
          components={components}
        >
          {processedContent}
        </MarkdownRendererLazy>
      </div>
    </Suspense>
  );
});
