"use node";

/**
 * Spreadsheet generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { allWithConcurrency, sanitizeUserInput } from "../../_agents/_shared/index";
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
import { addTokenUsage, type TokenUsage } from "../../_agents/_shared/usageAggregate";
import {
  checkCsvTable,
  cleanCsvOutput,
  withoutPipelineWording,
} from "../../_agents/spreadsheet/csvHelpers";
import { resolveSpreadsheetRequest } from "../../_agents/spreadsheet/presetRequests";
import {
  COLLAPSE_PROMPT,
  COLLAPSE_SYSTEM_PROMPT,
  MAP_PROMPT,
  MAP_SYSTEM_PROMPT,
  REDUCE_PROMPT,
  REDUCE_SYSTEM_PROMPT,
  ROW_PLAN_PROMPT,
  ROW_PLAN_SYSTEM_PROMPT,
} from "../../_agents/spreadsheet/prompts";
import { alignRowsToPlan, formatRowPlan, parseRowPlan } from "../../_agents/spreadsheet/rowPlan";
import { labelWithSource, packChunksBySource } from "../../_agents/spreadsheet/sourcePacking";
import { spreadsheetTitleSource } from "../../_agents/spreadsheet/title";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { env } from "../../_lib/env";
import { planCollapseGroups, shouldStopCollapsing } from "../_job/collapsePlan";
import {
  generateTitleWithinDeadline,
  invokeStudioLlm,
  invokeWithinBudget,
} from "../_job/invokeStudioLlm";
import {
  createJobDeadline,
  type JobDeadline,
  STUDIO_FINALIZE_BUDGET_MS,
  STUDIO_SAVE_RESERVE_MS,
} from "../_job/jobDeadline";
import {
  assertMapFailuresAcceptable,
  mapChunkRetryDelayMs,
  mapFailureRate,
} from "../_job/mapFailures";
import { createStudioChunkHelpers } from "../_job/studioChunks";

const { packChunks, validateChunks } = createStudioChunkHelpers("SpreadsheetGraph");

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  REDUCE_CHUNK_SIZE_TOKENS: 15_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 300_000, // 5 minutes
  COLLAPSE_CONCURRENCY: 5,
  REDUCE_RESERVE_MS: 270_000, // held back from collapse rounds: up to 240s of reduce + save
  MIN_COLLAPSE_CALL_MS: 60_000, // skip collapse calls below this per-call budget
  // Largest combined collapse output sent to the reduce call; beyond this the
  // prompt cannot fit the model context alongside a 32k-token response.
  REDUCE_MAX_INPUT_TOKENS: 100_000,
  ROW_PLAN_TIMEOUT_MS: 90_000,
  ROW_PLAN_RESERVE_MS: 210_000, // left for the reduce and save after planning rows
  MIN_ROW_PLAN_CALL_MS: 20_000, // skip planning below this budget; the reduce picks rows itself
  REDUCE_ATTEMPTS: 2, // a malformed table is written once more, then the job fails (#567)
  MIN_REDUCE_RETRY_MS: 60_000, // no second reduce below this budget
} as const;

export type SpreadsheetGenerationPhaseArgs = {
  spreadsheetId: Id<"spreadsheets">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
  spreadsheetType?: string;
  customPrompt?: string;
};

export type ProcessSpreadsheetMapChunkPhaseArgs = {
  spreadsheetId: Id<"spreadsheets">;
  userId: string;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  /** 1-based; set when a failed chunk is re-run. */
  attempt?: number;
  totalChunks: number;
  chunk: string;
  spreadsheetType: string;
  customPrompt: string;
  /** Title of the source this chunk comes from (map tasks never span two sources). */
  sourceTitle?: string;
};

export type FinalizeSpreadsheetPhaseArgs = {
  spreadsheetId: Id<"spreadsheets">;
  userId: string;
  notebookId: Id<"notebooks">;
  spreadsheetType: string;
  customPrompt: string;
};

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runSpreadsheetGenerationPhase(
  ctx: ActionCtx,
  args: SpreadsheetGenerationPhaseArgs
): Promise<void> {
  const { spreadsheetId, userId, notebookId, documentIds, spreadsheetType, customPrompt } = args;
  // Later phases get the resolved request, so a preset runs its own request (#451).
  const { request, topic } = resolveSpreadsheetRequest(spreadsheetType || "custom", customPrompt);

  // Initialize structured logger
  const logger = createJobLogger({
    jobType: "spreadsheet",
    jobId: spreadsheetId,
    notebookId,
    userId,
  });

  logger.jobStart({
    spreadsheetType: spreadsheetType || "custom",
    docCount: documentIds.length,
  });

  try {
    // Phase: Initializing
    logger.phaseStart("initializing", { progress: 5 });
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.updateSpreadsheetStatus, {
      spreadsheetId,
      status: "generating",
      metadata: {
        phase: "initializing",
        progress: 5,
        currentStep: "Initializing...",
      },
    });
    logger.phaseComplete("initializing");

    // Phase: Loading documents
    logger.phaseStart("loading_documents", { progress: 15, docCount: documentIds.length });
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.updateSpreadsheetStatus, {
      spreadsheetId,
      status: "generating",
      metadata: {
        phase: "loading_documents",
        progress: 15,
        currentStep: "Loading documents...",
      },
    });

    // Get document chunks
    const chunkObjects = await ctx.runAction(internal.documents.chunks.fetchChunks, {
      documentIds,
      topic,
      excludeReferenceLists: true,
    });
    // Sources left after narrowing to the requested topic (#288).
    const topicDocumentCount = new Set(chunkObjects.map((c) => c.documentId)).size;

    // Extract content from chunk objects
    const rawChunks = chunkObjects.map((chunk) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Source titles, so map tasks and notes say which source they came from.
    const sourceDocs = await ctx.runQuery(internal.documents.internal.getDocumentsByIds, {
      documentIds: [...new Set(chunkObjects.map((c) => c.documentId))],
    });
    const sourceTitles = new Map(sourceDocs.map((d) => [d._id as string, d.fileName]));

    // Validate chunks; map tasks are packed per source below, never mixing two sources.
    const validatedChunks = validateChunks(rawChunks);
    const mapPlan = planStudioJobMapPhase({
      documentCount: topicDocumentCount,
      chunks: validatedChunks,
      estimateTokens: countTokens,
      pack: () => [],
    });
    const mapTasks =
      mapPlan.mode === "map_reduce"
        ? packChunksBySource(chunkObjects, sourceTitles, (contents) =>
            packChunks(validateChunks(contents), CONFIG.MAP_CHUNK_SIZE_TOKENS)
          )
        : [];

    console.log(
      `[SpreadsheetJob] Planned ${validatedChunks.length} validated chunks from ${sourceTitles.size} sources into ${mapTasks.length} map tasks (${mapPlan.mode})`
    );

    if (mapPlan.mode === "single_pass" && mapPlan.skipMapContent) {
      await ctx.runMutation(internal.studio.jobMutations.spreadsheets.initSpreadsheetMapPhase, {
        spreadsheetId,
        totalMapTasks: 1,
        spreadsheetType: spreadsheetType || "custom",
        customPrompt: request,
      });

      await ctx.runMutation(internal.studio.jobMutations.spreadsheets.storeSpreadsheetMapResult, {
        spreadsheetId,
        chunkIndex: 0,
        result: JSON.stringify({
          output: labelWithSource(
            [...sourceTitles.values()][0] ?? "Source 1",
            mapPlan.skipMapContent
          ),
          processingTimeMs: 0,
        }),
      });

      await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.finalizeSpreadsheetPhase, {
        spreadsheetId,
        userId,
        notebookId,
        spreadsheetType: spreadsheetType || "custom",
        customPrompt: request,
      });

      logger.info("Map phase skipped", {
        totalMapTasks: 1,
        executionMode: mapPlan.mode,
      });
      return;
    }

    if (mapTasks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.initSpreadsheetMapPhase, {
      spreadsheetId,
      totalMapTasks: mapTasks.length,
      spreadsheetType: spreadsheetType || "custom",
      customPrompt: request,
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < mapTasks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.processSpreadsheetMapChunk, {
        spreadsheetId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: mapTasks.length,
        chunk: mapTasks[i].text,
        spreadsheetType: spreadsheetType || "custom",
        customPrompt: request,
        sourceTitle: mapTasks[i].source,
      });
      console.log(`[SpreadsheetJob] Scheduled map task ${i + 1}/${mapTasks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: mapTasks.length,
      sourceCount: sourceTitles.size,
      chunkSizes: mapTasks.map((t) => t.text.length),
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "initializing");

    logger.jobError(error, {
      phase: "initializing",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.markSpreadsheetFailed, {
      spreadsheetId,
      error: errorMeta.message,
      metadata: {
        phase: "failed",
        progress: 0,
        failedAt: Date.now(),
        errorPhase: "initializing",
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
        stack: errorMeta.stackTrace,
      },
    });

    throw error;
  }
}

// ============================================================
// PHASE 2: Process Individual Map Chunk
// ============================================================

export async function runProcessSpreadsheetMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessSpreadsheetMapChunkPhaseArgs
): Promise<void> {
  const {
    spreadsheetId,
    userId,
    notebookId,
    chunkIndex,
    totalChunks,
    chunk,
    spreadsheetType,
    customPrompt,
    sourceTitle,
  } = args;

  const logger = createJobLogger({
    jobType: "spreadsheet",
    jobId: spreadsheetId,
    notebookId,
    userId,
  });

  const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
  console.log(`[SpreadsheetJob] ${chunkId} Starting map processing`);

  try {
    // Check if spreadsheet still exists
    const spreadsheet = await ctx.runQuery(internal.studio.spreadsheets.index.getInternal, {
      id: spreadsheetId,
    });
    if (!spreadsheet) {
      console.log(`[SpreadsheetJob] ${chunkId} Spreadsheet deleted, skipping`);
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[spreadsheet] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const prompt = fillTemplate(MAP_PROMPT, {
      chunk: sourceTitle ? labelWithSource(sourceTitle, chunk) : chunk,
      customPrompt: sanitizeUserInput(customPrompt || ""),
    });

    console.log(`[SpreadsheetJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    let tokenUsage: TokenUsage | undefined;
    const mapOutput = await invokeStudioLlm({
      invoke: () =>
        invokeTogetherText({
          systemPrompt: withLanguageInstruction(MAP_SYSTEM_PROMPT, language),
          userPrompt: prompt,
          model: env.FAST_LLM,
          maxTokens: 8_192,
          temperature: 0.3,
          onUsage: (usage) => {
            tokenUsage = usage;
          },
        }),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "SpreadsheetMap",
      onRetry: (attempt, error) => {
        console.log(`[SpreadsheetJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;

    console.log(
      `[SpreadsheetJob] ${chunkId} LLM completed in ${elapsed}ms, output: ${mapOutput.length} chars`
    );

    // Store result
    // Notes keep their source, so collapse and reduce know which source each fact came from.
    const result = {
      output: sourceTitle ? labelWithSource(sourceTitle, mapOutput) : mapOutput,
      processingTimeMs: elapsed,
      ...(tokenUsage !== undefined ? { tokenUsage } : {}),
    };

    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.storeSpreadsheetMapResult, {
      spreadsheetId,
      chunkIndex,
      result: JSON.stringify(result),
    });

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed,
      outputLength: mapOutput.length,
    });

    // Check if all maps are complete
    const updatedSpreadsheet = await ctx.runQuery(internal.studio.spreadsheets.index.getInternal, {
      id: spreadsheetId,
    });
    if (!updatedSpreadsheet) return;

    const completedMaps = updatedSpreadsheet.metadata?.mapResults
      ? Object.keys(updatedSpreadsheet.metadata.mapResults).length
      : 0;
    const totalMaps = updatedSpreadsheet.metadata?.totalMapTasks || totalChunks;

    console.log(`[SpreadsheetJob] Map progress: ${completedMaps}/${totalMaps}`);

    if (completedMaps >= totalMaps) {
      console.log(`[SpreadsheetJob] All map tasks complete, scheduling finalization`);
      await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.finalizeSpreadsheetPhase, {
        spreadsheetId,
        userId,
        notebookId,
        spreadsheetType,
        customPrompt,
      });
    }
  } catch (error) {
    const retryDelayMs = mapChunkRetryDelayMs(args.attempt);
    if (retryDelayMs !== null) {
      console.warn(
        `[spreadsheets] map chunk ${args.chunkIndex + 1} failed on attempt ${args.attempt ?? 1}, retrying in ${retryDelayMs}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await ctx.scheduler.runAfter(
        retryDelayMs,
        internal.studio.spreadsheets.job.processSpreadsheetMapChunk,
        {
          ...args,
          attempt: (args.attempt ?? 1) + 1,
        }
      );
      return;
    }

    const errorMeta = createErrorMetadata(error, "map_processing");

    console.error(`[SpreadsheetJob] ${chunkId} FAILED:`, errorMeta.message);

    // Store error result
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.storeSpreadsheetMapResult, {
      spreadsheetId,
      chunkIndex,
      result: JSON.stringify({
        _error: true,
        errorMessage: errorMeta.message,
        isTimeout: errorMeta.type === "llm_timeout",
        output: "",
      }),
    });

    logger.warn(`Map chunk failed`, {
      chunkIndex,
      error: errorMeta.message,
      errorType: errorMeta.type,
    });

    // Check if we should still proceed with partial results
    const spreadsheet = await ctx.runQuery(internal.studio.spreadsheets.index.getInternal, {
      id: spreadsheetId,
    });
    if (!spreadsheet) return;

    const completedMaps = spreadsheet.metadata?.mapResults
      ? Object.keys(spreadsheet.metadata.mapResults).length
      : 0;
    const totalMaps = spreadsheet.metadata?.totalMapTasks || totalChunks;
    const failedMaps = spreadsheet.metadata?.mapResults
      ? Object.values(spreadsheet.metadata.mapResults).filter((r: any) => {
          try {
            const parsed = JSON.parse(r as string);
            return parsed._error;
          } catch {
            return false;
          }
        }).length
      : 0;

    if (completedMaps >= totalMaps) {
      const successCount = totalMaps - failedMaps;
      console.log(`[SpreadsheetJob] All tasks done. Success: ${successCount}/${totalMaps}`);

      if (successCount > 0) {
        await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.finalizeSpreadsheetPhase, {
          spreadsheetId,
          userId,
          notebookId,
          spreadsheetType,
          customPrompt,
        });
      } else {
        await ctx.runMutation(internal.studio.jobMutations.spreadsheets.markSpreadsheetFailed, {
          spreadsheetId,
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

// ============================================================
// PHASE 3: Finalize (Collapse + Reduce + Save)
// ============================================================

export async function runFinalizeSpreadsheetPhase(
  ctx: ActionCtx,
  args: FinalizeSpreadsheetPhaseArgs
): Promise<void> {
  const { spreadsheetId, userId, notebookId, spreadsheetType, customPrompt } = args;

  const logger = createJobLogger({
    jobType: "spreadsheet",
    jobId: spreadsheetId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  const deadline = createJobDeadline(STUDIO_FINALIZE_BUDGET_MS);

  try {
    // Get spreadsheet with map results
    const spreadsheet = await ctx.runQuery(internal.studio.spreadsheets.index.getInternal, {
      id: spreadsheetId,
    });
    if (!spreadsheet) {
      console.log("[SpreadsheetJob] Spreadsheet deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[spreadsheet] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (spreadsheet.metadata?.mapResults as Record<string, string>) || {};

    // Separate successful and failed results
    const allOutputs: string[] = [];
    const failedCount = { count: 0 };

    for (const [_idx, resultJson] of Object.entries(mapResults)) {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed._error) {
          failedCount.count++;
        } else if (parsed.output) {
          allOutputs.push(parsed.output);
        }
      } catch {
        failedCount.count++;
      }
    }

    console.log(
      `[SpreadsheetJob] Finalization: ${allOutputs.length} outputs collected, ${failedCount.count} failed chunks`
    );

    assertMapFailuresAcceptable(Object.keys(mapResults).length, failedCount.count);

    if (allOutputs.length === 0) {
      throw new Error("No successful outputs generated from any chunk");
    }

    // Update status for collapsing
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.updateSpreadsheetStatus, {
      spreadsheetId,
      status: "generating",
      metadata: {
        phase: "collapsing",
        progress: 70,
        currentStep: "Consolidating data...",
      },
    });

    // Stage 1: Collapse (recursiveCollapse returns the outputs as-is when not needed)
    let reduceUsage: TokenUsage | undefined;

    console.log(`[SpreadsheetJob] Collapse input: ${allOutputs.length} outputs`);
    const collapsedOutputs = await recursiveCollapse(
      allOutputs,
      customPrompt,
      deadline,
      language,
      (usage) => {
        reduceUsage = addTokenUsage(reduceUsage, usage);
      }
    );

    // Update status for reduce
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.updateSpreadsheetStatus, {
      spreadsheetId,
      status: "generating",
      metadata: {
        phase: "generating_csv",
        progress: 80,
        currentStep: "Generating spreadsheet...",
      },
    });

    // Stage 2: Reduce (Generate CSV)
    const combined = collapsedOutputs.join("\n\n---\n\n");
    const combinedTokens = countTokens(combined);
    if (combinedTokens > CONFIG.REDUCE_MAX_INPUT_TOKENS) {
      throw new Error(
        `Sources too large to consolidate in time: ${combinedTokens} estimated tokens remain after collapsing (limit ${CONFIG.REDUCE_MAX_INPUT_TOKENS}). Try fewer sources.`
      );
    }

    const rowPlan = await planSpreadsheetRows(
      combined,
      customPrompt,
      deadline,
      language,
      (usage) => {
        reduceUsage = addTokenUsage(reduceUsage, usage);
      }
    );

    const prompt = fillTemplate(REDUCE_PROMPT, {
      customPrompt: sanitizeUserInput(customPrompt || ""),
      rowPlan: formatRowPlan(rowPlan),
      content: combined,
    });

    console.log(`[SpreadsheetJob] Reduce prompt: ${prompt.length} chars`);

    const startTime = Date.now();
    let finalOutput = await writeSpreadsheetTable(prompt, deadline, language, (usage) => {
      reduceUsage = addTokenUsage(reduceUsage, usage);
    });

    const aligned = alignRowsToPlan(finalOutput, rowPlan);
    if (aligned.dropped.length > 0) {
      console.log(
        `[SpreadsheetJob] Dropped ${aligned.dropped.length} rows outside the ${rowPlan.length}-row plan or duplicated: ${aligned.dropped.slice(0, 10).join(" | ")}`
      );
      finalOutput = aligned.csv;
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[SpreadsheetJob] Reduce completed in ${elapsed}ms, output: ${finalOutput.length} chars`
    );

    // Update status for finalizing
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.updateSpreadsheetStatus, {
      spreadsheetId,
      status: "generating",
      metadata: {
        phase: "finalizing",
        progress: 90,
        currentStep: "Saving results...",
      },
    });

    // Title from the finished table, so it describes every row, not the first source's notes.
    let title = "Spreadsheet";
    const titleSource = spreadsheetTitleSource(finalOutput, customPrompt ?? "") || allOutputs[0];
    if (titleSource) {
      try {
        title = await generateTitleWithinDeadline(deadline, titleSource, "SpreadsheetTitle");
      } catch (_e) {
        console.log("[SpreadsheetJob] Title generation failed, using default");
      }
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.saveSpreadsheetResults, {
      spreadsheetId,
      spreadsheet: finalOutput,
      metadata: withStudioTelemetryMetadata(
        {
          title,
          spreadsheetType: spreadsheetType || spreadsheet.metadata?.spreadsheetType || "custom",
          customPrompt: customPrompt ?? spreadsheet.metadata?.customPrompt,
          phase: "completed",
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
          mapFailedCount: failedCount.count,
        },
        aggregateStudioJobTelemetry({
          mapResults: Object.values(mapResults),
          reduce: { latencyMs: elapsed, tokenUsage: reduceUsage },
        })
      ),
    });

    // Clear intermediate data
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.clearSpreadsheetMapData, {
      spreadsheetId,
    });

    // Consume rate limit token on success
    await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
      userId,
      feature: "spreadsheet",
    });

    logger.jobComplete({
      title,
      outputLength: finalOutput.length,
      mapSuccess: Object.keys(mapResults).length - failedCount.count,
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

    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.markSpreadsheetFailed, {
      spreadsheetId,
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

// ============================================================
// HELPER: Write the table
// ============================================================

/**
 * Run the reduce and check its table before it is saved (#567): fields quoted back to back are
 * split again, and a table still malformed (no header, no data rows, rows off the header's width)
 * is written once more with the problems named. If that fails too, or there is no time for it,
 * the job fails rather than save a broken table.
 */
export async function writeSpreadsheetTable(
  prompt: string,
  deadline: JobDeadline,
  language: string | undefined,
  onUsage: (usage: TokenUsage) => void
): Promise<string> {
  let userPrompt = prompt;
  for (let attempt = 1; ; attempt++) {
    const rawContent = await invokeWithinBudget({
      invoke: () =>
        invokeTogetherText({
          systemPrompt: withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language),
          userPrompt,
          model: env.SPREADSHEET_LLM,
          maxTokens: 32_000,
          temperature: 0.5,
          reasoningEnabled: true,
          onUsage,
        }),
      timeoutMs: deadline.stepTimeoutMs(CONFIG.REDUCE_TIMEOUT_MS, STUDIO_SAVE_RESERVE_MS),
      phaseLabel: "SpreadsheetReduce",
    });

    let output = withoutPipelineWording(cleanCsvOutput(rawContent));
    if (rawContent.length >= 31_000) {
      console.log("[SpreadsheetJob] CSV may be truncated, trimming incomplete last row");
      const lastNewline = output.lastIndexOf("\n");
      if (lastNewline > 0) {
        output = output.substring(0, lastNewline);
      }
    }

    const { csv, problems } = checkCsvTable(output);
    if (problems.length === 0) return csv;

    const retryBudgetMs = deadline.stepTimeoutMs(CONFIG.REDUCE_TIMEOUT_MS, STUDIO_SAVE_RESERVE_MS);
    console.warn(
      `[SpreadsheetJob] Reduce attempt ${attempt} wrote a malformed table: ${problems.join("; ")}`
    );
    if (attempt >= CONFIG.REDUCE_ATTEMPTS || retryBudgetMs < CONFIG.MIN_REDUCE_RETRY_MS) {
      throw new Error(`The spreadsheet came out malformed (${problems.join("; ")}).`);
    }
    userPrompt = `${prompt}

Your previous table could not be saved: ${problems.join("; ")}. Write the whole table again as valid CSV: a header row, then one line per row, with a comma between every pair of fields and the header's number of fields in every row.`;
  }
}

// ============================================================
// HELPER: Row Plan
// ============================================================

/**
 * Ask for the table's rows before the reduce writes it (#451). Best-effort: a failed, slow or
 * unusable plan returns [] and the reduce picks its own rows as before.
 */
export async function planSpreadsheetRows(
  notes: string,
  customPrompt: string,
  deadline: JobDeadline,
  language: string | undefined,
  onUsage: (usage: TokenUsage) => void
): Promise<string[]> {
  const timeoutMs = deadline.stepTimeoutMs(CONFIG.ROW_PLAN_TIMEOUT_MS, CONFIG.ROW_PLAN_RESERVE_MS);
  if (timeoutMs < CONFIG.MIN_ROW_PLAN_CALL_MS) {
    console.log(`[SpreadsheetJob] Skipping row plan: ${timeoutMs}ms left for it`);
    return [];
  }
  try {
    const reply = await invokeWithinBudget({
      invoke: () =>
        invokeTogetherText({
          systemPrompt: withLanguageInstruction(ROW_PLAN_SYSTEM_PROMPT, language),
          userPrompt: fillTemplate(ROW_PLAN_PROMPT, {
            customPrompt: sanitizeUserInput(customPrompt || ""),
            content: notes,
          }),
          model: env.SPREADSHEET_LLM,
          maxTokens: 12_000,
          temperature: 0,
          reasoningEnabled: true,
          onUsage,
        }),
      timeoutMs,
      phaseLabel: "SpreadsheetRowPlan",
    });
    const plan = parseRowPlan(reply);
    console.log(`[SpreadsheetJob] Row plan: ${plan.length} rows`);
    return plan;
  } catch (error) {
    console.warn(
      "[SpreadsheetJob] Row plan failed, the reduce picks rows itself:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

// ============================================================
// HELPER: Recursive Collapse
// ============================================================

export async function recursiveCollapse(
  textOutputs: string[],
  customPrompt: string,
  deadline: JobDeadline,
  language?: string,
  onUsage?: (usage: TokenUsage) => void
): Promise<string[]> {
  if (shouldStopCollapsing(textOutputs, CONFIG.REDUCE_CHUNK_SIZE_TOKENS, countTokens)) {
    return textOutputs;
  }

  const collapseCallBudgetMs = () =>
    deadline.stepTimeoutMs(CONFIG.REDUCE_TIMEOUT_MS, CONFIG.REDUCE_RESERVE_MS);

  if (collapseCallBudgetMs() < CONFIG.MIN_COLLAPSE_CALL_MS) {
    console.log(
      `[SpreadsheetJob] Out of collapse time budget, reducing ${textOutputs.length} outputs as-is`
    );
    return textOutputs;
  }

  const groups = planCollapseGroups(textOutputs, CONFIG.REDUCE_CHUNK_SIZE_TOKENS, countTokens);

  console.log(`[SpreadsheetJob] Collapsing ${groups.length} token-aware groups`);

  const collapsed = await allWithConcurrency(
    groups.map((group, idx) => {
      return async () => {
        const combined = group.join("\n\n---\n\n");
        if (group.length === 1) {
          return combined; // Trailing singleton: nothing to merge
        }
        // Groups queued behind earlier waves start later, so re-check the budget
        // here instead of firing a call that would be abandoned almost at once.
        const timeoutMs = collapseCallBudgetMs();
        if (timeoutMs < CONFIG.MIN_COLLAPSE_CALL_MS) {
          console.log(`[SpreadsheetJob] Collapse group ${idx} skipped: out of time budget`);
          return combined;
        }
        const prompt = fillTemplate(COLLAPSE_PROMPT, {
          content: combined,
          customPrompt: sanitizeUserInput(customPrompt || ""),
        });

        try {
          return await invokeWithinBudget({
            invoke: () =>
              invokeTogetherText({
                systemPrompt: withLanguageInstruction(COLLAPSE_SYSTEM_PROMPT, language),
                userPrompt: prompt,
                model: env.SPREADSHEET_LLM,
                maxTokens: 32_000,
                temperature: 0.5,
                reasoningEnabled: true,
                onUsage,
              }),
            timeoutMs,
            phaseLabel: "CollapseGroup",
          });
        } catch (error) {
          console.log(`[SpreadsheetJob] Collapse group ${idx} failed: ${error}`);
          return combined; // Fallback: return uncollapsed
        }
      };
    }),
    CONFIG.COLLAPSE_CONCURRENCY
  );

  return recursiveCollapse(collapsed, customPrompt, deadline, language, onUsage);
}
