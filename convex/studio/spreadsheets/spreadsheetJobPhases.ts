"use node";
/**
 * Spreadsheet generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { packChunks, validateChunks } from "../../_agents/SpreadsheetGraph";
import { env } from "../../_lib/env";
import { createJobLogger, createErrorMetadata } from "../../_agents/_shared/logging";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  MAP_PROMPTS,
  REDUCE_PROMPTS,
  COLLAPSE_PROMPTS,
  MAP_SYSTEM_PROMPT,
  COLLAPSE_SYSTEM_PROMPT,
  REDUCE_SYSTEM_PROMPT,
} from "../../_agents/spreadsheet/prompts";
import { sanitizeUserInput, allWithConcurrency } from "../../_agents/_shared/index";
import { mergeModelKwargs } from "../../_agents/_shared/llm_factory";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { invokeStudioLlm, createLangSmithRunConfig } from "../_job/invokeStudioLlm";

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.SPREADSHEET_MAP_CHUNK_TOKENS || "5000", 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.SPREADSHEET_REDUCE_CHUNK_TOKENS || "15000", 10),
  PER_CHUNK_TIMEOUT_MS: 90000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 120000, // 120 seconds for reduce
  COLLAPSE_CONCURRENCY: 5,
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
};

export type FinalizeSpreadsheetPhaseArgs = {
  spreadsheetId: Id<"spreadsheets">;
  userId: string;
  notebookId: Id<"notebooks">;
  spreadsheetType: string;
  customPrompt: string;
};

// ============================================================
// HELPER: Create LLMs
// ============================================================

function createMapLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.FAST_LLM,
    temperature: 0.3,
    timeout: CONFIG.PER_CHUNK_TIMEOUT_MS,
    modelKwargs: mergeModelKwargs(env.FAST_LLM, "fast"),
    maxTokens: parseInt(env.SPREADSHEET_MAP_MAX_OUTPUT_TOKENS || "4096", 10),
  });
}

function createReduceLLM(): ChatTogetherAI {
  const model = env.SPREADSHEET_LLM;
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model,
    temperature: 0.5,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: parseInt(env.SPREADSHEET_REDUCE_MAX_OUTPUT_TOKENS || "32000", 10),
    modelKwargs: mergeModelKwargs(model, "smart"),
  });
}

// ============================================================
// HELPER: Extract message content
// ============================================================

function getMessageContent(response: unknown): string {
  if (typeof response === "object" && response !== null) {
    const msg = response as { content?: unknown };
    if (typeof msg.content === "string") {
      return msg.content;
    }
    if (typeof msg.content === "object" && msg.content !== null) {
      if (typeof (msg.content as { toString?: () => string }).toString === "function") {
        return (msg.content as { toString: () => string }).toString();
      }
    }
  }
  return String(response);
}

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
    const chunkObjects = await ctx.runAction(internal.documents.index.fetchChunks, {
      documentIds,
    });

    // Extract content from chunk objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Validate and pack chunks
    const validatedChunks = validateChunks(rawChunks);
    const packedChunks = packChunks(validatedChunks, CONFIG.MAP_CHUNK_SIZE_TOKENS);

    console.log(
      `[SpreadsheetJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`
    );

    if (packedChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.initSpreadsheetMapPhase, {
      spreadsheetId,
      totalMapTasks: packedChunks.length,
      spreadsheetType: spreadsheetType || "custom",
      customPrompt: customPrompt || "",
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < packedChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.processSpreadsheetMapChunk, {
        spreadsheetId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: packedChunks.length,
        chunk: packedChunks[i],
        spreadsheetType: spreadsheetType || "custom",
        customPrompt: customPrompt || "",
      });
      console.log(`[SpreadsheetJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
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
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: userId as any },
      );
    } catch (e) {
      console.warn("[spreadsheet] user preference fetch failed, using default language", e instanceof Error ? e.message : String(e));
    }
    const language = userPrefs?.outputLanguage;

    // Process with LLM (plain text output)
    const llm = createMapLLM();

    // If customPrompt is provided, use the custom template
    // Otherwise, use the predefined template for the spreadsheet type
    const promptTemplate =
      customPrompt && customPrompt.trim()
        ? MAP_PROMPTS["custom"]
        : MAP_PROMPTS[spreadsheetType] || MAP_PROMPTS["custom"];
    const prompt = promptTemplate
      .replace("{chunk}", chunk)
      .replace("{customPrompt}", sanitizeUserInput(customPrompt || ""));

    console.log(`[SpreadsheetJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    const response = await invokeStudioLlm({
      invoke: () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (llm as any).invoke(
          [new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language)), new HumanMessage(prompt)],
          createLangSmithRunConfig({
            runName: "SpreadsheetJob.MapProcess",
            tags: ["agent", "spreadsheet", "map"],
            metadata: {
              chunkIndex,
              spreadsheetType,
              chunkLength: chunk.length,
            },
          })
        ),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "SpreadsheetMap",
      onRetry: (attempt, error) => {
        console.log(`[SpreadsheetJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;
    const mapOutput = getMessageContent(response);

    console.log(
      `[SpreadsheetJob] ${chunkId} LLM completed in ${elapsed}ms, output: ${mapOutput.length} chars`
    );

    // Store result
    const result = {
      output: mapOutput,
      processingTimeMs: elapsed,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: userId as any },
      );
    } catch (e) {
      console.warn("[spreadsheet] user preference fetch failed, using default language", e instanceof Error ? e.message : String(e));
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

    // Stage 1: Collapse (if needed)
    let collapsedOutputs: string[];

    // Estimate total tokens
    const estimateTokens = (text: string) => Math.ceil(text.length / 3);
    const totalTokens = allOutputs.reduce((sum, s) => sum + estimateTokens(s), 0);

    if (totalTokens <= CONFIG.REDUCE_CHUNK_SIZE_TOKENS || allOutputs.length <= 2) {
      console.log(
        `[SpreadsheetJob] Skipping collapse (${totalTokens} tokens, ${allOutputs.length} outputs)`
      );
      collapsedOutputs = allOutputs;
    } else {
      console.log(
        `[SpreadsheetJob] Collapsing ${allOutputs.length} outputs (${totalTokens} tokens)`
      );
      collapsedOutputs = await recursiveCollapse(allOutputs, spreadsheetType, customPrompt, language);
    }

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
    const reduceLLM = createReduceLLM();
    const combined = collapsedOutputs.join("\n\n---\n\n");

    // Get the reduce prompt based on spreadsheet type
    const reducePromptTemplate =
      customPrompt && customPrompt.trim()
        ? REDUCE_PROMPTS["custom"]
        : REDUCE_PROMPTS[spreadsheetType] || REDUCE_PROMPTS["custom"];
    const prompt = reducePromptTemplate
      .replace("{spreadsheetType}", spreadsheetType)
      .replace("{customPrompt}", sanitizeUserInput(customPrompt || ""))
      .replace("{content}", combined);

    console.log(`[SpreadsheetJob] Reduce prompt: ${prompt.length} chars`);

    const startTime = Date.now();
    const response = await invokeStudioLlm({
      invoke: () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (reduceLLM as any).invoke(
          [new SystemMessage(withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language)), new HumanMessage(prompt)],
          createLangSmithRunConfig({
            runName: "SpreadsheetJob.Reduce",
            tags: ["agent", "spreadsheet", "reduce"],
            metadata: {
              spreadsheetType,
              collapsedOutputsCount: collapsedOutputs.length,
            },
          })
        ),
      timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
      phaseLabel: "SpreadsheetReduce",
    });

    const rawContent = getMessageContent(response);
    let finalOutput = cleanCsvOutput(rawContent);

    // Handle truncation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseAny = response as any;
    const metadata = responseAny.response_metadata || {};
    const finishReason = metadata.finish_reason || metadata.tokenUsage?.finish_reason;

    if (finishReason === "length") {
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
        title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
          chunk: allOutputs[0],
        });
      } catch (_e) {
        console.log("[SpreadsheetJob] Title generation failed, using default");
      }
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.spreadsheets.saveSpreadsheetResults, {
      spreadsheetId,
      spreadsheet: finalOutput,
      metadata: {
        title,
        phase: "completed",
        progress: 100,
        completedAt: Date.now(),
        mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
        mapFailedCount: failedCount.count,
      },
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

async function recursiveCollapse(
  textOutputs: string[],
  spreadsheetType: string,
  customPrompt: string,
  language?: string
): Promise<string[]> {
  const TARGET_TOKENS = CONFIG.REDUCE_CHUNK_SIZE_TOKENS;

  if (textOutputs.length <= 2) {
    return textOutputs;
  }

  // Group by estimated tokens
  const estimateTokens = (text: string) => Math.ceil(text.length / 3);
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of textOutputs) {
    const outputTokens = estimateTokens(output);

    if (currentTokens + outputTokens > TARGET_TOKENS && currentGroup.length > 0) {
      groups.push([...currentGroup]);
      currentGroup = [output];
      currentTokens = outputTokens;
    } else {
      currentGroup.push(output);
      currentTokens += outputTokens;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  console.log(`[SpreadsheetJob] Collapsing ${groups.length} token-aware groups`);

  const reduceLLM = createReduceLLM();
  const collapsed = await allWithConcurrency(
    groups.map((group, idx) => {
      return async () => {
        const combined = group.join("\n\n---\n\n");
        const collapsePromptTemplate =
          customPrompt && customPrompt.trim()
            ? COLLAPSE_PROMPTS["custom"]
            : COLLAPSE_PROMPTS[spreadsheetType] || COLLAPSE_PROMPTS["custom"];

        const prompt = collapsePromptTemplate
          .replace("{content}", combined)
          .replace("{customPrompt}", sanitizeUserInput(customPrompt || ""));

        try {
          const response = await invokeStudioLlm({
            invoke: () =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (reduceLLM as any).invoke(
                [new SystemMessage(withLanguageInstruction(COLLAPSE_SYSTEM_PROMPT, language)), new HumanMessage(prompt)],
                createLangSmithRunConfig({
                  runName: "SpreadsheetJob.CollapseGroup",
                  tags: ["agent", "spreadsheet", "collapse"],
                  metadata: {
                    fragmentCount: group.length,
                  },
                })
              ),
            timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
            phaseLabel: "CollapseGroup",
          });

          return getMessageContent(response);
        } catch (error) {
          console.log(`[SpreadsheetJob] Collapse group ${idx} failed: ${error}`);
          return combined; // Fallback: return uncollapsed
        }
      };
    }),
    CONFIG.COLLAPSE_CONCURRENCY
  );

  return recursiveCollapse(collapsed, spreadsheetType, customPrompt, language);
}
