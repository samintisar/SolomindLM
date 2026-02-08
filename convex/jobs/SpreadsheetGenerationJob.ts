"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { SpreadsheetGraph } from '../lib/agents/SpreadsheetGraph';
import { createCachedAction } from '../lib/cachedAgent';
import { CACHE_TTL } from '../lib/cache';
import { env } from '../lib/helpers/env';

// ============================================================
// 1. Extract core generation logic into cacheable action
// ============================================================
export const generateSpreadsheetInternal = internalAction({
  args: {
    chunks: v.array(v.string()),
    status: v.string(),
    spreadsheetType: v.string(),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, { chunks, status, spreadsheetType, customPrompt }) => {
    const agent = new SpreadsheetGraph(env.TOGETHER_AI_API_KEY, env.FAST_LLM, env.SMART_LLM);
    const graph = agent.buildGraph();
    const result = await graph.invoke({
      chunks,
      status,
      spreadsheetType,
      customPrompt: customPrompt ?? undefined,
    });
    return result.finalOutput || '';
  },
});

// ============================================================
// 2. Create cached version with ActionCache
// ============================================================
const spreadsheetCache = createCachedAction(
  internal.jobs.SpreadsheetGenerationJob.generateSpreadsheetInternal,
  { ttl: CACHE_TTL.agent, name: "spreadsheetV1" }
);

// ============================================================
// 3. Main job uses cached action
// ============================================================
export const spreadsheetGeneration = internalAction({
  args: {
    spreadsheetId: v.id('spreadsheets'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { spreadsheetId, userId, notebookId, documentIds, spreadsheetType, customPrompt } = args;

    console.log('[SpreadsheetGenerationJob] Starting:', {
      spreadsheetId,
    });

    try {
      // Update status to generating
      await ctx.runMutation(internal.jobs.helpers.updateSpreadsheetStatus, {
        spreadsheetId,
        status: 'generating',
        metadata: { phase: 'initializing' },
      });

      // Get document chunks (full objects from DB)
      const chunkObjects = await ctx.runAction(internal.documents.fetchChunks, {
        documentIds,
      });

      // Extract content strings for the agent (validator expects v.array(v.string()))
      const chunks = chunkObjects.map((chunk: { content: string }) => chunk.content);

      // ============================================================
      // USE CACHED INVOCATION - This is where the magic happens
      // ============================================================
      const spreadsheet = await spreadsheetCache.fetch(ctx, {
        chunks,
        status: "generating",
        spreadsheetType: spreadsheetType || 'custom',
        customPrompt: customPrompt ?? undefined,
      });

      // Generate title from first chunk
      let title = 'Spreadsheet';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[SpreadsheetGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Spreadsheet';
        }
      }

      // Save results
      await ctx.runMutation(internal.jobs.helpers.saveSpreadsheetResults, {
        spreadsheetId,
        spreadsheet,
        metadata: {
          title,
          phase: 'completed',
          completedAt: Date.now(),
        },
      });

      console.log('[SpreadsheetGenerationJob] Completed:', {
        spreadsheetId,
      });
    } catch (error) {
      console.error('[SpreadsheetGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markSpreadsheetFailed, {
        spreadsheetId,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          phase: 'failed',
          failedAt: Date.now(),
        },
      });

      throw error;
    }
  },
});
