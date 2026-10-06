/**
 * Reference lists (a paper's "References" or "Bibliography" section) name other works without
 * saying anything about the source itself. Studio outputs that extract entities from a source
 * read each cited work as an entity of its own (#350), so they can leave these sections out.
 */

const REFERENCE_SECTION_TITLE =
  /^(?:[\dA-Z]{1,3}[.)]?\s+)?(?:references?(?:\s+and\s+notes)?|reference\s+list|bibliography|works\s+cited|literature\s+cited|cited\s+literature)$/i;

/** A reference-list heading on the first line of a chunk: `## References`, `**Bibliography**`. */
const REFERENCE_HEADING_LINE =
  /^\s*(?:#{1,6}\s*|\*\*)?(?:[\dA-Z]{1,3}[.)]?\s+)?(?:references?(?:\s+and\s+notes)?|reference\s+list|bibliography|works\s+cited|literature\s+cited)(?:\*\*)?:?\s*$/i;

export interface SectionedChunk {
  /** Heading of the section the chunk belongs to, as recorded at chunking time. */
  sectionTitle?: string;
  content: string;
}

/** True when the chunk is part of a reference list. */
export function isReferenceListChunk(chunk: SectionedChunk): boolean {
  const title = chunk.sectionTitle?.trim().replace(/[*:#]/g, "").trim();
  if (title) return REFERENCE_SECTION_TITLE.test(title);
  // Chunks stored without a section title: only one that opens with the heading itself.
  const firstLine = chunk.content.trimStart().split("\n", 1)[0] ?? "";
  return REFERENCE_HEADING_LINE.test(firstLine);
}

/**
 * A heading on a chunk's first line (`## Appendix` or a bold-only line like `**Appendix**`); any
 * heading other than a reference one ends a list.
 */
const ANY_HEADING_LINE = /^\s*(?:#{1,6}\s+\S|\*\*[^*\n]+\*\*:?\s*$)/;

/**
 * The chunks without their reference lists, in their original order. A document whose every chunk
 * is a reference list (an uploaded bibliography) keeps them all, since that list is its content.
 *
 * Chunks with a section title are judged by it. In documents chunked without titles, a chunk that
 * opens with a reference heading starts the list, and the untitled chunks after it (in chunkIndex
 * order) stay in it until another heading or a titled chunk.
 */
export function withoutReferenceLists<
  T extends SectionedChunk & { documentId: string; chunkIndex?: number },
>(chunks: T[]): T[] {
  const byDocument = new Map<string, T[]>();
  for (const chunk of chunks) {
    const list = byDocument.get(chunk.documentId);
    if (list) list.push(chunk);
    else byDocument.set(chunk.documentId, [chunk]);
  }

  const references = new Set<T>();
  const keptPerDocument = new Map<string, number>();
  for (const [documentId, documentChunks] of byDocument) {
    const ordered = [...documentChunks].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
    let inUntitledList = false;
    let kept = 0;
    for (const chunk of ordered) {
      let isReference: boolean;
      if (chunk.sectionTitle?.trim()) {
        inUntitledList = false;
        isReference = isReferenceListChunk(chunk);
      } else {
        const firstLine = chunk.content.trimStart().split("\n", 1)[0] ?? "";
        if (REFERENCE_HEADING_LINE.test(firstLine)) inUntitledList = true;
        else if (ANY_HEADING_LINE.test(firstLine)) inUntitledList = false;
        isReference = inUntitledList;
      }
      if (isReference) references.add(chunk);
      else kept++;
    }
    keptPerDocument.set(documentId, kept);
  }

  return chunks.filter((chunk) => !references.has(chunk) || !keptPerDocument.get(chunk.documentId));
}
