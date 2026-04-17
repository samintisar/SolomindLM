import React, { Suspense, lazy } from 'react';
import { sanitizeMarkdown } from '@/shared/utils';
import { replaceCitationMarkersOutsideMath } from './citationMarkers';

const MarkdownRenderer = lazy(() =>
  import('@/shared/components/MarkdownRenderer').then((m) => ({ default: m.default }))
);

export function stripReferencesSection(content: string): string {
  const referencesPattern = /\n?(?:References|Reference):\s*\n?[\d\s.,\-:–—]*$/i;
  const match = content.match(referencesPattern);
  if (match) {
    return content.substring(0, match.index).trim();
  }
  return content;
}

export interface RefHandlers {
  onRefHover: (refId: number, messageId: string, event: React.MouseEvent) => void;
  onRefLeave: () => void;
  onRefClick: (refId: number, messageId: string, event: React.MouseEvent | React.TouchEvent) => void;
}

export function renderMessageWithReferences(
  messageId: string,
  content: string,
  _references: any[] | undefined,
  handlers: RefHandlers,
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
        <MarkdownRenderer
          mode={streaming ? 'streaming' : 'static'}
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
              React.createElement('table', { className: 'w-full border-collapse border border-border rounded-lg overflow-hidden' }, children),
            thead: ({ children }) =>
              React.createElement('thead', { className: 'bg-secondary/50' }, children),
            tbody: ({ children }) =>
              React.createElement('tbody', null, children),
            tr: ({ children }) =>
              React.createElement('tr', { className: 'border-b border-border' }, children),
            th: ({ children }) =>
              React.createElement('th', { className: 'px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0' }, children),
            td: ({ children }) =>
              React.createElement('td', { className: 'px-4 py-2 text-foreground border-r border-border last:border-r-0' }, children),
            p: ({ children }) => <p className="text-base leading-relaxed">{children}</p>,
            /** Citation pills: backend replaces [n] with `CITE:n` (inline code). Streamdown uses `inlineCode` for backticks. */
            inlineCode: ({ children }: any) => {
              const text = String(children);
              if (text.startsWith('CITE:')) {
                const refId = parseInt(text.slice(5), 10);
                if (!Number.isNaN(refId)) {
                  return (
                    <span
                      onMouseEnter={(e) => handlers.onRefHover(refId, messageId, e)}
                      onMouseLeave={handlers.onRefLeave}
                      onClick={(e) => handlers.onRefClick(refId, messageId, e)}
                      onTouchStart={(e) => handlers.onRefClick(refId, messageId, e)}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:bg-primary/90 active:bg-primary/80 transition-colors mx-1 align-middle relative touch-manipulation"
                      title={`Reference ${refId}`}
                      style={{ verticalAlign: 'middle' }}
                    >
                      {refId}
                    </span>
                  );
                }
              }
              return <code className="bg-secondary/50 px-1.5 py-0.5 rounded text-sm">{children}</code>;
            },
          }}
        >
          {processedContent}
        </MarkdownRenderer>
      </div>
    </Suspense>
  );
}
