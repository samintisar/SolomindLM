/**
 * Keep spreadsheet map tasks to one source each and say which source they came from. Packing all
 * chunks together put the end of one paper (its reference list) and the start of the next in one
 * task with nothing between them, so studies a paper only cites came back as rows of their own.
 */

export interface SourceChunk {
  documentId: string;
  content: string;
}

export interface SourceMapTask {
  /** The source's title (its file name), or "Source N" when it has none. */
  source: string;
  text: string;
}

/**
 * Pack each source's chunks separately, sources in order of first appearance. `pack` turns one
 * source's chunk texts into map task texts (validation and size packing).
 */
export function packChunksBySource(
  chunks: SourceChunk[],
  titles: Map<string, string>,
  pack: (chunks: string[]) => string[]
): SourceMapTask[] {
  const bySource = new Map<string, string[]>();
  for (const { documentId, content } of chunks) {
    const list = bySource.get(documentId) ?? [];
    list.push(content);
    bySource.set(documentId, list);
  }
  const tasks: SourceMapTask[] = [];
  let position = 0;
  for (const [documentId, contents] of bySource) {
    position++;
    const source = titles.get(documentId)?.trim() || `Source ${position}`;
    for (const text of pack(contents)) tasks.push({ source, text });
  }
  return tasks;
}

/** Text with its source named on the first line, for map input and stored map notes. */
export function labelWithSource(source: string, text: string): string {
  return `SOURCE: ${source}\n\n${text}`;
}
