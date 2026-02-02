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

    console.log('[ReportGenerationJob] ==================================================');
    console.log('[ReportGenerationJob] STARTING JOB');
    console.log('[ReportGenerationJob] Args received:', {
      reportId,
      userId,
      notebookId,
      documentIds,
      reportType,
      customPrompt,
    });
    console.log('[ReportGenerationJob] reportId at start:', reportId);
    console.log('[ReportGenerationJob] ==================================================');

    try {
      // Update status to generating - initial phase
      console.log('[ReportGenerationJob] Calling updateReportStatus (initializing) with reportId:', reportId);
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
      console.log('[ReportGenerationJob] Calling updateReportStatus (loading_documents) with reportId:', reportId);
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
      console.log('[ReportGenerationJob] Calling updateReportStatus (analyzing_content) with reportId:', reportId);
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
      console.log('[ReportGenerationJob] Calling updateReportStatus (generating_report) with reportId:', reportId);
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
      console.log('[ReportGenerationJob] BEFORE reportCache.fetch - reportId:', reportId);

      let content: string;
      let generationPhase = 'llm_generation';
      try {
        console.log('[ReportGenerationJob] Starting reportCache.fetch...');
        console.log('[ReportGenerationJob] Input:', {
          chunkCount: chunks.length,
          totalChars: chunks.reduce((sum: number, c: string) => sum + c.length, 0),
          reportType: reportType || 'summary',
        });

        content = (await reportCache.fetch(ctx, {
          chunks,
          status: 'generating',
          reportType: reportType || 'summary',
          customPrompt: customPrompt ?? undefined,
        })) as string;

        console.log('[ReportGenerationJob] AFTER reportCache.fetch - reportId:', reportId);
        console.log('[ReportGenerationJob] reportId verified after cache fetch:', reportId);
        console.log('[ReportGenerationJob] Content length:', content.length);
      } catch (error) {
        // Detailed error handling with phase context
        const errorInfo = {
          phase: generationPhase,
          timestamp: new Date().toISOString(),
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
          chunkCount: chunks.length,
          totalChars: chunks.reduce((sum: number, c: string) => sum + c.length, 0),
          reportType: reportType || 'summary',
          isTimeout: error instanceof Error && (
            error.message.includes('timeout') ||
            error.message.includes('Timeout') ||
            error.message.includes('exceeded')
          ),
        };

        console.error('[ReportGenerationJob] ==================================================');
        console.error('[ReportGenerationJob] GENERATION FAILED WITH DETAILED ERROR INFO');
        console.error('[ReportGenerationJob] Error Info:', JSON.stringify(errorInfo, null, 2));
        console.error('[ReportGenerationJob] ==================================================');

        // Re-throw with enhanced error message
        const enhancedMessage = `Report generation failed in phase "${generationPhase}"` +
          (errorInfo.isTimeout ? ' due to timeout' : '') +
          `: ${errorInfo.errorMessage}`;

        const enhancedError = new Error(enhancedMessage);
        (enhancedError as any).phase = generationPhase;
        (enhancedError as any).isTimeout = errorInfo.isTimeout;
        (enhancedError as any).errorInfo = errorInfo;
        if (error instanceof Error) {
          (enhancedError as any).originalError = error;
        }

        throw enhancedError;
      }

      // Update: Finalizing
      console.log('[ReportGenerationJob] Calling updateReportStatus (finalizing) with reportId:', reportId);
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
      let title = 'Report';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[ReportGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Report';
        }
      }

      // Save results
      console.log('[ReportGenerationJob] Calling saveReportResults with reportId:', reportId);
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

      console.log('[ReportGenerationJob] ==================================================');
      console.log('[ReportGenerationJob] COMPLETED SUCCESSFULLY');
      console.log('[ReportGenerationJob] Completed:', {
        reportId,
        contentLength: content.length,
      });
      console.log('[ReportGenerationJob] ==================================================');
    } catch (error) {
      console.log('[ReportGenerationJob] ==================================================');
      console.log('[ReportGenerationJob] ERROR CAUGHT');
      console.log('[ReportGenerationJob] Error:', error);
      console.log('[ReportGenerationJob] reportId in error handler:', reportId);
      console.log('[ReportGenerationJob] About to call markReportFailed with reportId:', reportId);
      console.log('[ReportGenerationJob] ==================================================');

      // Extract enhanced error info if available
      const phase = (error as any).phase || 'unknown';
      const isTimeout = (error as any).isTimeout || false;
      const errorInfo = (error as any).errorInfo;

      // Build enhanced metadata for debugging
      const failureMetadata: any = {
        phase: 'failed',
        progress: 0,
        failedAt: Date.now(),
        errorPhase: phase,
        isTimeout: isTimeout,
        errorName: error instanceof Error ? error.name : 'Unknown',
      };

      // Include error info if available
      if (errorInfo) {
        failureMetadata.errorInfo = errorInfo;
      }

      // Include stack trace if available
      if (error instanceof Error && error.stack) {
        failureMetadata.stack = error.stack.split('\n').slice(0, 5).join('\n');
      }

      // Mark as failed with enhanced metadata
      const result = await ctx.runMutation(internal.jobs.helpers.markReportFailed, {
        reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: failureMetadata,
      });

      // If result is null, the document was deleted by the user - exit gracefully
      if (result === null) {
        console.log('[ReportGenerationJob] Document was deleted by user, exiting gracefully');
        return;
      }

      throw error;
    }
  },
});
