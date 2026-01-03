import { supabase } from '../../config/database.js';
import { FlashcardGenerationService } from '../generation/FlashcardGenerationService.js';

export interface FlashcardGenerationJobPayload {
  flashcardId: string;
  userId: string;
  notebookId: string;
  documentIds: string[];
  cardCount: number;
  difficulty: string;
  topic?: string;
  attempt?: number;
}

// Graphile Worker task handler
export async function flashcardGenerationJob(
  payload: FlashcardGenerationJobPayload,
  helpers?: { addJob: (identifier: string, payload: unknown, options?: { runAt: Date }) => void }
) {
  const { flashcardId, userId: _userId, notebookId: _notebookId, documentIds, cardCount, difficulty, topic, attempt = 0 } = payload;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'FlashcardGeneration',
    action: 'process_job',
    flashcardId,
    cardCount,
    difficulty,
    attempt,
  }));

  const maxRetries = 3;

  try {
    // Update status to generating
    await supabase
      .from('flashcards')
      .update({ status: 'generating' })
      .eq('id', flashcardId);

    // Initialize service
    const service = new FlashcardGenerationService();

    // Status update callback
    // Note: For flashcards, intermediate statuses (mapping, collapsing, reducing) are stored in metadata.phase
    // The database status field only accepts: draft, generating, completed, failed
    const onStatusUpdate = async (status: string) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'FlashcardGeneration',
        action: 'status_update',
        flashcardId,
        status,
      }));

      // For flashcards, intermediate processing statuses go in metadata.phase only
      // The status field stays as 'generating' until completion
      const validStatuses = ['generating', 'completed', 'failed'];
      const dbStatus = validStatuses.includes(status) ? status : 'generating';

      await service.updateFlashcardStatus(flashcardId, dbStatus, {
        phase: status,
        updatedAt: new Date().toISOString(),
      });
    };

    // Generate flashcards with timeout
    const result = await withTimeout(
      service.generateFlashcards({
        documentIds,
        cardCount,
        difficulty,
        topic,
        onStatusUpdate,
      }),
      300000, // 5 minutes total timeout
      'Flashcard generation timed out'
    );

    // Generate AI-powered title from flashcard content
    // If flashcards are empty or title generation fails, fall back to chunks-based generation
    let title = await service.generateTitleFromFlashcards(result.flashcards);
    if (title === 'Flashcards' && result.flashcards.length > 0) {
      // Flashcards exist but got generic title, try generating from chunks
      console.log('[FlashcardGeneration] Title from flashcards was generic, trying chunks fallback');
      const chunks = await service.fetchChunks(documentIds);
      title = await service.generateTitleFromChunks(chunks);
    }

    // Save flashcards
    await service.saveFlashcards({
      flashcardId,
      title,
      flashcards: result.flashcards,
      metadata: {
        ...result.metadata,
        cardCount: result.flashcards.length, // Override with actual count
        phase: 'completed',
        generatedAt: new Date().toISOString(),
      },
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'FlashcardGeneration',
      action: 'job_complete',
      flashcardId,
      cardsCount: result.flashcards.length,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'FlashcardGeneration',
      action: 'job_error',
      flashcardId,
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
          'flashcardGeneration',
          { ...payload, attempt: attempt + 1 },
          { runAt: retryAt }
        );

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'FlashcardGeneration',
          action: 'job_retry_scheduled',
          flashcardId,
          nextAttempt: attempt + 1,
          retryAt,
        }));
        return; // Don't throw, we'll retry
      } catch (addError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'FlashcardGeneration',
          action: 'job_retry_failed',
          flashcardId,
          error: addError instanceof Error ? addError.message : 'Unknown error',
        }));
        // Fall through to mark as failed
      }
    }

    // Mark as failed after max retries
    await supabase
      .from('flashcards')
      .update({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'failed',
          failedAt: new Date().toISOString(),
          attempts: attempt + 1,
        },
      })
      .eq('id', flashcardId);

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
