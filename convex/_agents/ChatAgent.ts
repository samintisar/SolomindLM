"use node";
/**
 * Chat Agent
 *
 * Orchestrates RAG chat; implementation lives under `chat/`.
 *
 * Main export: ChatAgent class
 */

export { ChatAgent } from "./chat/ChatAgent.js";

export type {
  ChatAgentContext,
  ChatAgentOptions,
  GlobalRerankFn,
  StreamChunk,
} from "./chat/types.js";
