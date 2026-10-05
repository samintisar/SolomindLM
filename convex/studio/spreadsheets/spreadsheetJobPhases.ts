"use node";

/**
 * Spreadsheet generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  allWithConcurrency,
  invokeWithTimeout,
  sanitizeUserInput,
} from "../../_agents/_shared/index";
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
import { packChunks, validateChunks } from "../../_agents/SpreadsheetGraph";
import {
  COLLAPSE_PROMPTS,
  COLLAPSE_SYSTEM_PROMPT,
  MAP_PROMPTS,
  MAP_SYSTEM_PROMPT,
  REDUCE_PROMPTS,
  REDUCE_SYSTEM_PROMPT,
} from "../../_agents/spreadsheet/prompts";
import { labelWithSource, packChunksBySource } from "../../_agents/spreadsheet/sourcePacking";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { env } from "../../_lib/env";
import { generateTitleFromChunk } from "../../_services/ai/titleGenerator";
import { planCollapseGroups, shouldStopCollapsing } from "../_job/collapsePlan";
import { type InvokeStudioLlmOptions, invokeStudioLlm } from "../_job/invokeStudioLlm";
import { createJobDeadline, type JobDeadline } from "../_job/jobDeadline";

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  REDUCE_CHUNK_SIZE_TOKENS: 15_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 300_000, // 5 minutes
  COLLAPSE_CONCURRENCY: 5,
  // Finalization must end (saved or marked failed) before Convex's 600s action
  // limit, which kills the action without running its catch block.
  FINALIZE_BUDGET_MS: 540_000,
  REDUCE_RESERVE_MS: 270_000, // held back from collapse rounds: up to 240s of reduce + save
  MIN_COLLAPSE_CALL_MS: 60_000, // skip collapse calls below this per-call budget
  SAVE_RESERVE_MS: 30_000, // held back from reduce for title generation + saving
  TITLE_TIMEOUT_MS: 20_000,
  // Largest combined collapse output sent to the reduce call; beyond this the
  // prompt cannot fit the model context alongside a 32k-token response.
  REDUCE_MAX_INPUT_TOKENS: 100_000,
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
// HELPER: Clean CSV output
// ============================================================

function cleanCsvOutput(output: string): string {
  let cleaned = output.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:csv)?\n?/, "").replace(/\n?```$/, "");
  }

  cleaned = cleaned.trim();

  // Check if CSV is already properly quoted (heuristic: first line should start with quote)
  const lines = cleaned.split("\n");
  if (lines.length > 0 && lines[0].trim().startsWith('"')) {
    return cleaned;
  }

  // Attempt to fix unquoted CSV by parsing and re-quoting
  try {
    const fixedLines: string[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;

      const fields = parseCsvLine(line);
      const quotedFields = fields.map((field) => {
        const escaped = field.replace(/"/g, '""');
        return `"${escaped}"`;
      });

      fixedLines.push(quotedFields.join(","));
    }

    if (fixedLines.length > 0) {
      return fixedLines.join("\n");
    }
  } catch (error) {
    console.warn("[SpreadsheetJob] Failed to auto-format CSV, returning as-is:", error);
  }

  return cleaned;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      }
      insideQuotes = !insideQuotes;
      i++;
      continue;
    }

    if (char === "," && !insideQuotes) {
      fields.push(currentField);
      currentField = "";
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  fields.push(currentField);
  return fields;
}

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runSpreadsheetGenerationPhase(
  ctx: ActionCtx,
  args: SpreadsheetGenerationPhaseArgs
): Promise<void> {
  "use node";

  const { spreadsheetId, userId, notebookId, documentIds, spreadsheetType, customPrompt } = args;

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
      topic: customPrompt,
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
        customPrompt: customPrompt || "",
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
        customPrompt: customPrompt || "",
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
      customPrompt: customPrompt || "",
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
        customPrompt: customPrompt || "",
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
  "use node";

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

    // If customPrompt is provided, use the custom template
    // Otherwise, use the predefined template for the spreadsheet type
    const promptTemplate =
      customPrompt && customPrompt.trim()
        ? MAP_PROMPTS["custom"]
        : MAP_PROMPTS[spreadsheetType] || MAP_PROMPTS["custom"];
    const prompt = fillTemplate(promptTemplate, {
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
  "use node";

  const { spreadsheetId, userId, notebookId, spreadsheetType, customPrompt } = args;

  const logger = createJobLogger({
    jobType: "spreadsheet",
    jobId: spreadsheetId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  const deadline = createJobDeadline(CONFIG.FINALIZE_BUDGET_MS);

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
      spreadsheetType,
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

    // Get the reduce prompt based on spreadsheet type
    const reducePromptTemplate =
      customPrompt && customPrompt.trim()
        ? REDUCE_PROMPTS["custom"]
        : REDUCE_PROMPTS[spreadsheetType] || REDUCE_PROMPTS["custom"];
    const prompt = fillTemplate(reducePromptTemplate, {
      spreadsheetType,
      customPrompt: sanitizeUserInput(customPrompt || ""),
      content: combined,
    });

    console.log(`[SpreadsheetJob] Reduce prompt: ${prompt.length} chars`);

    const startTime = Date.now();
    const rawContent = await invokeWithinBudget({
      invoke: () =>
        invokeTogetherText({
          systemPrompt: withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language),
          userPrompt: prompt,
          model: env.SPREADSHEET_LLM,
          maxTokens: 32_000,
          temperature: 0.5,
          reasoningEnabled: true,
          onUsage: (usage) => {
            reduceUsage = addTokenUsage(reduceUsage, usage);
          },
        }),
      timeoutMs: deadline.stepTimeoutMs(CONFIG.REDUCE_TIMEOUT_MS, CONFIG.SAVE_RESERVE_MS),
      phaseLabel: "SpreadsheetReduce",
    });

    let finalOutput = cleanCsvOutput(rawContent);

    if (rawContent.length >= 31_000) {
      console.log("[SpreadsheetJob] CSV may be truncated, trimming incomplete last row");
      const lastNewline = finalOutput.lastIndexOf("\n");
      if (lastNewline > 0) {
        finalOutput = finalOutput.substring(0, lastNewline);
      }
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

    // Generate title from first chunk
    let title = "Spreadsheet";
    if (allOutputs.length > 0) {
      try {
        title = await invokeWithTimeout(
          () => generateTitleFromChunk(allOutputs[0]),
          deadline.stepTimeoutMs(CONFIG.TITLE_TIMEOUT_MS),
          "SpreadsheetTitle"
        );
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
// HELPER: Recursive Collapse
// ============================================================

export async function recursiveCollapse(
  textOutputs: string[],
  spreadsheetType: string,
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
        const collapsePromptTemplate =
          customPrompt && customPrompt.trim()
            ? COLLAPSE_PROMPTS["custom"]
            : COLLAPSE_PROMPTS[spreadsheetType] || COLLAPSE_PROMPTS["custom"];

        const prompt = fillTemplate(collapsePromptTemplate, {
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

  return recursiveCollapse(collapsed, spreadsheetType, customPrompt, deadline, language, onUsage);
}

/**
 * Runs a studio LLM call with `timeoutMs` bounding all retry attempts together,
 * not just each attempt, so a flaky provider cannot push past the job deadline.
 *
 * Each attempt only gets what is left of the shared budget, and no attempt starts
 * once it is spent (the timeout error is non-retryable), so the retry loop ends
 * with the budget instead of carrying on in the background.
 */
export function invokeWithinBudget<T>(options: InvokeStudioLlmOptions<T>): Promise<T> {
  const budget = createJobDeadline(options.timeoutMs);
  return invokeStudioLlm({
    ...options,
    invoke: () => {
      const remainingMs = budget.remainingMs();
      if (remainingMs <= 0) {
        return Promise.reject(
          new Error(`${options.phaseLabel} timeout after ${options.timeoutMs}ms`)
        );
      }
      return invokeWithTimeout(options.invoke, remainingMs, options.phaseLabel);
    },
  });
}
