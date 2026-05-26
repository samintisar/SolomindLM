export type DeepResearchSourceStatus = "usedInAnswer" | "searchedOnly";

export interface ResearchEvidenceRow {
  subQuestionId: string;
  sourceType: string;
  sourceTitle: string;
  sourceUrl?: string;
  content: string;
  relevanceScore?: number;
  metadata?: {
    documentId?: string;
    chunkIndex?: number;
    domain?: string;
    publishedAt?: number;
  };
}

export interface DeepResearchDisplaySource {
  key: string;
  sourceTitle: string;
  sourceUrl?: string;
  sourceType: string;
  contentSnippet: string;
  documentId?: string;
  relevanceScore?: number;
  subQuestionId?: string;
  status: DeepResearchSourceStatus;
  citationIndices: number[];
}

export function sourceKeyFromEvidence(entry: ResearchEvidenceRow): string {
  const docId = entry.metadata?.documentId;
  if (docId) return `doc:${docId}`;
  const url = entry.sourceUrl?.trim();
  if (url) return `url:${url}`;
  return `title:${entry.sourceTitle.trim().toLowerCase()}`;
}

/** Parse inline citation markers like [1], [2] from the final answer. */
export function parseCitationNumbers(content: string): Set<number> {
  const cited = new Set<number>();
  for (const match of content.matchAll(/\[(\d+)\]/g)) {
    const id = Number.parseInt(match[1], 10);
    if (id > 0) cited.add(id);
  }
  return cited;
}

export function orderEvidenceBySubQuestions(
  evidence: ResearchEvidenceRow[],
  subQuestions: Array<{ id: string }>
): ResearchEvidenceRow[] {
  const bySub: Record<string, ResearchEvidenceRow[]> = {};
  for (const entry of evidence) {
    if (!bySub[entry.subQuestionId]) {
      bySub[entry.subQuestionId] = [];
    }
    bySub[entry.subQuestionId].push(entry);
  }
  return subQuestions.flatMap((sq) => bySub[sq.id] ?? []);
}

/**
 * Collapse evidence chunks into unique sources and label whether each was cited in the answer.
 * Citation index N matches evidence row N in the same order as the writer prompt / references payload.
 */
export function buildDeepResearchDisplaySources(
  evidence: ResearchEvidenceRow[],
  answerContent: string,
  subQuestions?: Array<{ id: string }>
): DeepResearchDisplaySource[] {
  const cited = parseCitationNumbers(answerContent);
  const ordered =
    subQuestions && subQuestions.length > 0
      ? orderEvidenceBySubQuestions(evidence, subQuestions)
      : evidence;

  const byKey = new Map<string, DeepResearchDisplaySource>();

  ordered.forEach((entry, index) => {
    const refId = index + 1;
    const key = sourceKeyFromEvidence(entry);
    const existing = byKey.get(key);
    if (existing) {
      existing.citationIndices.push(refId);
      if (entry.content.length > existing.contentSnippet.length) {
        existing.contentSnippet = entry.content.slice(0, 400);
      }
      if ((entry.relevanceScore ?? 0) > (existing.relevanceScore ?? 0)) {
        existing.relevanceScore = entry.relevanceScore;
      }
      return;
    }
    byKey.set(key, {
      key,
      sourceTitle: entry.sourceTitle,
      sourceUrl: entry.sourceUrl,
      sourceType: entry.sourceType,
      contentSnippet: entry.content.slice(0, 400),
      documentId: entry.metadata?.documentId,
      relevanceScore: entry.relevanceScore,
      subQuestionId: entry.subQuestionId,
      status: "searchedOnly",
      citationIndices: [refId],
    });
  });

  const sources = [...byKey.values()];
  for (const source of sources) {
    source.status = source.citationIndices.some((id) => cited.has(id))
      ? "usedInAnswer"
      : "searchedOnly";
  }

  return sources.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "usedInAnswer" ? -1 : 1;
    }
    return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
  });
}
