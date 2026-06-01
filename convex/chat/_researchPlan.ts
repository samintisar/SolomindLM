"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { createResearchAgent } from "./_streamResearch";
import type { StreamSourcePolicy } from "./stream";

export async function runResearchPlanPhase(
  ctx: ActionCtx,
  streamId: string,
  userId: string,
  notebookId: string,
  message: string,
  documentIds: string[] | undefined,
  sourcePolicy: StreamSourcePolicy,
  chunkAppender: (text: string) => Promise<void>,
  conversationId: Id<"conversations">,
  userMessageId: Id<"messages"> | undefined
): Promise<void> {
  const researchLog = createServiceLogger("researchStream", "runResearchPlanPhase", {
    userId,
    notebookId: notebookId as Id<"notebooks">,
  });

  const apiKey = process.env.TOGETHER_API_KEY ?? "";
  const smartModel = process.env.SMART_MODEL ?? "openai/gpt-oss-120b";
  const notebookIdTyped = notebookId as Id<"notebooks">;

  let resolvedUserMessageId = userMessageId;
  if (!resolvedUserMessageId) {
    const lookedUp = await ctx.runQuery(internal.chat.index.getLatestUserMessageIdForPlanInternal, {
      conversationId,
      content: message,
    });
    if (!lookedUp) {
      throw new Error(
        "[ResearchPlan] No user message found for this conversation; cannot attach plan."
      );
    }
    resolvedUserMessageId = lookedUp;
  }

  const agent = await createResearchAgent({
    apiKey,
    smartModel,
    notebookId: notebookIdTyped,
    userId,
    sourcePolicy,
    onProgress: async (phase, subQuestionId, sourcesFound) => {
      await chunkAppender(
        `\n__RESEARCH_PROGRESS:${JSON.stringify({ phase, subQuestionId, sourcesFound })}\n`
      );
    },
    log: researchLog,
  });

  // Phase 1: Generate plan
  const subQuestions = await agent.generatePlan(
    message,
    sourcePolicy as Parameters<typeof agent.generatePlan>[1]
  );

  // Save plan to database
  const planId = await ctx.runMutation(internal.research.index.createResearchPlan, {
    userId,
    notebookId: notebookIdTyped,
    conversationId,
    messageId: resolvedUserMessageId,
    query: message,
    sourcePolicy,
    subQuestions: subQuestions.map((sq) => ({
      id: sq.id,
      question: sq.question,
      searchQueries: sq.searchQueries,
      sourceChannels: sq.sourceChannels,
    })),
  });

  // Stream the plan to the client
  await chunkAppender(
    `\n__RESEARCH_PLAN:${JSON.stringify({ planId, subQuestions, sourcePolicy })}\n`
  );

  // Persist a placeholder assistant message with plan metadata
  await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
    conversationId,
    streamId,
    content: `**Research plan generated** — ${subQuestions.length} sub-questions. Awaiting your approval.`,
    metadata: { researchPlanId: planId, isResearchPlan: true },
  });
}
