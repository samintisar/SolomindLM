"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { AudioOverviewGraph } from '../../lib/services/agents/AudioOverviewGraph';
import { env } from '../../lib/helpers/env';

/**
 * Audio overview generation job handler
 * This is an internal action that calls the LangGraph agent
 *
 * NOTE: AudioOverviewGeneration returns audio buffers which cannot be
 * serialized by ActionCache (Convex has size limits on cached values).
 * This job remains uncached for now. To enable caching, you would need to:
 * 1. Extract transcript generation logic
 * 2. Cache that part
 * 3. Handle audio generation separately in the main job
 */
export const audioOverviewGeneration = internalAction({
  args: {
    audioOverviewId: v.id('audioOverviews'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
  },
  handler: async (ctx, args) => {
    "use node";

    const { audioOverviewId, userId, notebookId, documentIds } = args;

    console.log('[AudioOverviewGenerationJob] Starting:', {
      audioOverviewId,
    });

    try {
      // Update status to generating
      await ctx.runMutation(internal.jobs.helpers.updateAudioOverviewStatus, {
        audioOverviewId,
        status: 'generating',
        metadata: { phase: 'initializing' },
      });

      // Initialize the agent
      const agent = new AudioOverviewGraph(env.TOGETHER_AI_API_KEY, env.FAST_LLM, env.SMART_LLM);

      // Get document chunks (full objects from DB)
      const chunkObjects = await ctx.runAction(internal.documents.fetchChunks, {
        documentIds,
      });

      // Extract content strings for the agent (state expects chunks: string[])
      const chunks = chunkObjects.map((chunk: { content: string }) => chunk.content);

      // Generate audio overview using the agent
      const graph = agent.buildGraph();
      const result = await graph.invoke({
        chunks,
        onStatusUpdate: async (status: string) => {
          console.log('[AudioOverviewGenerationJob] Status:', status);
          await ctx.runMutation(internal.jobs.helpers.updateAudioOverviewStatus, {
            audioOverviewId,
            status: 'generating',
            metadata: { phase: status },
          });
        },
      });

      // Upload audio buffer to Convex storage (graph returns audioBuffer, not audioUrl)
      if (!result.audioBuffer || result.audioBuffer.length === 0) {
        throw new Error('No audio buffer produced by audio overview generation');
      }
      const blob = new Blob([result.audioBuffer], { type: 'audio/mpeg' });
      const storageId = await ctx.storage.store(blob);
      const audioUrl = await ctx.storage.getUrl(storageId);
      if (!audioUrl) {
        throw new Error('Failed to get Convex storage URL for audio');
      }

      // Build transcript from dialogue script (graph returns dialogueScript, not transcript)
      const transcript =
        (result as { transcript?: string }).transcript ??
        (result.dialogueScript as { text: string }[] | undefined)
          ?.map((l) => l.text)
          .join('\n') ??
        '';

      // Generate title from first chunk
      let title = 'Audio Overview';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[AudioOverviewGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Audio Overview';
        }
      }

      // Save results
      await ctx.runMutation(internal.jobs.helpers.saveAudioOverviewResults, {
        audioOverviewId,
        audioUrl,
        transcript,
        metadata: {
          title,
          ...(result.metadata ?? {}),
          phase: 'completed',
          completedAt: Date.now(),
        },
      });

      console.log('[AudioOverviewGenerationJob] Completed:', {
        audioOverviewId,
        audioUrl,
      });
    } catch (error) {
      console.error('[AudioOverviewGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markAudioOverviewFailed, {
        audioOverviewId,
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
