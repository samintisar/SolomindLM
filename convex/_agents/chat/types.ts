"use node";

import type { ChatConfigOverrides } from "./chatConfigOverrides.js";
import type { VectorSearchHandler } from "./vector_search.js";

/**
 * Chunk-level metadata for RAG context.
 * Extracted during chunking and used for retrieval context.
 */
export interface ChunkMetadata {
  totalChunks?: number;
  relativePosition?: number;
  chunkLengthChars?: number;
  wordCount?: number;
  sentenceCount?: number;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  sectionLevel?: number | null;
  headingPath?: string[];
  previousChunkPreview?: string | null;
  nextChunkPreview?: string | null;
  hasCodeBlock?: boolean;
  hasMathNotation?: boolean;
  hasTable?: boolean;
  hasBulletList?: boolean;
  hasNumberedList?: boolean;
  /** User @-mentioned this notebook document — keep in context; do not demote via query reranking */
  userAttached?: boolean;
}

export interface ReferenceChunk {
  id: string;
  sourceId: string;
  /** Notebook document (same for all chunks from one file); use for UI grouping */
  documentId?: string;
  sourceTitle: string;
  /** Original URL for `url` / `youtube` documents — use for opening in browser (fileName may be title or hostname only) */
  sourceUrl?: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
  rrfScore?: number;
  vectorRank?: number;
  keywordRank?: number;
  // Chunk metadata for enhanced context
  metadata?: ChunkMetadata;
}

export interface ChatAgentContext {
  userId: string;
  noteId: string;
  conversationHistory: Array<{ role: string; content: string; metadata?: unknown }>;
  documentIds?: string[];
  /** Document IDs whose full content should be attached to the LLM prompt (not just RAG chunks) */
  attachedDocumentIds?: string[];
  /** When false, skip HyDE, sub-queries, and hybrid/vector search over notebook chunks (e.g. web-only). Default true. */
  enableNotebookSearch?: boolean;
  /** Overrides env CHAT_GROUNDING_MODE when set */
  groundingMode?: "async" | "sync" | "off";
  /** Pre-fetched external source chunks (from web search, etc.) to inject into LLM context */
  externalChunks?: ReferenceChunk[];
  /**
   * Eval only. Retrieval and context selection run as usual, then the stream ends with done right
   * after the references chunk, before any answer generation. Used by the retrieval-only eval runner
   * (`eval:rag -- --retrieval-only`); production never sets it.
   */
  evalRetrievalOnly?: boolean;
  /** Per-notebook chat customization (instruction mode, custom instructions, response length) */
  chatSettings?: {
    instructionMode: "default" | "learningGuide" | "custom";
    customInstructions?: string;
    responseLength: "default" | "longer" | "shorter";
  };
  /** Source filter configuration for retrieval across different channels */
  sourcePolicy?: {
    channels: string[];
    maxResultsPerChannel?: number;
    domainAllowlist?: string[];
    recencyDays?: number;
  };
}

export interface StreamChunk {
  type:
    | "token"
    | "references"
    | "done"
    | "error"
    | "warning"
    | "grounding_check"
    | "grounding_warn"
    | "status"
    | "tool_call"
    | "followups"
    | "clarification";
  data?: any;
  status?: string;
  message?: string;
}

export type GlobalRerankFn = (
  query: string,
  documents: Array<{ id: string; content: string }>
) => Promise<Array<{ id: string; content: string; score?: number }>>;

export interface ChatAgentOptions {
  vectorSearchHandler?: VectorSearchHandler;
  /** Single cached rerank over merged candidates */
  globalRerankFn?: GlobalRerankFn;
  /** Override the chat model; validated by resolveSmartModel. */
  smartModel?: string;
  /** Fetch full document content for single-document list queries */
  fetchDocumentFn?: (documentId: string) => Promise<{
    content: string;
    title?: string;
    sourceUrl?: string;
  } | null>;
  /** Titles of documents, keyed by id: selected sources retrieval found no passage in */
  fetchDocumentTitlesFn?: (documentIds: string[]) => Promise<Record<string, string>>;
  /** Opening passage (chunk 0) of each document, for documents the context draws on (#477) */
  fetchOpeningPassagesFn?: (documentIds: string[]) => Promise<ReferenceChunk[]>;
  /** BCP-47 language code to pass to the LLM wrapper for system prompt language injection. */
  outputLanguage?: string;
  /** Chat knobs to change from production for this agent (eval experiments). Omitted in production. */
  configOverrides?: ChatConfigOverrides;
}
