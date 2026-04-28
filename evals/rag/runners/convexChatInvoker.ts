/**
 * ChatAgentInvoker that calls the real ChatAgent via a Convex action.
 *
 * Uses ConvexHttpClient to invoke the eval action in
 * convex/eval/chatEvalAction.ts. Requires VITE_CONVEX_URL or CONVEX_URL.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { ChatAgentInvoker } from "./chatRunner";
import type { ChatAgentContext } from "../../../convex/_agents/chat/types";
import type { ReferenceChunk } from "../../../convex/storage/ChatHistoryService";

/**
 * Create a ChatAgentInvoker backed by the real Convex ChatAgent.
 *
 * @param convexUrl - Convex deployment URL
 */
export function createConvexChatInvoker(convexUrl: string): ChatAgentInvoker {
  const client = new ConvexHttpClient(convexUrl);

  return {
    async invoke(context: ChatAgentContext) {
      if (!context.noteId) {
        throw new Error(
          "ConvexChatInvoker requires a notebookId (fixture.notebookId) to scope retrieval"
        );
      }

      // Derive the user question from conversation history
      const lastMessage = context.conversationHistory[context.conversationHistory.length - 1];
      if (!lastMessage?.content) {
        throw new Error("No user message in conversation history");
      }

      const result = await client.action(api.eval.chatEvalAction.runChatEval, {
        question: lastMessage.content,
        notebookId: context.noteId,
        documentIds: context.documentIds,
        userId: context.userId,
      });

      return {
        answer: result.answer,
        citations: result.citations,
        subQueries: result.subQueries,
        preRerankChunks: result.preRerankChunks as ReferenceChunk[],
        postRerankChunks: result.postRerankChunks as ReferenceChunk[],
        selectedChunks: result.selectedChunks as ReferenceChunk[],
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage,
      };
    },
  };
}
