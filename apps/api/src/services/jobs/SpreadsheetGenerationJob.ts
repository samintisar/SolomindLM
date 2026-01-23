import { supabase } from '../../config/database.js';
import { SpreadsheetGenerationService } from '../generation/SpreadsheetGenerationService.js';

export interface SpreadsheetGenerationJobPayload {
  spreadsheetId: string;
  userId: string;
  notebookId: string;
  documentIds: string[];
  spreadsheetType: string;
  customPrompt?: string;
  attempt?: number;
}

// Graphile Worker task handler
export async function spreadsheetGenerationJob(
  payload: SpreadsheetGenerationJobPayload,
  helpers?: { addJob: (identifier: string, payload: unknown, options?: { runAt: Date }) => void }
) {
  const { spreadsheetId, userId: _userId, notebookId: _notebookId, documentIds, spreadsheetType, customPrompt, attempt = 0 } = payload;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'SpreadsheetGeneration',
    action: 'process_job',
    spreadsheetId,
    spreadsheetType,
    attempt,
  }));

  const maxRetries = 3;

  try {
    // Update status to generating
    await supabase
      .from('spreadsheets')
      .update({ status: 'generating' })
      .eq('id', spreadsheetId);

    // Initialize service
    const service = new SpreadsheetGenerationService();

    // Status update callback
    const onStatusUpdate = async (status: string) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'SpreadsheetGeneration',
        action: 'status_update',
        spreadsheetId,
        status,
      }));

      const validStatuses = ['generating', 'completed', 'failed'];
      const dbStatus = validStatuses.includes(status) ? status : 'generating';

      await service.updateSpreadsheetStatus(spreadsheetId, dbStatus, {
        phase: status,
        updatedAt: new Date().toISOString(),
      });
    };

    // Generate spreadsheet with timeout
    const result = await withTimeout(
      service.generateSpreadsheet({
        documentIds,
        spreadsheetType,
        customPrompt,
        onStatusUpdate,
      }),
      300000, // 5 minutes total timeout
      'Spreadsheet generation timed out'
    );

    // Generate AI-powered title from spreadsheet content
    let title = await service.generateTitleFromContent(result.content);
    if (title === 'Spreadsheet' && result.content.length > 0) {
      console.log('[SpreadsheetGeneration] Title from content was generic, trying chunks fallback');
      const chunks = await service.fetchChunks(documentIds);
      title = await service.generateTitleFromChunks(chunks, spreadsheetType);
    }

    // Save spreadsheet
    await service.saveSpreadsheet({
      spreadsheetId,
      title,
      content: result.content,
      spreadsheetType,
      metadata: {
        ...result.metadata,
        phase: 'completed',
        generatedAt: new Date().toISOString(),
      },
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'SpreadsheetGeneration',
      action: 'job_complete',
      spreadsheetId,
      contentLength: result.content.length,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'SpreadsheetGeneration',
      action: 'job_error',
      spreadsheetId,
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
          'spreadsheetGeneration',
          { ...payload, attempt: attempt + 1 },
          { runAt: retryAt }
        );

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'SpreadsheetGeneration',
          action: 'job_retry_scheduled',
          spreadsheetId,
          nextAttempt: attempt + 1,
          retryAt,
        }));
        return; // Don't throw, we'll retry
      } catch (addError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'SpreadsheetGeneration',
          action: 'job_retry_failed',
          spreadsheetId,
          error: addError instanceof Error ? addError.message : 'Unknown error',
        }));
        // Fall through to mark as failed
      }
    }

    // Update failed status
    await supabase
      .from('spreadsheets')
      .update({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'failed',
          failedAt: new Date().toISOString(),
          attempts: attempt + 1,
        },
      })
      .eq('id', spreadsheetId);

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
