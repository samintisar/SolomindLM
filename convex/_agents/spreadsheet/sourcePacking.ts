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
  const baseTitles = [...bySource.keys()].map(
    (documentId, i) => titles.get(documentId)?.trim() || `Source ${i + 1}`
  );
  // Sources that share a title are numbered in order, skipping any label another source already
  // has, so every source's notes stay distinct.
  const titleCounts = new Map<string, number>();
  for (const title of baseTitles) titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  const taken = new Set(baseTitles.filter((title) => titleCounts.get(title) === 1));
  const nextNumber = new Map<string, number>();

  const tasks: SourceMapTask[] = [];
  [...bySource.values()].forEach((contents, i) => {
    const title = baseTitles[i];
    let source = title;
    if ((titleCounts.get(title) ?? 0) > 1) {
      let n = nextNumber.get(title) ?? 1;
      while (taken.has(`${title} (${n})`)) n++;
      source = `${title} (${n})`;
      nextNumber.set(title, n + 1);
      taken.add(source);
    }
    for (const text of pack(contents)) tasks.push({ source, text });
  });
  return tasks;
}

/** Text with its source named on the first line, for map input and stored map notes. */
export function labelWithSource(source: string, text: string): string {
  return `SOURCE: ${source}\n\n${text}`;
}
