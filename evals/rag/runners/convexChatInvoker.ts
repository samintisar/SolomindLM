/**
 * ChatAgentInvoker that calls the real ChatAgent via a Convex action.
 *
 * Uses ConvexHttpClient to invoke the eval action in
 * convex/eval/chatEvalAction.ts. Requires `RAG_EVAL_CONVEX_URL` + `RAG_EVAL_SECRET`,
 * matching Convex deployment env (`RAG_EVALS_ENABLED=true`, `RAG_EVAL_SECRET`).
 */
import { ConvexHttpClient } from "convex/browser";
import type { ChatAgentContext, ReferenceChunk } from "../../../convex/_agents/chat/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EvalHistoryTurn } from "../../../convex/eval/chatEvalAction";
import { toEvalSourcePolicy } from "../sourceChannels";
import type { ChatAgentInvoker } from "./chatRunner";

export interface ConvexChatInvokerOptions {
  evalSecret: string;
}

function toEvalTurn(turn: { role: string; content: string }): EvalHistoryTurn {
  if (turn.role !== "user" && turn.role !== "assistant") {
    throw new Error(`Eval history turn has role "${turn.role}"; expected "user" or "assistant".`);
  }
  return { role: turn.role, content: turn.content };
}

/**
 * Arguments for `api.eval.chatEvalAction.runChatEval`. The last context message is the question;
 * the messages before it are the prior conversation.
 */
export function chatEvalArgsFor(context: ChatAgentContext, evalSecret: string) {
  const turns = context.conversationHistory;
  const lastMessage = turns[turns.length - 1];
  if (!lastMessage?.content) {
    throw new Error("No user message in conversation history");
  }
  const mode = context.chatSettings?.instructionMode ?? "default";
  if (mode === "custom") {
    throw new Error("The chat eval action does not support custom instructions yet.");
  }
  return {
    evalSecret,
    question: lastMessage.content,
    conversationHistory: turns.slice(0, -1).map(toEvalTurn),
    chatSettings: {
      instructionMode: mode === "learningGuide" ? ("learningGuide" as const) : ("default" as const),
    },
  };
}

/**
 * Create a ChatAgentInvoker backed by the real Convex ChatAgent.
 *
 * @param convexUrl - Convex deployment URL (use dev deployment for evals)
 * @param options.evalSecret - Must match `RAG_EVAL_SECRET` on that deployment.
 */
export function createConvexChatInvoker(
  convexUrl: string,
  options: ConvexChatInvokerOptions
): ChatAgentInvoker {
  const client = new ConvexHttpClient(convexUrl);

  return {
    async invoke(context) {
      if (!context.noteId) {
        throw new Error(
          "ConvexChatInvoker requires a notebookId (fixture.notebookId) to scope retrieval"
        );
      }

      const result = await client.action(api.eval.chatEvalAction.runChatEval, {
        ...chatEvalArgsFor(context, options.evalSecret),
        notebookId: context.noteId as Id<"notebooks">,
        documentIds: context.documentIds as Id<"documents">[] | undefined,
        sourcePolicy: context.sourcePolicy,
      });

      return {
        answer: result.answer,
        citations: result.citations,
        subQueries: result.subQueries,
        // Absent when the deployment predates the field.
        failedSubQueries: result.failedSubQueries ?? [],
        preRerankChunks: result.preRerankChunks as ReferenceChunk[],
        postRerankChunks: result.postRerankChunks as ReferenceChunk[],
        selectedChunks: result.selectedChunks as ReferenceChunk[],
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage,
        tokenUsageSource: result.tokenUsageSource ?? "estimated",
        stageSpans: result.stageSpans,
        callCounters: result.callCounters,
        contextTokenBudget: result.contextTokenBudget,
        instructionMode: result.instructionMode,
        sourcePolicy: toEvalSourcePolicy(result.sourcePolicy),
      };
    },
  };
}
