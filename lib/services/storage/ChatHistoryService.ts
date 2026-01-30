/**
 * ReferenceChunk type for chat message references.
 * Convex functions live in convex/services/storage/ChatHistoryService.ts;
 * this file provides the type for lib consumers (e.g. chat agents).
 */
export interface ReferenceChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
  rrfScore?: number;
  vectorRank?: number;
  keywordRank?: number;
}
