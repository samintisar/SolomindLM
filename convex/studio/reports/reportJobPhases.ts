"use node";

/**
 * Report generation phase implementations (invoked from thin `job.ts` registrations).
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { packChunks, validateChunks } from "../../_agents/ReportGraph";
import { env } from "../../_lib/env";
import { createJobLogger, createErrorMetadata } from "../../_agents/_shared/logging";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  MAP_SYSTEM_PROMPT,
  MAP_PROMPTS,
  REDUCE_SYSTEM_PROMPT,
  REDUCE_PROMPTS,
} from "../../_agents/report/prompts";
import { MapOutputSchema, type MapOutput } from "../../_agents/report/nodes";
import { z } from "zod";
import { sanitizeUserInput } from "../../_agents/_shared/index";
import { mergeModelKwargs } from "../../_agents/_shared/llm_factory";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { invokeStudioLlm, createLangSmithRunConfig } from "../_job/invokeStudioLlm";

interface MapOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<MapOutput>;
}

function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): MapOutputInvoker {
  return llm.withStructuredOutput(schema, {
    name: "extract_topics_and_summary",
  }) as unknown as MapOutputInvoker;
}

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.REPORT_MAP_CHUNK_TOKENS, 10),
  PER_CHUNK_TIMEOUT_MS: 180000, // Increased from 90s to 180s (3 min) to match other studio jobs
  REDUCE_TIMEOUT_MS: 180000, // Increased from 90s to 180s (3 min)
  MAX_OUTPUT_TOKENS: parseInt(env.REPORT_REDUCE_MAX_OUTPUT_TOKENS, 10),
  MIN_SUMMARY_LENGTH: 50,
} as const;

function createMapLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.FAST_LLM,
    temperature: 0.3,
    timeout: CONFIG.PER_CHUNK_TIMEOUT_MS,
    maxTokens: parseInt(env.REPORT_MAP_MAX_OUTPUT_TOKENS, 10),
    modelKwargs: mergeModelKwargs(env.FAST_LLM, "fast"),
  });
}

function createReduceLLM(modelOverride?: string): ChatTogetherAI {
  const model = modelOverride || env.REPORT_LLM;
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model,
    temperature: 0.5,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: CONFIG.MAX_OUTPUT_TOKENS,
    modelKwargs: mergeModelKwargs(model, "smart"),
  });
}

export type ReportGenerationPhaseArgs = {
  reportId: Id<"reports">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
  reportType?: string;
  customPrompt?: string;
  smartLlm?: string;
};

export type ProcessReportMapChunkArgs = {
  reportId: Id<"reports">;
  userId: string;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
  reportType: string;
  customPrompt?: string;
  smartLlm?: string;
};

export type FinalizeReportPhaseArgs = {
  reportId: Id<"reports">;
  userId: string;
  notebookId: Id<"notebooks">;
  reportType: string;
  customPrompt?: string;
  smartLlm?: string;
};

export async function runReportGenerationPhase(
  ctx: ActionCtx,
  args: ReportGenerationPhaseArgs
): Promise<void> {
  const { reportId, userId, notebookId, documentIds, reportType, customPrompt, smartLlm } = args;

  const logger = createJobLogger({
    jobType: "report",
    jobId: reportId,
    notebookId,
    userId,
  });

  logger.jobStart({
    reportType: reportType || "summary",
    docCount: documentIds.length,
  });

  try {
    logger.phaseStart("initializing", { progress: 5 });
    await ctx.runMutation(internal.studio.jobMutations.reports.updateReportStatus, {
      reportId,
      status: "generating",
      metadata: {
        phase: "initializing",
        progress: 5,
        currentStep: "Initializing...",
      },
    });
    logger.phaseComplete("initializing");

    logger.phaseStart("loading_documents", { progress: 15, docCount: documentIds.length });
    await ctx.runMutation(internal.studio.jobMutations.reports.updateReportStatus, {
      reportId,
      status: "generating",
      metadata: {
        phase: "loading_documents",
        progress: 15,
        currentStep: "Loading documents...",
      },
    });

    const chunkObjects = await ctx.runAction(internal.documents.index.fetchChunks, {
      documentIds,
    });

    const rawChunks = chunkObjects.map((chunk: { content: string }) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    const validatedChunks = validateChunks(rawChunks);
    const packedChunks = packChunks(validatedChunks, CONFIG.MAP_CHUNK_SIZE_TOKENS);

    console.log(
      `[ReportJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`
    );

    if (packedChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    await ctx.runMutation(internal.studio.jobMutations.reports.initReportMapPhase, {
      reportId,
      totalMapTasks: packedChunks.length,
      reportType: reportType || "summary",
      customPrompt,
    });

    for (let i = 0; i < packedChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.reports.job.processReportMapChunk, {
        reportId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: packedChunks.length,
        chunk: packedChunks[i],
        reportType: reportType || "summary",
        customPrompt,
        smartLlm,
      });
      console.log(`[ReportJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: packedChunks.length,
      chunkSizes: packedChunks.map((c) => c.length),
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "initializing");

    logger.jobError(error, {
      phase: "initializing",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.reports.markReportFailed, {
      reportId,
      error: errorMeta.message,
      metadata: {
        phase: "failed",
        errorPhase: "initializing",
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
        failedAt: Date.now(),
      },
    });

    throw error;
  }
}

export async function runProcessReportMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessReportMapChunkArgs
): Promise<void> {
  const { reportId, userId, notebookId, chunkIndex, totalChunks, chunk, reportType, customPrompt, smartLlm } =
    args;

  const logger = createJobLogger({
    jobType: "report",
    jobId: reportId,
    notebookId,
    userId,
  });

  const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
  console.log(`[ReportJob] ${chunkId} Starting map processing`);

  try {
    const report = await ctx.runQuery(internal.studio.reports.index.getInternal, { id: reportId });
    if (!report) {
      console.log(`[ReportJob] ${chunkId} Report deleted, skipping`);
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        { userId: userId as any },
      );
    } catch (e) {
      console.warn("[report] user preference fetch failed, using default language", e instanceof Error ? e.message : String(e));
    }
    const language = userPrefs?.outputLanguage;

    const llm = createMapLLM();
    const structuredLLM = createStructuredLLM(llm, MapOutputSchema);

    const promptTemplate = MAP_PROMPTS[reportType] || MAP_PROMPTS["custom"];
    const prompt = promptTemplate
      .replace("{chunk}", chunk)
      .replace("{customPrompt}", customPrompt ? sanitizeUserInput(customPrompt) : "");

    const structuredPrompt = `${prompt}

IMPORTANT: Respond with a JSON object containing:
1. "topics": An array of 3-5 key topics this section covers
2. "summary": The complete structured summary as described above`;

    console.log(`[ReportJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    const mapOutput = (await invokeStudioLlm({
      invoke: () =>
        (structuredLLM as any).invoke(
          [new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language)), new HumanMessage(structuredPrompt)],
          createLangSmithRunConfig({
            runName: "ReportJob.MapProcess",
            tags: ["agent", "report", "map"],
            metadata: {
              chunkIndex,
              reportType,
              totalChunks,
            },
          })
        ),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "ReportMap",
      onRetry: (attempt, error) => {
        console.log(`[ReportJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    })) as MapOutput;

    const elapsed = Date.now() - startTime;
    console.log(`[ReportJob] ${chunkId} LLM completed in ${elapsed}ms`);

    const result = {
      topics: mapOutput.topics,
      summary: mapOutput.summary,
      processingTimeMs: elapsed,
    };

    await ctx.runMutation(internal.studio.jobMutations.reports.storeReportMapResult, {
      reportId,
      chunkIndex,
      result: JSON.stringify(result),
    });

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed,
      topics: mapOutput.topics,
    });

    const updatedReport = await ctx.runQuery(internal.studio.reports.index.getInternal, {
      id: reportId,
    });
    if (!updatedReport) return;

    const completedMaps = updatedReport.metadata?.mapResults
      ? Object.keys(updatedReport.metadata.mapResults).length
      : 0;
    const totalMaps = updatedReport.metadata?.totalMapTasks || totalChunks;

    console.log(`[ReportJob] Map progress: ${completedMaps}/${totalMaps}`);

    if (completedMaps >= totalMaps) {
      console.log(`[ReportJob] All map tasks complete, scheduling finalization`);
      await ctx.scheduler.runAfter(0, internal.studio.reports.job.finalizeReportPhase, {
        reportId,
        userId,
        notebookId,
        reportType,
        customPrompt,
        smartLlm,
      });
    }
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "map_processing");

    console.error(`[ReportJob] ${chunkId} FAILED:`, errorMeta.message);

    await ctx.runMutation(internal.studio.jobMutations.reports.storeReportMapResult, {
      reportId,
      chunkIndex,
      result: JSON.stringify({
        _error: true,
        errorMessage: errorMeta.message,
        isTimeout: errorMeta.type === "llm_timeout",
      }),
    });

    logger.warn(`Map chunk failed`, {
      chunkIndex,
      error: errorMeta.message,
      errorType: errorMeta.type,
    });

    const report = await ctx.runQuery(internal.studio.reports.index.getInternal, { id: reportId });
    if (!report) return;

    const completedMaps = report.metadata?.mapResults
      ? Object.keys(report.metadata.mapResults).length
      : 0;
    const totalMaps = report.metadata?.totalMapTasks || totalChunks;
    const failedMaps = report.metadata?.mapResults
      ? Object.values(report.metadata.mapResults).filter((r) => {
          try {
            return JSON.parse(String(r))?._error;
          } catch {
            return false;
          }
        }).length
      : 0;

    if (completedMaps >= totalMaps) {
      const successCount = totalMaps - failedMaps;
      console.log(`[ReportJob] All tasks done. Success: ${successCount}/${totalMaps}`);

      if (successCount > 0) {
        await ctx.scheduler.runAfter(0, internal.studio.reports.job.finalizeReportPhase, {
          reportId,
          userId,
          notebookId,
          reportType,
          customPrompt,
          smartLlm,
        });
      } else {
        await ctx.runMutation(internal.studio.jobMutations.reports.markReportFailed, {
          reportId,
          error: "All map tasks failed",
          metadata: {
            phase: "failed",
            errorPhase: "map_processing",
            errorType: "llm_failure",
            failedAt: Date.now(),
          },
        });
      }
    }
  }
}

export async function runFinalizeReportPhase(
  ctx: ActionCtx,
  args: FinalizeReportPhaseArgs
): Promise<void> {
  const { reportId, userId, notebookId, reportType, customPrompt, smartLlm } = args;

  const logger = createJobLogger({
    jobType: "report",
    jobId: reportId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  try {
    const report = await ctx.runQuery(internal.studio.reports.index.getInternal, { id: reportId });
    if (!report) {
      console.log("[ReportJob] Report deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        { userId: userId as any },
      );
    } catch (e) {
      console.warn("[report] user preference fetch failed, using default language", e instanceof Error ? e.message : String(e));
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (report.metadata?.mapResults as Record<string, string>) || {};

    const successfulResults: string[] = [];
    const failedCount = { count: 0 };

    for (const [, resultJson] of Object.entries(mapResults)) {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed._error) {
          failedCount.count++;
        } else {
          successfulResults.push(parsed.summary);
        }
      } catch {
        failedCount.count++;
      }
    }

    console.log(
      `[ReportJob] Finalization: ${successfulResults.length} successful, ${failedCount.count} failed`
    );

    if (successfulResults.length === 0) {
      throw new Error("No successful map results to process");
    }

    await ctx.runMutation(internal.studio.jobMutations.reports.updateReportStatus, {
      reportId,
      status: "generating",
      metadata: {
        phase: "collapsing",
        progress: 60,
        currentStep: "Synthesizing content...",
      },
    });

    const combinedContent = successfulResults.join("\n\n---\n\n");
    console.log(`[ReportJob] Combined content: ${combinedContent.length} chars`);

    await ctx.runMutation(internal.studio.jobMutations.reports.updateReportStatus, {
      reportId,
      status: "generating",
      metadata: {
        phase: "reducing",
        progress: 70,
        currentStep: "Generating final report...",
      },
    });

    const llm = createReduceLLM(smartLlm);
    const promptTemplate = REDUCE_PROMPTS[reportType] || REDUCE_PROMPTS["custom"];

    const prompt = promptTemplate
      .replace("{content}", combinedContent)
      .replace("{customPrompt}", customPrompt ? sanitizeUserInput(customPrompt) : "");

    console.log(`[ReportJob] Reduce prompt: ${prompt.length} chars`);

    const startTime = Date.now();
    const response = (await invokeStudioLlm({
      invoke: () =>
        (llm as any).invoke(
          [new SystemMessage(withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language)), new HumanMessage(prompt)],
          createLangSmithRunConfig({
            runName: "ReportJob.Reduce",
            tags: ["agent", "report", "reduce"],
            metadata: {
              reportType,
              contentLength: combinedContent.length,
            },
          })
        ),
      timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
      phaseLabel: "ReportReduce",
      onRetry: (attempt, error) => {
        console.log(`[ReportJob] Reduce retry ${attempt}/3: ${error.message}`);
      },
    })) as { content: unknown };

    const elapsed = Date.now() - startTime;
    const content =
      typeof response.content === "string" ? response.content : String(response.content);

    console.log(`[ReportJob] Reduce completed in ${elapsed}ms, output: ${content.length} chars`);

    let title = "Report";
    try {
      title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
        chunk: combinedContent.substring(0, 2000),
      });
    } catch {
      console.log("[ReportJob] Title generation failed, using default");
    }

    await ctx.runMutation(internal.studio.jobMutations.reports.saveReportResults, {
      reportId,
      content,
      metadata: {
        title,
        phase: "completed",
        progress: 100,
        completedAt: Date.now(),
        mapSuccessCount: successfulResults.length,
        mapFailedCount: failedCount.count,
      },
    });

    await ctx.runMutation(internal.studio.jobMutations.reports.clearReportMapData, { reportId });

    logger.jobComplete({
      contentLength: content.length,
      title,
      mapSuccess: successfulResults.length,
      mapFailed: failedCount.count,
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "finalization");

    logger.jobError(error, {
      phase: "finalization",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.reports.markReportFailed, {
      reportId,
      error: errorMeta.message,
      metadata: {
        phase: "failed",
        errorPhase: "finalization",
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
        failedAt: Date.now(),
      },
    });

    throw error;
  }
}
