"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { ReportGraph } from '../../lib/services/agents/ReportGraph';
import { createCachedAction } from '../lib/cachedAgent';
import { CACHE_TTL } from '../lib/cache';
import { env } from '../../lib/helpers/env';

// ============================================================
// 1. Extract core generation logic into cacheable action
// ============================================================
export const generateReportInternal = internalAction({
  args: {
    chunks: v.array(v.string()),
    status: v.string(),
    reportType: v.string(),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, { chunks, status, reportType, customPrompt }) => {
    const agent = new ReportGraph(env.TOGETHER_AI_API_KEY, env.FAST_LLM, env.SMART_LLM);
    const graph = agent.buildGraph();
    const result = await graph.invoke({
      chunks,
      status,
      reportType,
      customPrompt: customPrompt ?? undefined,
    });
    return result.finalOutput || '';
  },
});

// ============================================================
// 2. Create cached version with ActionCache
// ============================================================
const reportCache = createCachedAction(
  internal.jobs.ReportGenerationJob.generateReportInternal,
  { ttl: CACHE_TTL.agent, name: "reportV1" }
);

// ============================================================
// 3. Main job uses cached action
// ============================================================
export const reportGeneration = internalAction({
  args: {
    reportId: v.id('reports'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
    reportType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { reportId, userId, notebookId, documentIds, reportType, customPrompt } = args;

    console.log('[ReportGenerationJob] Starting:', {
      reportId,
    });

    try {
      // Update status to generating - initial phase
      await ctx.runMutation(internal.jobs.helpers.updateReportStatus, {
        reportId,
        status: 'generating',
        metadata: {
          phase: 'initializing',
          progress: 5,
          currentStep: 'Initializing...',
        },
      });

      // Update: Loading documents
      await ctx.runMutation(internal.jobs.helpers.updateReportStatus, {
        reportId,
        status: 'generating',
        metadata: {
          phase: 'loading_documents',
          progress: 15,
          currentStep: 'Loading documents...',
        },
      });

      // Get document chunks
      const chunkObjects = await ctx.runAction(internal.documents.fetchChunks, {
        documentIds,
      });

      // Extract content from chunk objects for the agent
      const chunks = chunkObjects.map((chunk: any) => chunk.content);

      console.log('[ReportGenerationJob] Fetched chunks:', {
        chunkCount: chunks.length,
        totalChars: chunks.reduce((sum: number, c: string) => sum + c.length, 0),
      });

      // Update: Analyzing content
      await ctx.runMutation(internal.jobs.helpers.updateReportStatus, {
        reportId,
        status: 'generating',
        metadata: {
          phase: 'analyzing_content',
          progress: 30,
          currentStep: 'Analyzing content...',
        },
      });

      // Update: Generating report
      await ctx.runMutation(internal.jobs.helpers.updateReportStatus, {
        reportId,
        status: 'generating',
        metadata: {
          phase: 'generating_report',
          progress: 50,
          currentStep: 'Generating report...',
        },
      });

      // ============================================================
      // USE CACHED INVOCATION - This is where the magic happens
      // ============================================================
      const content = (await reportCache.fetch(ctx, {
        chunks,
        status: 'generating',
        reportType: reportType || 'summary',
        customPrompt: customPrompt ?? undefined,
      })) as string;

      // Update: Finalizing
      await ctx.runMutation(internal.jobs.helpers.updateReportStatus, {
        reportId,
        status: 'generating',
        metadata: {
          phase: 'finalizing',
          progress: 90,
          currentStep: 'Finalizing...',
        },
      });

      // Generate title from first chunk
      let title = 'Study Report';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[ReportGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Study Report';
        }
      }

      // Save results
      await ctx.runMutation(internal.jobs.helpers.saveReportResults, {
        reportId,
        content,
        metadata: {
          title,
          phase: 'completed',
          progress: 100,
          completedAt: Date.now(),
        },
      });

      console.log('[ReportGenerationJob] Completed:', {
        reportId,
        contentLength: content.length,
      });
    } catch (error) {
      console.error('[ReportGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markReportFailed, {
        reportId,
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
