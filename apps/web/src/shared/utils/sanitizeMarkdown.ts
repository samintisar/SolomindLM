import DOMPurify from 'dompurify';

import { normalizeMathMarkdown } from '@convex/_shared/mathMarkdown';

/**
 * Strips ANSI escape codes from text (e.g., [1m, [0m, [31m).
 * These can leak into LLM output and cause KaTeX parse errors.
 */
function stripAnsiCodes(text: string): string {
  // Matches ANSI escape sequences like \x1b[...m or \[...\d
  return text.replace(/\x1b\[[0-9;]*m/g, '')
              .replace(/\[[0-9;]*[mK]/g, '');
}

/**
 * Restores angle brackets inside LaTeX math blocks after DOMPurify sanitization.
 * DOMPurify escapes < and > to &lt; and &gt;, which breaks LaTeX like 0 < \theta < 1.
 * This only unescapes inside $...$ and $$...$$ so that KaTeX receives valid input.
 */
export function restoreAngleBracketsInMath(content: string): string {
  let out = content;
  // Display math: $$...$$
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) =>
    '$$' + math.replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '$$'
  );
  // Inline math: $...$ (single $ not part of $$)
  out = out.replace(/(?<!\$)\$(?!\$)([^$]*?)\$(?<!\$)(?!\$)/g, (_, math) =>
    '$' + math.replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '$'
  );
  return out;
}

/**
 * Sanitizes markdown content using DOMPurify before rendering with ReactMarkdown.
 * This prevents XSS attacks while allowing safe markdown elements.
 *
 * Note: This sanitizes the markdown SOURCE text, not the rendered HTML.
 * ReactMarkdown will parse the sanitized markdown and render it safely.
 * Angle brackets inside math blocks are restored so LaTeX (e.g. 0 < \theta < 1) renders correctly.
 */
export function sanitizeMarkdown(content: string): string {
  // First strip ANSI codes that can cause KaTeX parse errors
  const withoutAnsi = stripAnsiCodes(content);
  const normalizedMath = normalizeMathMarkdown(withoutAnsi);

  // DOMPurify sanitizes HTML, but we're using it on markdown source text
  // This strips any HTML tags that might be embedded in the markdown
  // ReactMarkdown will then parse the clean markdown and render it
  const sanitized = DOMPurify.sanitize(normalizedMath, {
    // Allow only safe text content - no HTML tags in markdown source
    ALLOWED_TAGS: [], // Empty array means no HTML tags allowed in markdown source
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true, // Keep the text content
  });

  return restoreAngleBracketsInMath(sanitized);
}

/**
 * Configuration for sanitizing HTML content (post-rendering)
 * Use this when you need to sanitize already-rendered HTML
 */
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u',
    'a', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr',
    'sub', 'sup',
    'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'title', 'class', 'className', 'style'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitizes HTML content (for use with rendered HTML)
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
