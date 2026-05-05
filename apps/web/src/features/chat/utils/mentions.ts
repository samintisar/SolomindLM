import { Source, MentionedSource } from "@/shared/types/index";

/**
 * Filter sources by query (case-insensitive substring match)
 */
export function filterSourcesByQuery(sources: Source[], query: string): Source[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return sources;
  return sources.filter((s) => s.title.toLowerCase().includes(normalizedQuery));
}

/**
 * Combine mentioned document IDs with sidebar-selected IDs, deduplicated
 */
export function combineDocumentIds(mentionedIds: string[], selectedIds: string[]): string[] {
  return [...new Set([...mentionedIds, ...selectedIds])];
}

/**
 * Extract document IDs from mentions
 */
export function getDocumentIdsFromMentions(mentions: MentionedSource[]): string[] {
  return mentions.map((m) => m.documentId);
}

function mentionDisplayToken(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  return t ? `@${t}` : "";
}

/**
 * Prefix persisted user message text with @SourceTitle tokens so chat history stays readable.
 * Document IDs are still sent separately via {@link getDocumentIdsFromMentions}.
 */
export function prependAttachedSourceMentionsToMessage(
  body: string,
  mentions: MentionedSource[]
): string {
  if (mentions.length === 0) return body;
  const tokens = mentions.map((m) => mentionDisplayToken(m.title)).filter(Boolean);
  if (tokens.length === 0) return body;
  const prefix = tokens.join(" ");
  const trimmed = body.trim();
  if (!trimmed) return prefix;
  return `${prefix}\n\n${trimmed}`;
}
