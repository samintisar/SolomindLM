"use node";
/**
 * Mind map generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { packChunks, validateChunks } from "../../_agents/MindMapGraph";
import { env } from "../../_lib/env";
import { createJobLogger, createErrorMetadata } from "../../_agents/_shared/logging";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  MAP_PROMPT,
  REDUCE_PROMPT,
  MAP_SYSTEM_PROMPT,
  REDUCE_SYSTEM_PROMPT,
} from "../../_agents/mindmap/prompts";
import type { ConceptExtraction, MindMapNode, FinalMindMap } from "../../_agents/mindmap/state";
import { validateWithPreset } from "../../_agents/_shared/index";
import { mergeModelKwargs } from "../../_agents/_shared/llm_factory";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { invokeStudioLlm, createLangSmithRunConfig } from "../_job/invokeStudioLlm";

// ============================================================
// SCHEMAS
// ============================================================

const ConceptExtractionSchema = z.object({
  main_theme: z.string(),
  summary: z.string(),
  key_concepts: z.array(z.string()),
});

// Interface for the structured LLM to avoid deep type instantiation
interface ConceptExtractionInvoker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<ConceptExtraction>;
}

// Helper function to create a structured LLM without triggering deep type instantiation
function createConceptExtractionLLM(llm: ChatTogetherAI): ConceptExtractionInvoker {
  return llm.withStructuredOutput(ConceptExtractionSchema, {
    name: "concept_extraction",
  });
}

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 300_000, // 5 minutes
} as const;

export type MindmapGenerationPhaseArgs = {
  mindmapId: Id<"mindmaps">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
};

export type ProcessMindMapMapChunkPhaseArgs = {
  mindmapId: Id<"mindmaps">;
  userId: string;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
};

export type FinalizeMindMapPhaseArgs = {
  mindmapId: Id<"mindmaps">;
  userId: string;
  notebookId: Id<"notebooks">;
};

// ============================================================
// HELPER: Create structured LLM for map phase
// ============================================================

function createMapLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.FAST_LLM,
    temperature: 0.1,
    timeout: CONFIG.PER_CHUNK_TIMEOUT_MS,
    modelKwargs: mergeModelKwargs(env.FAST_LLM, "fast"),
    maxTokens: 8000,
  });
}

function createReduceLLM(): ChatTogetherAI {
  const model = env.MINDMAP_LLM;
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model,
    temperature: 0.3,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: 16000,
    modelKwargs: mergeModelKwargs(model, "smart"),
  });
}

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

/**
 * Creates a meaningful fallback tree
 */
function createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
  const themeCounts: Record<string, number> = {};
  extractions.forEach((e) => {
    const t = e.main_theme || "Unknown";
    themeCounts[t] = (themeCounts[t] || 0) + 1;
  });

  const rootTitle =
    Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Knowledge Map";

  const seenThemes = new Set<string>();
  const children: MindMapNode[] = [];

  for (const ex of extractions) {
    const theme = ex.main_theme || "Misc";
    if (seenThemes.has(theme)) continue;
    seenThemes.add(theme);

    const branchName = theme === rootTitle ? "Overview" : theme;

    children.push({
      topic: branchName,
      children: ex.key_concepts.map((c) => ({
        topic: c,
        children: null,
      })),
    });
  }

  return {
    nodeData: {
      topic: rootTitle,
      children: children.length > 0 ? children : null,
    },
  };
}

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runMindmapGenerationPhase(
  ctx: ActionCtx,
  args: MindmapGenerationPhaseArgs
): Promise<void> {
  "use node";

  const { mindmapId, userId, notebookId, documentIds } = args;

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
      `[MindMapJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`
    );

    if (packedChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.initMindMapMapPhase, {
      mindmapId,
      totalMapTasks: packedChunks.length,
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < packedChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.processMindMapMapChunk, {
        mindmapId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: packedChunks.length,
        chunk: packedChunks[i],
      });
      console.log(`[MindMapJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
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
  "use node";

  const { mindmapId, userId, notebookId, chunkIndex, totalChunks, chunk } = args;

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
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: userId as any }
      );
    } catch (e) {
      console.warn(
        "[mindmap] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    // Process with LLM using structured output
    const llm = createMapLLM();
    const structuredLLM = createConceptExtractionLLM(llm);

    const prompt = MAP_PROMPT.replace("{content}", chunk);

    console.log(`[MindMapJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    const response = await invokeStudioLlm({
      invoke: () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (structuredLLM as any).invoke(
          [
            new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language)),
            new HumanMessage(prompt),
          ],
          createLangSmithRunConfig({
            runName: "MindMapJob.MapProcess",
            tags: ["agent", "mindmap", "map"],
            metadata: {
              chunkIndex,
              contentLength: chunk.length,
            },
          })
        ),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "MindMapMap",
      onRetry: (attempt, error) => {
        console.log(`[MindMapJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[MindMapJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Store result
    const extraction = response as ConceptExtraction;
    const result = {
      extraction,
      processingTimeMs: elapsed,
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
      });
    }
  } catch (error) {
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
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.values(mindmap.metadata.mapResults).filter((r: any) => {
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
  "use node";

  const { mindmapId, userId, notebookId } = args;

  const logger = createJobLogger({
    jobType: "mindmap",
    jobId: mindmapId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

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
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: userId as any }
      );
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

    // Build the mind map using reduce phase
    const llm = createReduceLLM();

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

    let finalMindMap: FinalMindMap;

    try {
      const startTime = Date.now();
      const response = await invokeStudioLlm({
        invoke: () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (llm as any).invoke(
            [
              new SystemMessage(withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language)),
              new HumanMessage(REDUCE_PROMPT.replace("{extractions}", safeInput)),
            ],
            createLangSmithRunConfig({
              runName: "MindMapJob.Reduce",
              tags: ["agent", "mindmap", "reduce"],
              metadata: {
                extractionCount: allExtractions.length,
                inputSize: safeInput.length,
              },
            })
          ),
        timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
        phaseLabel: "MindMapReduce",
      });

      const markdown =
        ((response as BaseMessage).content[0] as { text?: string })?.text ||
        String((response as BaseMessage).content);

      const validation = validateWithPreset(markdown, "mindmap");
      if (!validation.isValid) {
        console.log(`[MindMapJob] Validation warnings: ${validation.warnings.join(", ")}`);
      }

      const parsedTree = parseMarkdownToTree(markdown);
      const elapsed = Date.now() - startTime;

      console.log(
        `[MindMapJob] Reduce completed in ${elapsed}ms, root: "${parsedTree.topic}", branches: ${parsedTree.children?.length || 0}`
      );

      finalMindMap = { nodeData: parsedTree };
    } catch (error) {
      console.log(`[MindMapJob] Reduce failed, using smart fallback: ${error}`);
      finalMindMap = createSmartFallback(allExtractions);
    }

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
      const titleContent = allExtractions
        .map((e) => `${e.main_theme}: ${e.summary}`)
        .join(" ")
        .substring(0, 2000);
      title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
        chunk: titleContent,
      });
    } catch (_e) {
      console.log("[MindMapJob] Title generation failed, using default");
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.saveMindMapResults, {
      mindmapId,
      mindmap: finalMindMap,
      metadata: {
        title,
        nodeCount: 0,
        edgeCount: 0,
        phase: "completed",
        progress: 100,
        completedAt: Date.now(),
        mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
        mapFailedCount: failedCount.count,
      },
    });

    // Clear intermediate data
    await ctx.runMutation(internal.studio.jobMutations.mindmaps.clearMindMapMapData, { mindmapId });

    logger.jobComplete({
      title,
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
