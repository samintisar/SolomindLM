"use node";

import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { env } from "../_lib/env.js";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { mapAgentEvidenceForSave } from "../research/mapEvidenceForDb";
import { resolveResearchTitle } from "../research/resolveResearchTitle";
import { createResearchAgent } from "./_streamResearch";

export interface ResearchExecuteArgs {
  streamId: string;
  runId: Id<"researchRuns">;
  userId: string;
}

export async function runResearchExecuteImpl(
  ctx: ActionCtx,
  args: ResearchExecuteArgs
): Promise<void> {
  const { streamId, runId, userId } = args;

  const rawAddChunk = async (text: string) => {
    if (!text) return;
    await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
      streamId,
      text,
      final: false,
    });
  };

  const chunkAppender = async (text: string) => {
    if (!text) return;
    await rawAddChunk(text);
  };

  let fullResponse = "";
  let conversationIdForPersist: Id<"conversations"> | undefined;

  try {
    await ctx.runMutation(internal.research.index.updateRunProgress, {
      runId,
      status: "running",
    });

    const run = await ctx.runQuery(internal.research.index.getRunInternal, { runId });
    if (!run) throw new Error("Run not found");

    const plan = await ctx.runQuery(internal.research.index.getPlanInternal, {
      planId: run.planId,
    });
    if (!plan) throw new Error("Plan not found");
    conversationIdForPersist = plan.conversationId;

    const researchLog = createServiceLogger("chatStream", "researchExecute", {
      userId,
      notebookId: plan.notebookId,
    });
    researchLog.operationStart({ runId: String(runId), planId: String(run.planId) });

    const apiKey = env.TOGETHER_AI_API_KEY;
    const smartModel = env.SMART_LLM;

    const agent = await createResearchAgent({
      apiKey,
      smartModel,
      ctx,
      researchId: String(runId),
      notebookId: plan.notebookId,
      userId,
      sourcePolicy: plan.sourcePolicy as {
        channels: string[];
        academicFilters?: Record<string, unknown>;
      },
      onProgress: async (phase, subQuestionId, sourcesFound) => {
        await chunkAppender(
          `\n__RESEARCH_PROGRESS:${JSON.stringify({ phase, subQuestionId, sourcesFound })}\n`
        );
      },
      log: researchLog,
    });

    const conversationTurns = await ctx.runQuery(
      internal.chat.index.getRecentConversationTurnsForResearchInternal,
      {
        conversationId: plan.conversationId,
        maxMessages: 24,
      }
    );

    const context = {
      userId,
      notebookId: String(plan.notebookId),
      conversationHistory: conversationTurns,
    };

    const gen = agent.executeResearch(
      plan.query,
      plan.subQuestions.map((sq: any) => ({ ...sq, status: "pending" as const })),
      plan.sourcePolicy as any,
      context
    );

    let researchReferences: unknown[] = [];

    for await (const chunk of gen) {
      if (chunk.type === "evidence") {
        const mapped = mapAgentEvidenceForSave(chunk.data);
        if (mapped.length > 0) {
          await ctx.runMutation(internal.research.index.saveEvidence, {
            runId,
            evidence: mapped,
          });
        }
      } else if (chunk.type === "token") {
        fullResponse += chunk.data ?? "";
        await chunkAppender(chunk.data ?? "");
      } else if (chunk.type === "references") {
        researchReferences = chunk.data ?? [];
        await chunkAppender(`\n__REFERENCES:${JSON.stringify(chunk.data)}\n`);
      } else if (chunk.type === "done") {
        await chunkAppender(`\n__DONE\n`);
      }
    }

    // Persist assistant message (skip if conversation was deleted mid-flight)
    const contentFinal = fullResponse.trim() || "Research completed but produced no output.";
    const persistResult = await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
      conversationId: plan.conversationId,
      streamId,
      content: contentFinal,
      references: researchReferences.length > 0 ? researchReferences : undefined,
      metadata: { researchRunId: runId, isResearchResult: true },
    });

    if (persistResult.messageId === null) {
      await ctx.runMutation(internal.research.index.updateRunProgress, {
        runId,
        status: "cancelled",
      });
      researchLog.warn("research_cancelled_conversation_deleted", { runId: String(runId) });
      return;
    }

    const evidenceRows = await ctx.runQuery(internal.research.index.getRunEvidenceInternal, {
      runId,
    });
    if (evidenceRows.length > 0) {
      const baseTitle = await resolveResearchTitle(ctx, {
        query: plan.query,
        researchTitle: plan.researchTitle,
        finalResponse: contentFinal,
      });

      const { tableId, reportId } = await ctx.runMutation(
        internal.research.index.createResearchArtifacts,
        {
          researchId: String(runId),
          notebookId: plan.notebookId,
          userId: plan.userId,
          query: plan.query,
          researchTitle: baseTitle,
          evidence: evidenceRows.map((e) => ({
            subQuestionId: e.subQuestionId,
            sourceType: e.sourceType,
            sourceTitle: e.sourceTitle,
            sourceUrl: e.sourceUrl,
            content: e.content,
            relevanceScore: e.relevanceScore,
            metadata: e.metadata,
          })),
          finalResponse: contentFinal,
          subQuestions: plan.subQuestions.map((sq: { id: string; question: string }) => ({
            id: sq.id,
            question: sq.question,
          })),
        }
      );

      await ctx.runMutation(internal.research.index.updateRunArtifacts, {
        runId,
        tableId,
        reportId,
      });

      if (!plan.researchTitle?.trim()) {
        await ctx.runMutation(internal.research.index.setPlanResearchTitle, {
          planId: run.planId,
          researchTitle: baseTitle,
        });
      }
    }

    await ctx.runMutation(internal.research.index.updateRunProgress, {
      runId,
      status: "completed",
    });

    researchLog.operationComplete({ runId: String(runId) });
  } catch (e) {
    const failLog = createServiceLogger("chatStream", "researchExecute", {
      userId,
    });
    failLog.operationError(e, { runId: String(runId) });
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    await ctx.runMutation(internal.research.index.updateRunProgress, {
      runId,
      status: "failed",
      error: errorMessage,
    });
    try {
      await chunkAppender(`\n__ERROR:${JSON.stringify({ message: errorMessage })}\n`);
    } catch (streamErr) {
      failLog.warn("research_error_stream_failed", { error: String(streamErr) });
    }
    if (conversationIdForPersist) {
      try {
        const trimmed = fullResponse.trim();
        const tombstoneResult = await ctx.runMutation(
          internal.chat.index.persistAssistantFromStream,
          {
            conversationId: conversationIdForPersist,
            streamId,
            content:
              trimmed.length > 0
                ? `${fullResponse}\n\n_⚠️ Research run failed before completing. Please try again._`
                : "Research run failed before producing a response. Please try again.",
            metadata: {
              researchRunId: runId,
              isResearchResult: true,
              hadStreamError: true,
              researchError: errorMessage.slice(0, 500),
            },
          }
        );
        if (tombstoneResult.messageId === null) {
          failLog.warn("research_tombstone_skipped_conversation_deleted", { runId: String(runId) });
        }
      } catch (persistErr) {
        failLog.error("research_tombstone_persist_failed", persistErr);
      }
    }
  } finally {
    try {
      await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
        streamId,
        text: "",
        final: true,
      });
    } catch (flushErr) {
      const flushLog = createServiceLogger("chatStream", "researchExecute", {
        userId,
      });
      flushLog.error("stream_flush_failed", flushErr);
    }
  }
}
