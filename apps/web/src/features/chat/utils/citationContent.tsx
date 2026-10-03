import type { MarkdownRendererProps } from "@/shared/components/MarkdownRenderer.utils";
import { sanitizeMarkdown } from "@/shared/utils";

/** Compact markdown for a citation excerpt: no media, links as plain text, small type. */
export const citationMarkdownComponents: MarkdownRendererProps["components"] = {
  img: () => null,
  a: ({ children }) => <span className="text-foreground">{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }) => (
    <table className="w-full border-collapse overflow-hidden rounded-lg border border-border text-xs">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border px-2 py-1.5 text-left font-semibold text-foreground last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border px-2 py-1.5 text-foreground last:border-r-0">
      {children}
    </td>
  ),
  h1: ({ children }) => (
    <h1 className="my-2 text-base font-semibold leading-snug first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="my-2 text-base font-semibold leading-snug first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="my-2 text-sm font-semibold leading-snug first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="my-1.5 text-sm font-semibold leading-snug first:mt-0">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="my-1.5 text-sm leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-4 marker:text-muted-foreground">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-4 marker:text-muted-foreground">{children}</ol>
  ),
  li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l border-border pl-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-border/70 bg-secondary/35 p-2 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-secondary/50 px-1 py-0.5 text-xs">{children}</code>
  ),
  inlineCode: ({ children }) => (
    <code className="rounded bg-secondary/50 px-1 py-0.5 text-xs">{children}</code>
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

/** Drops the excerpt's first line when it only repeats the source title shown in the header. */
export function stripLeadingDuplicateTitle(content: string, sourceTitle: string): string {
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

export function getSourceHost(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Removes non-renderable image placeholders that some extracted sources carry in markdown. */
export function stripImageArtifacts(content: string): string {
  const cleaned = content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^\[Image blocked:[^\]]+\]$/i.test(trimmed)) return false;
      if (/^!\\?\[[^\]]*]\(\s*(?:https?:\/\/|\/)\S*\s*\)?$/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/** The excerpt markdown shown in a citation card. */
export function prepareCitationExcerpt(content: string | undefined, sourceTitle: string): string {
  const cleaned = stripImageArtifacts(content ?? "");
  return sanitizeMarkdown(stripLeadingDuplicateTitle(cleaned, sourceTitle));
}
