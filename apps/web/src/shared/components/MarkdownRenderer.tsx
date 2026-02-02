import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Components } from 'react-markdown';

export interface MarkdownRendererProps {
  children: string;
  components?: Components;
  className?: string;
}

/** KaTeX options: use a muted color for parse errors instead of bright red. */
const katexOptions = {
  errorColor: '#6b7280', // gray-500, visible but not alarming
  throwOnError: false, // Silently fall back to raw LaTeX on parse errors
};

/**
 * Shared markdown renderer (ReactMarkdown + GFM + math + KaTeX).
 * Lazy-load this component to avoid circular chunk dependency with react-vendor.
 */
export default function MarkdownRenderer({ children, components, className }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, katexOptions]]}
      components={components}
      className={className}
    >
      {children}
    </ReactMarkdown>
  );
}
