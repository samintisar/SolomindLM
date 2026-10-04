/** Keys shared with convex/documents/getExistingPapers.ts, so imports skip papers already in a notebook. */
export interface DedupablePaper {
  title: string;
  authors: string[];
  doi?: string;
}

export interface ExistingPaperKeys {
  dois: string[];
  titleHashes: string[];
}

export function paperKeys(paper: DedupablePaper): { doi?: string; titleHash?: string } {
  const doi = paper.doi ? paper.doi.toLowerCase().trim() : undefined;
  const firstAuthor = paper.authors?.[0];
  const titleHash =
    paper.title && firstAuthor
      ? `${paper.title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`
      : undefined;
  return { doi: doi || undefined, titleHash };
}

export function splitNewPapers<T extends DedupablePaper>(
  papers: T[],
  existing: ExistingPaperKeys | undefined
): { fresh: T[]; duplicates: T[] } {
  if (!existing) return { fresh: papers, duplicates: [] };
  const dois = new Set(existing.dois);
  const hashes = new Set(existing.titleHashes);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const paper of papers) {
    const { doi, titleHash } = paperKeys(paper);
    const isDuplicate = (doi && dois.has(doi)) || (titleHash && hashes.has(titleHash));
    (isDuplicate ? duplicates : fresh).push(paper);
  }
  return { fresh, duplicates };
}
