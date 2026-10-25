"use node";

/**
 * Report generation phase implementations (invoked from thin `job.ts` registrations).
 */

import { sanitizeUserInput } from "../../_agents/_shared/index";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { createErrorMetadata, createJobLogger } from "../../_agents/_shared/logging";
import { fillTemplate } from "../../_agents/_shared/promptTemplate";
import { planStudioJobMapPhase } from "../../_agents/_shared/studioExecutionMode";
import {
  aggregateStudioJobTelemetry,
  withStudioTelemetryMetadata,
} from "../../_agents/_shared/studioJobTelemetry";
import { invokeTogetherText } from "../../_agents/_shared/studioTextLlm";
import { countTokens } from "../../_agents/_shared/tokenizer";
import type { TokenUsage } from "../../_agents/_shared/usageAggregate";
import { markSourceReferences } from "../../_agents/chat/passageContext";
import {
  MAP_PROMPTS,
  MAP_STRUCTURED_SYSTEM_PROMPT,
  REDUCE_PROMPTS,
  REDUCE_SYSTEM_PROMPT,
} from "../../_agents/report/prompts";
import { invokeMapStructuredOutput } from "../../_agents/report/structuredLlm";
import {
  joinSmallSourceTasks,
  labelWithSource,
  packChunksBySource,
} from "../../_agents/spreadsheet/sourcePacking";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { env } from "../../_lib/env";
import {
  generateTitleWithinDeadline,
  invokeStudioLlm,
  invokeWithinBudget,
} from "../_job/invokeStudioLlm";
import {
  createJobDeadline,
  STUDIO_FINALIZE_BUDGET_MS,
  STUDIO_SAVE_RESERVE_MS,
} from "../_job/jobDeadline";
import {
  assertMapFailuresAcceptable,
  mapChunkRetryDelayMs,
  mapFailureRate,
} from "../_job/mapFailures";
import { createStudioChunkHelpers } from "../_job/studioChunks";
import { isFailedMapResult } from "./mapResultUtils.js";

const { packChunks, validateChunks } = createStudioChunkHelpers("ReportGraph");

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  MAP_MAX_OUTPUT_TOKENS: 16_384,
  // Convex kills actions at 600s without running their catch blocks, so every
  // LLM call has to give up early enough for the action to record the outcome.
  PER_CHUNK_TIMEOUT_MS: 540_000,
  REDUCE_TIMEOUT_MS: 480_000, // all reduce attempts together
  MAX_OUTPUT_TOKENS: 32_000,
  MIN_SUMMARY_LENGTH: 50,
} as const;

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
  /** 1-based; set when a failed chunk is re-run. */
  attempt?: number;
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

    // Reference lists left out: their entries read as findings of the source itself (#350, #477).
    const fetchedChunks = await ctx.runAction(internal.documents.chunks.fetchChunks, {
      documentIds,
      topic: customPrompt,
      excludeReferenceLists: true,
    });
    // A source's own reference markers become "(ref. 6)", so a sentence reporting a study it
    // cites doesn't read as its own finding (#477).
    const chunkObjects = fetchedChunks.map((chunk) => ({
      documentId: chunk.documentId as string,
      content: markSourceReferences(chunk.content),
    }));
    // Sources left after narrowing to the requested topic (#288).
    const topicDocumentCount = new Set(chunkObjects.map((c) => c.documentId)).size;

    const rawChunks = chunkObjects.map((chunk) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Source titles, so each map task and its notes say which source the findings come from:
    // packed together, one paper's results ran into the next with nothing between them (#477).
    const sourceDocs = await ctx.runQuery(internal.documents.internal.getDocumentsByIds, {
      documentIds: [...new Set(chunkObjects.map((c) => c.documentId))] as Id<"documents">[],
    });
    const sourceTitles = new Map(sourceDocs.map((d) => [d._id as string, d.fileName]));
    const packBySource = (pack: (contents: string[]) => string[]) =>
      packChunksBySource(chunkObjects, sourceTitles, (contents) =>
        pack(validateChunks(contents))
      ).map((task) => labelWithSource(task.source, task.text));

    const validatedChunks = validateChunks(rawChunks);
    const plan = planStudioJobMapPhase({
      documentCount: topicDocumentCount,
      chunks: validatedChunks,
      estimateTokens: countTokens,
      pack: () => [],
    });
    const mapPlan =
      plan.mode === "single_pass"
        ? {
            ...plan,
            skipMapContent: packBySource((contents) => [contents.join("\n\n")]).join("\n\n---\n\n"),
          }
        : {
            ...plan,
            // Short sources share a task (each keeps its label), so many small sources don't
            // each cost a map call.
            mapChunks: joinSmallSourceTasks(
              packBySource((contents) => packChunks(contents, CONFIG.MAP_CHUNK_SIZE_TOKENS)),
              CONFIG.MAP_CHUNK_SIZE_TOKENS,
              countTokens
            ),
          };

    console.log(
      `[ReportJob] Planned ${validatedChunks.length} validated chunks into ${mapPlan.mapChunks.length} map tasks (${mapPlan.mode})`
    );

    if (mapPlan.mode === "single_pass" && mapPlan.skipMapContent) {
      await ctx.runMutation(internal.studio.jobMutations.reports.initReportMapPhase, {
        reportId,
        totalMapTasks: 1,
        reportType: reportType || "summary",
        customPrompt,
      });

      await ctx.runMutation(internal.studio.jobMutations.reports.storeReportMapResult, {
        reportId,
        chunkIndex: 0,
        result: JSON.stringify({
          topics: [],
          summary: mapPlan.skipMapContent,
          processingTimeMs: 0,
        }),
      });

      await ctx.scheduler.runAfter(0, internal.studio.reports.job.finalizeReportPhase, {
        reportId,
        userId,
        notebookId,
        reportType: reportType || "summary",
        customPrompt,
        smartLlm,
      });

      logger.info("Map phase skipped", {
        totalMapTasks: 1,
        executionMode: mapPlan.mode,
      });
      return;
    }

    if (mapPlan.mapChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    await ctx.runMutation(internal.studio.jobMutations.reports.initReportMapPhase, {
      reportId,
      totalMapTasks: mapPlan.mapChunks.length,
      reportType: reportType || "summary",
      customPrompt,
    });

    for (let i = 0; i < mapPlan.mapChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.reports.job.processReportMapChunk, {
        reportId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: mapPlan.mapChunks.length,
        chunk: mapPlan.mapChunks[i],
        reportType: reportType || "summary",
        customPrompt,
        smartLlm,
      });
      console.log(`[ReportJob] Scheduled map task ${i + 1}/${mapPlan.mapChunks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: mapPlan.mapChunks.length,
      chunkSizes: mapPlan.mapChunks.map((c) => c.length),
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
  const {
    reportId,
    userId,
    notebookId,
    chunkIndex,
    totalChunks,
    chunk,
    reportType,
    customPrompt,
    smartLlm,
  } = args;

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
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[report] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const promptTemplate = MAP_PROMPTS[reportType] || MAP_PROMPTS["custom"];
    const prompt = fillTemplate(promptTemplate, {
      chunk,
      customPrompt: customPrompt ? sanitizeUserInput(customPrompt) : "",
    });

    const customFocus = customPrompt?.trim();
    let structuredPrompt = `${prompt}

IMPORTANT: Respond with a JSON object containing:
1. "topics": An array of 1-5 key topics this section covers
2. "summary": The complete structured summary as described above`;
    if (customFocus && reportType !== "custom") {
      structuredPrompt =
        `ADDITIONAL USER REQUIREMENTS (highest priority — MUST follow):\n${sanitizeUserInput(customFocus)}\n\n` +
        structuredPrompt;
    }

    console.log(`[ReportJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    let tokenUsage: TokenUsage | undefined;
    const mapOutput = await invokeStudioLlm({
      invoke: () =>
        invokeMapStructuredOutput({
          systemPrompt: withLanguageInstruction(MAP_STRUCTURED_SYSTEM_PROMPT, language),
          userPrompt: structuredPrompt,
          model: env.FAST_LLM,
          maxTokens: CONFIG.MAP_MAX_OUTPUT_TOKENS,
          temperature: 0.3,
          onUsage: (usage) => {
            tokenUsage = usage;
          },
        }),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "ReportMap",
      // Map retries live inside invokeMapStructuredOutput (json_schema → json_object fallback).
      retry: { maxAttempts: 1 },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[ReportJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Notes keep the source lines of their task, so the reduce knows whose findings each set of
    // notes holds (#477). A task can hold several short sources.
    const sourceLines = chunk.match(/^SOURCE: .+$/gm) ?? [];
    const result = {
      topics: mapOutput.topics,
      summary:
        sourceLines.length > 0
          ? `${sourceLines.join("\n")}\n\n${mapOutput.summary}`
          : mapOutput.summary,
      processingTimeMs: elapsed,
      ...(tokenUsage !== undefined ? { tokenUsage } : {}),
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
    const retryDelayMs = mapChunkRetryDelayMs(args.attempt);
    if (retryDelayMs !== null) {
      console.warn(
        `[reports] map chunk ${args.chunkIndex + 1} failed on attempt ${args.attempt ?? 1}, retrying in ${retryDelayMs}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await ctx.scheduler.runAfter(
        retryDelayMs,
        internal.studio.reports.job.processReportMapChunk,
        {
          ...args,
          attempt: (args.attempt ?? 1) + 1,
        }
      );
      return;
    }

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
      ? Object.values(report.metadata.mapResults).filter((r) => isFailedMapResult(r)).length
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

  const deadline = createJobDeadline(STUDIO_FINALIZE_BUDGET_MS);

  try {
    const report = await ctx.runQuery(internal.studio.reports.index.getInternal, { id: reportId });
    if (!report) {
      console.log("[ReportJob] Report deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[report] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (report.metadata?.mapResults as Record<string, string>) || {};

    const successfulResults: string[] = [];
    const failedCount = { count: 0 };

    for (const [, resultJson] of Object.entries(mapResults)) {
      if (isFailedMapResult(resultJson)) {
        failedCount.count++;
        continue;
      }
      try {
        const parsed = JSON.parse(resultJson) as { summary?: string };
        if (typeof parsed.summary === "string") {
          successfulResults.push(parsed.summary);
        } else {
          failedCount.count++;
        }
      } catch {
        failedCount.count++;
      }
    }

    console.log(
      `[ReportJob] Finalization: ${successfulResults.length} successful, ${failedCount.count} failed`
    );

    assertMapFailuresAcceptable(Object.keys(mapResults).length, failedCount.count);

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

    const reduceModel = smartLlm || env.REPORT_LLM;
    const promptTemplate = REDUCE_PROMPTS[reportType] || REDUCE_PROMPTS["custom"];

    let prompt = fillTemplate(promptTemplate, {
      content: combinedContent,
      customPrompt: customPrompt ? sanitizeUserInput(customPrompt) : "",
    });

    const customFocus = customPrompt?.trim();
    if (customFocus && reportType !== "custom") {
      prompt =
        `ADDITIONAL USER REQUIREMENTS (highest priority — MUST follow):\n${sanitizeUserInput(customFocus)}\n\n` +
        prompt;
    }

    console.log(`[ReportJob] Reduce prompt: ${prompt.length} chars`);

    const startTime = Date.now();
    let reduceUsage: TokenUsage | undefined;
    let content = await invokeWithinBudget({
      invoke: () =>
        invokeTogetherText({
          systemPrompt: withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language),
          userPrompt: prompt,
          model: reduceModel,
          maxTokens: CONFIG.MAX_OUTPUT_TOKENS,
          temperature: 0.5,
          reasoningEnabled: true,
          onUsage: (usage) => {
            reduceUsage = usage;
          },
        }),
      timeoutMs: deadline.stepTimeoutMs(CONFIG.REDUCE_TIMEOUT_MS, STUDIO_SAVE_RESERVE_MS),
      phaseLabel: "ReportReduce",
      onRetry: (attempt, error) => {
        console.log(`[ReportJob] Reduce retry ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;

    if (failedCount.count > 0) {
      const omitted = failedCount.count === 1 ? "section" : "sections";
      content =
        `> **Note:** ${failedCount.count} source ${omitted} could not be processed and are omitted from this report.\n\n` +
        content;
    }

    console.log(`[ReportJob] Reduce completed in ${elapsed}ms, output: ${content.length} chars`);

    let title = "Report";
    try {
      title = await generateTitleWithinDeadline(
        deadline,
        combinedContent.substring(0, 2000),
        "ReportTitle"
      );
    } catch {
      console.log("[ReportJob] Title generation failed, using default");
    }

    await ctx.runMutation(internal.studio.jobMutations.reports.saveReportResults, {
      reportId,
      content,
      metadata: withStudioTelemetryMetadata(
        {
          title,
          phase: "completed",
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount: successfulResults.length,
          mapFailedCount: failedCount.count,
        },
        aggregateStudioJobTelemetry({
          mapResults: Object.values(mapResults),
          reduce: { latencyMs: elapsed, tokenUsage: reduceUsage },
        })
      ),
    });

    await ctx.runMutation(internal.studio.jobMutations.reports.clearReportMapData, { reportId });

    // Consume rate limit token on success
    await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
      userId,
      feature: "report",
    });

    logger.jobComplete({
      contentLength: content.length,
      title,
      mapSuccess: successfulResults.length,
      mapFailed: failedCount.count,
      mapFailureRate: mapFailureRate(Object.keys(mapResults).length, failedCount.count),
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
