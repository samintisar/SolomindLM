import type { Id } from "../_generated/dataModel";

type PaperSourceApi = "openalex" | "arxiv" | "semantic_scholar" | "pubmed";

type EvidenceMetadata = {
  chunkIndex?: number;
  domain?: string;
  publishedAt?: number;
  doi?: string;
  citationCount?: number;
  /** Paper authors and year, so citations and table rows don't read "(Unknown, n.d.)" (#558). */
  authors?: string[];
  year?: number;
  sourceApi?: PaperSourceApi;
  pdfUrl?: string;
};

/** Shape accepted by `internal.research.index.saveEvidence` */
export type SaveEvidenceItem = {
  subQuestionId: string;
  sourceType: string;
  sourceTitle: string;
  sourceUrl?: string;
  content: string;
  relevanceScore?: number;
  credibilityTier?: string;
  iteration: number;
  metadata?: EvidenceMetadata & { documentId?: Id<"documents"> };
};

/**
 * Maps agent evidence entries to Convex `saveEvidence` args.
 * String `documentId` from the agent is cast to `Id<"documents">` when present.
 * Undefined metadata fields are left out, and metadata is omitted when none are set.
 */
export function mapAgentEvidenceForSave(
  evidence: Array<{
    subQuestionId: string;
    sourceType: string;
    sourceTitle: string;
    sourceUrl?: string;
    content: string;
    relevanceScore?: number;
    credibilityTier?: string;
    iteration: number;
    metadata?: EvidenceMetadata & { documentId?: string };
  }>
): SaveEvidenceItem[] {
  return evidence.map((e) => ({
    subQuestionId: e.subQuestionId,
    sourceType: e.sourceType,
    sourceTitle: e.sourceTitle,
    sourceUrl: e.sourceUrl,
    content: e.content,
    relevanceScore: e.relevanceScore,
    credibilityTier: e.credibilityTier,
    iteration: e.iteration,
    metadata: mapMetadata(e.metadata),
  }));
}

function mapMetadata(
  metadata: (EvidenceMetadata & { documentId?: string }) | undefined
): SaveEvidenceItem["metadata"] {
  if (!metadata) return undefined;
  // Copy known fields only: `saveEvidence` rejects keys its validator doesn't list.
  const mapped: NonNullable<SaveEvidenceItem["metadata"]> = {
    documentId: metadata.documentId ? (metadata.documentId as Id<"documents">) : undefined,
    chunkIndex: metadata.chunkIndex,
    domain: metadata.domain,
    publishedAt: metadata.publishedAt,
    doi: metadata.doi,
    citationCount: metadata.citationCount,
    authors: metadata.authors?.length ? metadata.authors : undefined,
    year: metadata.year,
    sourceApi: metadata.sourceApi,
    pdfUrl: metadata.pdfUrl,
  };
  const set = Object.entries(mapped).filter(([, value]) => value !== undefined);
  return set.length > 0 ? (Object.fromEntries(set) as typeof mapped) : undefined;
}
