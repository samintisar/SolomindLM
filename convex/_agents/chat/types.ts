"use node";

import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import type { VectorSearchHandler } from "./vector_search.js";

export interface ChatAgentContext {
  userId: string;
  noteId: string;
  conversationHistory: Array<{ role: string; content: string; metadata?: unknown }>;
  documentIds?: string[];
  /** When false, skip HyDE, sub-queries, and hybrid/vector search over notebook chunks (e.g. web-only). Default true. */
  enableNotebookSearch?: boolean;
  /** Overrides env CHAT_GROUNDING_MODE when set */
  groundingMode?: "async" | "sync" | "off";
  /** Pre-fetched external source chunks (from Tavily web search, etc.) to inject into LLM context */
  externalChunks?: ReferenceChunk[];
  /** Per-notebook chat customization (instruction mode, custom instructions, response length) */
  chatSettings?: {
    instructionMode: "default" | "learningGuide" | "custom";
    customInstructions?: string;
    responseLength: "default" | "longer" | "shorter";
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
  /** Override the smart model (instead of using env.SMART_LLM) */
  smartModel?: string;
  /** Fetch full document content for single-document list queries */
  fetchDocumentFn?: (documentId: string) => Promise<{ content: string } | null>;
  /** BCP-47 language code to pass to the LLM wrapper for system prompt language injection. */
  outputLanguage?: string;
}
