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
 * Sync mentioned sources with current text.
 * Removes mentions whose text no longer matches, updates indices for valid ones.
 */
export function syncMentions(text: string, mentions: MentionedSource[]): MentionedSource[] {
  return mentions
    .map((mention) => {
      const expectedText = `@${mention.title}`;
      // Check if mention still exists at recorded position
      if (text.slice(mention.startIndex, mention.endIndex) === expectedText) {
        return mention;
      }
      // Try to find it elsewhere in the text
      const newIndex = text.indexOf(expectedText);
      if (newIndex !== -1) {
        return {
          ...mention,
          startIndex: newIndex,
          endIndex: newIndex + expectedText.length,
        };
      }
      // Mention no longer exists in text
      return null;
    })
    .filter((m): m is MentionedSource => m !== null);
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
