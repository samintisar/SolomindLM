import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import { isOpenFullTextLicense } from "../documents/paperIngest";
import { normalizeDoi, type PaperRecord } from "../documents/paperRecord";

export interface ResolvedPaper {
  title: string;
  paperRecord: PaperRecord;
}

/** The title a discovered paper's source is stored under (`documents.fileName`). */
export function paperFileName(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, TEXT_TITLE_MAX_LENGTH).trim();
}

/**
 * How a paper source is matched: its DOI, else its stored title (case-insensitive). A candidate's
 * full title and a stored source's truncated `fileName` normalise to the same key.
 */
export function paperKey(paper: { title: string; paperRecord?: { doi?: string } }): string {
  const doi = normalizeDoi(paper.paperRecord?.doi)?.toLowerCase();
  return doi ? `doi:${doi}` : `title:${paperFileName(paper.title).toLowerCase()}`;
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
