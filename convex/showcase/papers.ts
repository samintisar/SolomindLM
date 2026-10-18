import { isOpenFullTextLicense } from "../documents/paperIngest";
import { normalizeDoi, type PaperRecord } from "../documents/paperRecord";

export interface ResolvedPaper {
  title: string;
  paperRecord: PaperRecord;
}

/** How a paper source is matched: its DOI, else its title (case-insensitive). */
export function paperKey(paper: { title: string; paperRecord?: { doi?: string } }): string {
  const doi = normalizeDoi(paper.paperRecord?.doi)?.toLowerCase();
  return doi ? `doi:${doi}` : `title:${paper.title.trim().toLowerCase()}`;
}

/**
 * The papers to add: not already in the notebook, openly licensed ones first (their full text can
 * be published), otherwise in discovery order.
 */
export function pickDiscoveredPapers(
  candidates: ResolvedPaper[],
  existingKeys: ReadonlySet<string>,
  needed: number
): ResolvedPaper[] {
  const seen = new Set(existingKeys);
  const fresh: ResolvedPaper[] = [];
  for (const candidate of candidates) {
    const key = paperKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(candidate);
  }
  const isOpen = (p: ResolvedPaper) => isOpenFullTextLicense(p.paperRecord.license);
  return [...fresh.filter(isOpen), ...fresh.filter((p) => !isOpen(p))].slice(
    0,
    Math.max(0, needed)
  );
}
