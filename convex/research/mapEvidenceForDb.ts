import type { Id } from "../_generated/dataModel";

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
  metadata?: {
    documentId?: Id<"documents">;
    chunkIndex?: number;
    domain?: string;
    publishedAt?: number;
  };
};

/**
 * Maps agent evidence entries to Convex `saveEvidence` args.
 * String `documentId` from the agent is cast to `Id<"documents">` when present.
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
    metadata?: {
      documentId?: string;
      chunkIndex?: number;
      domain?: string;
      publishedAt?: number;
    };
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
    metadata:
      e.metadata &&
      (e.metadata.documentId !== undefined ||
        e.metadata.chunkIndex !== undefined ||
        e.metadata.domain !== undefined ||
        e.metadata.publishedAt !== undefined)
        ? {
            documentId: e.metadata.documentId
              ? (e.metadata.documentId as Id<"documents">)
              : undefined,
            chunkIndex: e.metadata.chunkIndex,
            domain: e.metadata.domain,
            publishedAt: e.metadata.publishedAt,
          }
        : undefined,
  }));
}
