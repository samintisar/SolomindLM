import { supabase } from '../../config/database.js';
import { MindMapGenerationService } from '../generation/MindMapGenerationService.js';

export interface MindMapGenerationJobPayload {
  mindMapId: string;
  userId: string;
  notebookId: string;
  documentIds: string[];
  attempt?: number;
}

// Graphile Worker task handler
export async function mindMapGenerationJob(
  payload: MindMapGenerationJobPayload,
  helpers?: { addJob: (identifier: string, payload: unknown, options?: { runAt: Date }) => void }
) {
  const { mindMapId, userId: _userId, notebookId: _notebookId, documentIds, attempt = 0 } = payload;
  const jobStartTime = Date.now();

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'MindMapGeneration',
    action: 'process_job',
    mindMapId,
    attempt,
  }));

  console.log(`\n[MindMapGenerationJob] ===== JOB START =====`);
  console.log(`[MindMapGenerationJob] Mind Map ID: ${mindMapId}`);
  console.log(`[MindMapGenerationJob] Document IDs: ${documentIds.length} documents`);
  console.log(`[MindMapGenerationJob] Attempt: ${attempt}/3`);
  console.log(`[MindMapGenerationJob] Started at: ${new Date().toISOString()}`);

  const maxRetries = 3;

  try {
    // Update status to generating
    console.log(`[MindMapGenerationJob] Updating status to 'generating'...`);
    await supabase
      .from('mindmaps')
      .update({ status: 'generating' })
      .eq('id', mindMapId);
    console.log(`[MindMapGenerationJob] Status updated`);

    // Initialize service
    console.log(`[MindMapGenerationJob] Initializing MindMapGenerationService...`);
    const service = new MindMapGenerationService();
    console.log(`[MindMapGenerationJob] Service initialized`);

    // Status update callback
    // Note: For mindmaps, intermediate statuses (mapping, collapsing, reducing) are stored in metadata.phase
    // The database status field only accepts: draft, generating, completed, failed
    const onStatusUpdate = async (status: string) => {
      const elapsed = Date.now() - jobStartTime;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'MindMapGeneration',
        action: 'status_update',
        mindMapId,
        status,
        elapsedMs: elapsed,
      }));

      // For mindmaps, intermediate processing statuses go in metadata.phase only
      // The status field stays as 'generating' until completion
      const validStatuses = ['generating', 'completed', 'failed'];
      const dbStatus = validStatuses.includes(status) ? status : 'generating';

      await service.updateMindMapStatus(mindMapId, dbStatus, {
        phase: status,
        updatedAt: new Date().toISOString(),
        elapsedMs: elapsed,
      });
    };

    // Generate mind map with timeout
    console.log(`[MindMapGenerationJob] Starting generation with 10 minute timeout...`);
    const generateStart = Date.now();
    const result = await withTimeout(
      service.generateMindMap({
        documentIds,
        onStatusUpdate,
      }),
      600000, // 10 minutes total timeout (map phase ~4-5 min with retries, reduce phase ~3 min)
      'Mind map generation timed out'
    );
    const generateElapsed = Date.now() - generateStart;
    console.log(`[MindMapGenerationJob] Generation completed successfully in ${generateElapsed}ms (${(generateElapsed/1000).toFixed(1)}s)`);

    // Generate AI-powered title from mind map content
    // If data is empty or title generation fails, fall back to chunks-based generation
    console.log(`[MindMapGenerationJob] Generating title from content...`);
    let title = await service.generateTitleFromContent(result.data);
    if (title === 'Mind Map' && result.data) {
      // Data exists but got generic title, try generating from chunks
      console.log('[MindMapGeneration] Title from content was generic, trying chunks fallback');
      const chunks = await service.fetchChunks(documentIds);
      title = await service.generateTitleFromChunks(chunks);
    }
    console.log(`[MindMapGenerationJob] Title generated: "${title}"`);

    // Save mind map
    console.log(`[MindMapGenerationJob] Saving mind map to database...`);
    await service.saveMindMap({
      mindMapId,
      title,
      data: result.data,
      metadata: {
        ...result.metadata,
        phase: 'completed',
        generatedAt: new Date().toISOString(),
      },
    });
    console.log(`[MindMapGenerationJob] Mind map saved successfully`);

    const totalElapsed = Date.now() - jobStartTime;
    console.log(`\n[MindMapGenerationJob] ===== JOB COMPLETE =====`);
    console.log(`[MindMapGenerationJob] Total time: ${totalElapsed}ms (${(totalElapsed/1000).toFixed(1)}s)`);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'MindMapGeneration',
      action: 'job_complete',
      mindMapId,
      totalElapsedMs: totalElapsed,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'MindMapGeneration',
      action: 'job_error',
      mindMapId,
      error: error instanceof Error ? error.message : 'Unknown error',
      attempt,
      maxRetries,
    }));

    // Retry logic with exponential backoff
    if (attempt < maxRetries && helpers?.addJob) {
      try {
        const backoffDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        const retryAt = new Date(Date.now() + backoffDelay);

        helpers.addJob(
          'mindmapGeneration',
          { ...payload, attempt: attempt + 1 },
          { runAt: retryAt }
        );

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'MindMapGeneration',
          action: 'job_retry_scheduled',
          mindMapId,
          nextAttempt: attempt + 1,
          retryAt,
        }));
        return; // Don't throw, we'll retry
      } catch (addError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'MindMapGeneration',
          action: 'job_retry_failed',
          mindMapId,
          error: addError instanceof Error ? addError.message : 'Unknown error',
        }));
        // Fall through to mark as failed
      }
    }

    // Update failed status
    await supabase
      .from('mindmaps')
      .update({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'failed',
          failedAt: new Date().toISOString(),
          attempts: attempt + 1,
        },
      })
      .eq('id', mindMapId);

    throw error; // Re-throw so Graphile Worker knows it failed
  }
}

// Timeout wrapper for async operations
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  );

  return Promise.race([promise, timeoutPromise]);
}
