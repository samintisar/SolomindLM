"use node";

/**
 * Mind map generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { sanitizeUserInput, validateWithPreset } from "../../_agents/_shared/index";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { createErrorMetadata, createJobLogger } from "../../_agents/_shared/logging";
import { fillTemplate } from "../../_agents/_shared/promptTemplate";
import { invokeStructuredOutput } from "../../_agents/_shared/structuredLlm";
import { planStudioJobMapPhase } from "../../_agents/_shared/studioExecutionMode";
import {
  aggregateStudioJobTelemetry,
  withStudioTelemetryMetadata,
} from "../../_agents/_shared/studioJobTelemetry";
import { invokeTogetherText } from "../../_agents/_shared/studioTextLlm";
import { countTokens } from "../../_agents/_shared/tokenizer";
import { addTokenUsage, type TokenUsage } from "../../_agents/_shared/usageAggregate";
import {
  MAP_PROMPT,
  MAP_SYSTEM_PROMPT,
  REDUCE_PROMPT,
  REDUCE_SYSTEM_PROMPT,
  withMindMapRequest,
} from "../../_agents/mindmap/prompts";
import type { ConceptExtraction, FinalMindMap, MindMapNode } from "../../_agents/mindmap/state";
import { ConceptExtractionSchema } from "../../_agents/mindmap/structuredLlm";
import { mindMapTitleSource } from "../../_agents/mindmap/title";
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
import { compactReduceInput, conceptsFromSource, createSmartFallback } from "./mindmapFallback";

const { packChunks, validateChunks } = createStudioChunkHelpers("MindMapGraph");

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 480_000, // all reduce attempts together
  // Reasoning shares this budget; at 16K a 13-source map was cut off mid-branch (#568).
  REDUCE_MAX_TOKENS: 32_000,
} as const;

export type MindmapGenerationPhaseArgs = {
  mindmapId: Id<"mindmaps">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
  /** The user's custom prompt for this mind map. */
  customPrompt?: string;
};

export type ProcessMindMapMapChunkPhaseArgs = {
  mindmapId: Id<"mindmaps">;
  userId: string;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  /** 1-based; set when a failed chunk is re-run. */
  attempt?: number;
  totalChunks: number;
  chunk: string;
  customPrompt?: string;
};

export type FinalizeMindMapPhaseArgs = {
  mindmapId: Id<"mindmaps">;
  userId: string;
  notebookId: Id<"notebooks">;
  customPrompt?: string;
};

// ============================================================
// MARKDOWN PARSER
// ============================================================

/**
 * Parses markdown indentation into a JSON tree
 */
function parseMarkdownToTree(markdown: string): MindMapNode {
  const lines = markdown.split("\n").filter((l) => l.trim().length > 0);
  let root: MindMapNode = { topic: "Knowledge Map", children: [] };

  const stack: { node: MindMapNode; level: number }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");

    if (line.trim().startsWith("#")) {
      const rootTopic = line.replace(/^#+\s*/, "").trim();
      root = { topic: rootTopic, children: [] };
      stack.length = 0;
      stack.push({ node: root, level: 0 });
      continue;
    }

    const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)/);

    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const topic = bulletMatch[2].trim();

      const level = Math.floor(indent / 2) + 1;

      const newNode: MindMapNode = { topic, children: [] };

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        if (!root.children) root.children = [];
        root.children.push(newNode);
        stack.push({ node: newNode, level });
      } else {
        const parent = stack[stack.length - 1].node;
        if (!parent.children) parent.children = [];
        parent.children.push(newNode);
        stack.push({ node: newNode, level });
      }
    }
  }

  cleanLeafNodes(root);
  return root;
}

function cleanLeafNodes(node: MindMapNode): void {
  if (node.children && node.children.length === 0) {
    node.children = null;
  } else if (node.children) {
    node.children.forEach((c) => cleanLeafNodes(c));
  }
}

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runMindmapGenerationPhase(
  ctx: ActionCtx,
  args: MindmapGenerationPhaseArgs
): Promise<void> {
  const { mindmapId, userId, notebookId, documentIds, customPrompt } = args;

  // Initialize structured logger
  const logger = createJobLogger({
    jobType: "mindmap",
    jobId: mindmapId,
    notebookId,
    userId,
  });

  logger.jobStart({
    docCount: documentIds.length,
  });

  try {
    // Phase: Initializing
    logger.phaseStart("initializing", { progress: 5 });
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
      mindmapId,
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
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
      mindmapId,
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
    // Sources left after narrowing to the custom prompt (#288).
    const topicDocumentCount = new Set(chunkObjects.map((c) => c.documentId)).size;

    // Extract content from chunk objects
    const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Validate and pack chunks
    const validatedChunks = validateChunks(rawChunks);
    const mapPlan = planStudioJobMapPhase({
      documentCount: topicDocumentCount,
      chunks: validatedChunks,
      estimateTokens: countTokens,
      pack: (chunks) => packChunks(chunks, CONFIG.MAP_CHUNK_SIZE_TOKENS),
    });

    console.log(
      `[MindMapJob] Planned ${validatedChunks.length} validated chunks into ${mapPlan.mapChunks.length} map tasks (${mapPlan.mode})`
    );

    if (mapPlan.mode === "single_pass" && mapPlan.skipMapContent) {
      await ctx.runMutation(internal.studio.jobMutations.mindmaps.initMindMapMapPhase, {
        mindmapId,
        totalMapTasks: 1,
      });

      await ctx.runMutation(internal.studio.jobMutations.mindmaps.storeMindMapMapResult, {
        mindmapId,
        chunkIndex: 0,
        result: JSON.stringify({
          extraction: {
            main_theme: "Source",
            summary: mapPlan.skipMapContent,
            key_concepts: conceptsFromSource(mapPlan.skipMapContent),
          },
          processingTimeMs: 0,
        }),
      });

      await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.finalizeMindMapPhase, {
        mindmapId,
        userId,
        notebookId,
        customPrompt,
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

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.initMindMapMapPhase, {
      mindmapId,
      totalMapTasks: mapPlan.mapChunks.length,
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < mapPlan.mapChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.processMindMapMapChunk, {
        mindmapId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: mapPlan.mapChunks.length,
        chunk: mapPlan.mapChunks[i],
        customPrompt,
      });
      console.log(`[MindMapJob] Scheduled map task ${i + 1}/${mapPlan.mapChunks.length}`);
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

    await ctx.runMutation(internal.studio.jobMutations.mindmaps.markMindMapFailed, {
      mindmapId,
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

export async function runProcessMindMapMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessMindMapMapChunkPhaseArgs
): Promise<void> {
  const { mindmapId, userId, notebookId, chunkIndex, totalChunks, chunk, customPrompt } = args;

  const logger = createJobLogger({
    jobType: "mindmap",
    jobId: mindmapId,
    notebookId,
    userId,
  });

  const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
  console.log(`[MindMapJob] ${chunkId} Starting map processing`);

  try {
    // Check if mindmap still exists
    const mindmap = await ctx.runQuery(internal.studio.mindmaps.index.getInternal, {
      id: mindmapId,
    });
    if (!mindmap) {
      console.log(`[MindMapJob] ${chunkId} Mindmap deleted, skipping`);
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[mindmap] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const prompt = withMindMapRequest(
      fillTemplate(MAP_PROMPT, { content: chunk }),
      customPrompt ? sanitizeUserInput(customPrompt) : undefined
    );

    console.log(`[MindMapJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    let tokenUsage: TokenUsage | undefined;
    const extraction = await invokeStudioLlm({
      invoke: () =>
        invokeStructuredOutput({
          systemPrompt: withLanguageInstruction(MAP_SYSTEM_PROMPT, language),
          userPrompt: prompt,
          schema: ConceptExtractionSchema,
          schemaName: "concept_extraction",
          model: env.FAST_LLM,
          temperature: 0.1,
          maxTokens: 8000,
          logPrefix: "MindMapMap",
          onUsage: (usage) => {
            tokenUsage = usage;
          },
        }),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "MindMapMap",
      onRetry: (attempt, error) => {
        console.log(`[MindMapJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[MindMapJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Store result
    const result = {
      extraction,
      processingTimeMs: elapsed,
      ...(tokenUsage !== undefined ? { tokenUsage } : {}),
    };

    await ctx.runMutation(internal.studio.jobMutations.mindmaps.storeMindMapMapResult, {
      mindmapId,
      chunkIndex,
      result: JSON.stringify(result),
    });

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed,
      conceptsExtracted: extraction.key_concepts.length,
      mainTheme: extraction.main_theme,
    });

    // Check if all maps are complete
    const updatedMindmap = await ctx.runQuery(internal.studio.mindmaps.index.getInternal, {
      id: mindmapId,
    });
    if (!updatedMindmap) return;

    const completedMaps = updatedMindmap.metadata?.mapResults
      ? Object.keys(updatedMindmap.metadata.mapResults).length
      : 0;
    const totalMaps = updatedMindmap.metadata?.totalMapTasks || totalChunks;

    console.log(`[MindMapJob] Map progress: ${completedMaps}/${totalMaps}`);

    if (completedMaps >= totalMaps) {
      console.log(`[MindMapJob] All map tasks complete, scheduling finalization`);
      await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.finalizeMindMapPhase, {
        mindmapId,
        userId,
        notebookId,
        customPrompt,
      });
    }
  } catch (error) {
    const retryDelayMs = mapChunkRetryDelayMs(args.attempt);
    if (retryDelayMs !== null) {
      console.warn(
        `[mindmaps] map chunk ${args.chunkIndex + 1} failed on attempt ${args.attempt ?? 1}, retrying in ${retryDelayMs}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await ctx.scheduler.runAfter(
        retryDelayMs,
        internal.studio.mindmaps.job.processMindMapMapChunk,
        {
          ...args,
          attempt: (args.attempt ?? 1) + 1,
        }
      );
      return;
    }

    const errorMeta = createErrorMetadata(error, "map_processing");

    console.error(`[MindMapJob] ${chunkId} FAILED:`, errorMeta.message);

    // Store error result
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.storeMindMapMapResult, {
      mindmapId,
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

    // Check if we should still proceed with partial results
    const mindmap = await ctx.runQuery(internal.studio.mindmaps.index.getInternal, {
      id: mindmapId,
    });
    if (!mindmap) return;

    const completedMaps = mindmap.metadata?.mapResults
      ? Object.keys(mindmap.metadata.mapResults).length
      : 0;
    const totalMaps = mindmap.metadata?.totalMapTasks || totalChunks;
    const failedMaps = mindmap.metadata?.mapResults
      ? Object.values(mindmap.metadata.mapResults).filter((r: any) => {
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
      console.log(`[MindMapJob] All tasks done. Success: ${successCount}/${totalMaps}`);

      if (successCount > 0) {
        await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.finalizeMindMapPhase, {
          mindmapId,
          userId,
          notebookId,
          customPrompt,
        });
      } else {
        await ctx.runMutation(internal.studio.jobMutations.mindmaps.markMindMapFailed, {
          mindmapId,
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
// PHASE 3: Finalize (Build Tree + Save)
// ============================================================

export async function runFinalizeMindMapPhase(
  ctx: ActionCtx,
  args: FinalizeMindMapPhaseArgs
): Promise<void> {
  const { mindmapId, userId, notebookId, customPrompt } = args;

  const logger = createJobLogger({
    jobType: "mindmap",
    jobId: mindmapId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  const deadline = createJobDeadline(STUDIO_FINALIZE_BUDGET_MS);

  try {
    // Get mindmap with map results
    const mindmap = await ctx.runQuery(internal.studio.mindmaps.index.getInternal, {
      id: mindmapId,
    });
    if (!mindmap) {
      console.log("[MindMapJob] Mindmap deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[mindmap] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (mindmap.metadata?.mapResults as Record<string, string>) || {};

    // Separate successful and failed results
    const allExtractions: ConceptExtraction[] = [];
    const failedCount = { count: 0 };

    for (const [_idx, resultJson] of Object.entries(mapResults)) {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed._error) {
          failedCount.count++;
        } else if (parsed.extraction) {
          allExtractions.push(parsed.extraction);
        }
      } catch {
        failedCount.count++;
      }
    }

    console.log(
      `[MindMapJob] Finalization: ${allExtractions.length} extractions collected, ${failedCount.count} failed chunks`
    );

    assertMapFailuresAcceptable(Object.keys(mapResults).length, failedCount.count);

    if (allExtractions.length === 0) {
      throw new Error("No successful extractions from any chunk");
    }

    // Update status
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
      mindmapId,
      status: "generating",
      metadata: {
        phase: "building",
        progress: 70,
        currentStep: "Building mind map structure...",
      },
    });

    const inputData = allExtractions
      .map(
        (e) =>
          `THEME: ${e.main_theme}\nSUMMARY: ${e.summary}\nCONCEPTS: ${e.key_concepts.join(", ")}`
      )
      .join("\n\n---\n\n");

    const safeInput = inputData.slice(0, 150000);

    console.log(
      `[MindMapJob] Reduce input: ${safeInput.length} chars from ${allExtractions.length} extractions`
    );

    const {
      mindMap: finalMindMap,
      usage: reduceUsage,
      latencyMs: reduceLatencyMs,
    } = await reduceMindMap({
      fullInput: safeInput,
      extractions: allExtractions,
      customPrompt,
      language,
      deadline,
    });

    // Update status for finalizing
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
      mindmapId,
      status: "generating",
      metadata: {
        phase: "finalizing",
        progress: 90,
        currentStep: "Saving results...",
      },
    });

    // Generate title
    let title = finalMindMap.nodeData.topic || "Mind Map";
    try {
      const titleContent = mindMapTitleSource(
        finalMindMap,
        allExtractions.map((e) => `${e.main_theme}: ${e.summary}`)
      );
      title = await generateTitleWithinDeadline(deadline, titleContent, "MindMapTitle");
    } catch (_e) {
      console.log("[MindMapJob] Title generation failed, using default");
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.saveMindMapResults, {
      mindmapId,
      mindmap: finalMindMap,
      metadata: withStudioTelemetryMetadata(
        {
          title,
          nodeCount: 0,
          edgeCount: 0,
          phase: "completed",
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
          mapFailedCount: failedCount.count,
        },
        aggregateStudioJobTelemetry({
          mapResults: Object.values(mapResults),
          reduce: { latencyMs: reduceLatencyMs, tokenUsage: reduceUsage },
        })
      ),
    });

    // Clear intermediate data
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.clearMindMapMapData, { mindmapId });

    // Consume rate limit token on success
    await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
      userId,
      feature: "mindmap",
    });

    logger.jobComplete({
      title,
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

    await ctx.runMutation(internal.studio.jobMutations.mindmaps.markMindMapFailed, {
      mindmapId,
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
// HELPER: Reduce
// ============================================================

/** A reduce reply cut off at the output cap: its tree is incomplete, so it is never saved (#568). */
export class MindMapTruncatedError extends Error {
  constructor() {
    super("Reduce was cut off at the output-token cap");
    this.name = "MindMapTruncatedError";
  }
}

/** Added to the next attempt after a cut-off reply, so it fits the output budget. */
const SHORTER_MAP_INSTRUCTION =
  "Your previous map was too long and was cut off before it ended. Write a smaller map that ends cleanly: fewer branches and sub-topics, short node labels, and at most about 150 nodes in total.";

/**
 * Build the tree from the map extractions. The full input gets most of the reduce budget; if it
 * fails or is cut off at the output cap, a compact input (themes and concepts, no summaries) gets
 * the rest, asked for a smaller map after a cut-off. The rule-based fallback is the last resort.
 */
export async function reduceMindMap(args: {
  fullInput: string;
  extractions: ConceptExtraction[];
  customPrompt?: string;
  language?: string;
  deadline: JobDeadline;
}): Promise<{ mindMap: FinalMindMap; usage?: TokenUsage; latencyMs: number }> {
  const { fullInput, extractions, customPrompt, language, deadline } = args;
  let usage: TokenUsage | undefined;
  const reduceBudgetMs = deadline.stepTimeoutMs(CONFIG.REDUCE_TIMEOUT_MS, STUDIO_SAVE_RESERVE_MS);
  const attempts = [
    { input: fullInput, timeoutMs: () => Math.round(reduceBudgetMs * 0.6) },
    {
      input: compactReduceInput(extractions),
      timeoutMs: () => deadline.stepTimeoutMs(CONFIG.REDUCE_TIMEOUT_MS, STUDIO_SAVE_RESERVE_MS),
    },
  ];
  let previousWasCutOff = false;
  for (const [attemptIndex, attempt] of attempts.entries()) {
    try {
      const startTime = Date.now();
      let finishReason: string | undefined;
      const prompt = withMindMapRequest(
        fillTemplate(REDUCE_PROMPT, { extractions: attempt.input }),
        customPrompt ? sanitizeUserInput(customPrompt) : undefined
      );
      const markdown = await invokeWithinBudget({
        invoke: () =>
          invokeTogetherText({
            systemPrompt: withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language),
            userPrompt: previousWasCutOff ? `${prompt}\n\n${SHORTER_MAP_INSTRUCTION}` : prompt,
            model: env.MINDMAP_LLM,
            maxTokens: CONFIG.REDUCE_MAX_TOKENS,
            temperature: 0.3,
            reasoningEnabled: true,
            onUsage: (callUsage) => {
              usage = addTokenUsage(usage, callUsage);
            },
            onFinishReason: (reason) => {
              finishReason = reason;
            },
          }),
        timeoutMs: attempt.timeoutMs(),
        phaseLabel: "MindMapReduce",
      });
      if (finishReason === "length") throw new MindMapTruncatedError();

      const validation = validateWithPreset(markdown, "mindmap");
      if (!validation.isValid) {
        console.log(`[MindMapJob] Validation warnings: ${validation.warnings.join(", ")}`);
      }

      const parsedTree = parseMarkdownToTree(markdown);
      if (!parsedTree.children?.length) {
        throw new Error("Reduce returned a map with no branches");
      }
      const latencyMs = Date.now() - startTime;
      console.log(
        `[MindMapJob] Reduce completed in ${latencyMs}ms (attempt ${attemptIndex + 1}), root: "${parsedTree.topic}", branches: ${parsedTree.children.length}`
      );
      return { mindMap: { nodeData: parsedTree }, usage, latencyMs };
    } catch (error) {
      previousWasCutOff = error instanceof MindMapTruncatedError;
      console.log(
        `[MindMapJob] Reduce attempt ${attemptIndex + 1} (${attempt.input.length} chars) failed: ${error}`
      );
    }
  }
  console.log("[MindMapJob] Reduce failed on full and compact input, using smart fallback");
  return { mindMap: createSmartFallback(extractions), usage, latencyMs: 0 };
}
