"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { MindMapGraph } from '../lib/agents/MindMapGraph';
import { createCachedAction } from '../lib/cachedAgent';
import { CACHE_TTL } from '../lib/cache';
import { env } from '../lib/helpers/env';

// ============================================================
// 1. Extract core generation logic into cacheable action
// ============================================================
export const generateMindMapInternal = internalAction({
  args: {
    allChunks: v.array(v.string()),
    status: v.string(),
  },
  handler: async (ctx, { allChunks, status }) => {
    const agent = new MindMapGraph(env.TOGETHER_AI_API_KEY, env.FAST_LLM, env.SMART_LLM);
    const graph = agent.buildGraph();
    const result = await graph.invoke({
      allChunks,
      status,
    });
    return result.finalOutput;
  },
});

// ============================================================
// 2. Create cached version with ActionCache
// ============================================================
const mindmapCache = createCachedAction(
  internal.jobs.MindMapGenerationJob.generateMindMapInternal,
  { ttl: CACHE_TTL.agent, name: "mindmapV1" }
);

// ============================================================
// 3. Main job uses cached action
// ============================================================
export const mindmapGeneration = internalAction({
  args: {
    mindmapId: v.id('mindmaps'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
  },
  handler: async (ctx, args) => {
    "use node";

    const { mindmapId, userId, notebookId, documentIds } = args;

    console.log('[MindMapGenerationJob] Starting:', {
      mindmapId,
      documentCount: documentIds.length,
    });

    try {
      // Update status to generating - initial phase
      await ctx.runMutation(internal.jobs.helpers.updateMindMapStatus, {
        mindmapId,
        status: 'generating',
        metadata: {
          phase: 'initializing',
          progress: 5,
          currentStep: 'Initializing...',
        },
      });

      // Update: Loading documents
      await ctx.runMutation(internal.jobs.helpers.updateMindMapStatus, {
        mindmapId,
        status: 'generating',
        metadata: {
          phase: 'loading_documents',
          progress: 15,
          currentStep: 'Loading documents...',
        },
      });

      // Get document chunks (full objects from DB)
      const chunkObjects = await ctx.runAction(internal.documents.fetchChunks, {
        documentIds,
      });

      // Extract content strings for the agent (validator expects v.array(v.string()))
      const chunks = chunkObjects.map((chunk: { content: string }) => chunk.content);

      // Update: Analyzing content
      await ctx.runMutation(internal.jobs.helpers.updateMindMapStatus, {
        mindmapId,
        status: 'generating',
        metadata: {
          phase: 'analyzing_content',
          progress: 30,
          currentStep: 'Analyzing content...',
        },
      });

      // Update: Generating mind map
      await ctx.runMutation(internal.jobs.helpers.updateMindMapStatus, {
        mindmapId,
        status: 'generating',
        metadata: {
          phase: 'generating_mindmap',
          progress: 50,
          currentStep: 'Generating mind map...',
        },
      });

      // ============================================================
      // USE CACHED INVOCATION - This is where the magic happens
      // ============================================================
      const mindMapData = await mindmapCache.fetch(ctx, {
        allChunks: chunks,
        status: "generating",
      });

      // Update: Finalizing
      await ctx.runMutation(internal.jobs.helpers.updateMindMapStatus, {
        mindmapId,
        status: 'generating',
        metadata: {
          phase: 'finalizing',
          progress: 90,
          currentStep: 'Finalizing...',
        },
      });

      // Generate title from first chunk
      let title = 'Mind Map';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[MindMapGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Mind Map';
        }
      }

      // Save results
      await ctx.runMutation(internal.jobs.helpers.saveMindMapResults, {
        mindmapId,
        mindmap: mindMapData,
        metadata: {
          title,
          nodeCount: 0, // Will be calculated from the actual mindmap structure
          edgeCount: 0, // Will be calculated from the actual mindmap structure
          phase: 'completed',
          progress: 100,
          completedAt: Date.now(),
        },
      });

      console.log('[MindMapGenerationJob] Completed:', {
        mindmapId,
      });
    } catch (error) {
      console.error('[MindMapGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markMindMapFailed, {
        mindmapId,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          phase: 'failed',
          progress: 0,
          failedAt: Date.now(),
        },
      });

      throw error;
    }
  },
});
