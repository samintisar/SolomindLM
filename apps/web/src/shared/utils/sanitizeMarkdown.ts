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
 * Restores angle brackets after DOMPurify sanitization of markdown *source*.
 *
 * With ALLOWED_TAGS: [], DOMPurify still encodes `<` / `>` as `&lt;` / `&gt;` in the
 * returned text. We previously unescaped only inside `$...$` / `$$...$$`, but that
 * left literal `&lt;` everywhere else — including undelimited LaTeX fragments and
 * plain inequalities — so KaTeX saw invalid input and users saw entity text.
 *
 * The output is still tag-free; the app renderer (Streamdown) does not treat these
 * as raw HTML from markdown source, so they stay as text/math delimiters.
 */
export function restoreAngleBracketsAfterDomPurify(content: string): string {
  return content.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Sanitizes markdown content using DOMPurify before rendering with Streamdown.
 * This prevents XSS attacks while allowing safe markdown elements.
 *
 * Note: This sanitizes the markdown SOURCE text, not the rendered HTML.
 * Streamdown parses the sanitized markdown and applies its own hardened pipeline.
 * Angle brackets in the sanitized markdown source are restored so `<` / `>` work in
 * math (e.g. $0 < \\theta < 1$) and in ordinary text.
 */
export function sanitizeMarkdown(content: string): string {
  // First strip ANSI codes that can cause KaTeX parse errors
  const withoutAnsi = stripAnsiCodes(content);
  const normalizedMath = normalizeMathMarkdown(withoutAnsi);

  // DOMPurify sanitizes HTML, but we're using it on markdown source text
  // This strips any HTML tags that might be embedded in the markdown
  // Streamdown then parses the clean markdown for display
  const sanitized = DOMPurify.sanitize(normalizedMath, {
    // Allow only safe text content - no HTML tags in markdown source
    ALLOWED_TAGS: [], // Empty array means no HTML tags allowed in markdown source
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true, // Keep the text content
  });

  return restoreAngleBracketsAfterDomPurify(sanitized);
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
