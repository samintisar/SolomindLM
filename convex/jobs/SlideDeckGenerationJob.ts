"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { SlideDeckGraph } from '../lib/agents/SlideDeckGraph';
import { env } from '../lib/helpers/env';

/**
 * Slide deck generation job handler
 * This is an internal action that calls the LangGraph agent
 *
 * NOTE: SlideDeckGeneration uses storage upload callbacks which makes it
 * incompatible with ActionCache. The agent needs access to ctx.storage.store()
 * which cannot be serialized for caching.
 *
 * This job remains uncached for now. To enable caching, you would need to:
 * 1. Extract slide generation logic without storage operations
 * 2. Cache that part
 * 3. Handle storage uploads separately in the main job
 */
export const slideDeckGeneration = internalAction({
  args: {
    slideDeckId: v.id('slides'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
    slideCount: v.number(),
  },
  handler: async (ctx, args) => {
    "use node";

    const { slideDeckId, userId, notebookId, documentIds, slideCount } = args;

    console.log('[SlideDeckGenerationJob] Starting:', {
      slideDeckId,
      slideCount,
    });

    try {
      // Update status to generating
      await ctx.runMutation(internal.jobs.helpers.updateSlideDeckStatus, {
        slideDeckId,
        status: 'generating',
        metadata: { phase: 'initializing' },
      });

      // Storage upload function
      const uploadStorage = async (buffer: Buffer, fileName: string) => {
        // Convert Buffer to Uint8Array for Convex storage
        const uint8Array = new Uint8Array(buffer);
        const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
        const storageId = await ctx.storage.store(blob);
        const url = await ctx.storage.getUrl(storageId);
        if (!url) throw new Error('Failed to get storage URL');
        return url;
      };

      // Initialize the agent
      const agent = new SlideDeckGraph(
        env.TOGETHER_AI_API_KEY,
        env.FAST_LLM,
        env.SMART_LLM || env.FAST_LLM,
        env.ZHIPU_API_KEY,
        uploadStorage
      );

      // Get document chunks (full objects from DB)
      const chunkObjects = await ctx.runAction(internal.documents.fetchChunks, {
        documentIds,
      });

      // Extract content strings for the agent (state expects chunks: string[])
      const chunks = chunkObjects.map((chunk: { content: string }) => chunk.content);

      // Generate slide deck using the agent
      const graph = agent.buildGraph();
      const result = await graph.invoke({
        chunks,
        status: 'generating',
      });

      // Save results - finalOutput contains the slides array
      const slides = result.finalOutput || [];

      // Generate title from first chunk
      let title = 'Slide Deck';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[SlideDeckGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Slide Deck';
        }
      }

      await ctx.runMutation(internal.jobs.helpers.saveSlideDeckResults, {
        slideDeckId,
        slides,
        metadata: {
          title,
          slideCount: slides.length,
          phase: 'completed',
          completedAt: Date.now(),
        },
      });

      console.log('[SlideDeckGenerationJob] Completed:', {
        slideDeckId,
        slideCount: slides.length,
      });
    } catch (error) {
      console.error('[SlideDeckGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markSlideDeckFailed, {
        slideDeckId,
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
