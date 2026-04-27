"use node";

import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import type { VectorSearchHandler } from "./vector_search.js";

export interface ChatAgentContext {
  userId: string;
  noteId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  documentIds?: string[];
  /** When false, skip HyDE, sub-queries, and hybrid/vector search over notebook chunks (e.g. web-only). Default true. */
  enableNotebookSearch?: boolean;
  /** Overrides env CHAT_GROUNDING_MODE when set */
  groundingMode?: "async" | "sync" | "off";
  /** Pre-fetched external source chunks (from Tavily web search, etc.) to inject into LLM context */
  externalChunks?: ReferenceChunk[];
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
}
