import { supabase } from '../../config/database.js';
import { SlideDeckGenerationService } from '../generation/SlideDeckGenerationService.js';

export interface SlideDeckGenerationJobPayload {
  slideDeckId: string;
  userId: string;
  notebookId: string;
  documentIds: string[];
  slideType: 'detailed_deck' | 'presenter_slides';
  deckLength: 'short' | 'default';
  customPrompt?: string;
  attempt?: number;
}

// Graphile Worker task handler
export async function slideDeckGenerationJob(
  payload: SlideDeckGenerationJobPayload,
  helpers?: { addJob: (identifier: string, payload: unknown, options?: { runAt: Date }) => void }
) {
  const { slideDeckId, userId: _userId, notebookId: _notebookId, documentIds, slideType, deckLength, customPrompt, attempt = 0 } = payload;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'SlideDeckGeneration',
    action: 'process_job',
    slideDeckId,
    slideType,
    deckLength,
    attempt,
  }));

  const maxRetries = 3;

  try {
    // Update status to generating
    await supabase
      .from('slide_decks')
      .update({ status: 'generating' })
      .eq('id', slideDeckId);

    // Initialize service
    const service = new SlideDeckGenerationService();

    // Status update callback
    const onStatusUpdate = async (status: string) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'SlideDeckGeneration',
        action: 'status_update',
        slideDeckId,
        status,
      }));

      const validStatuses = ['generating', 'completed', 'failed'];
      const dbStatus = validStatuses.includes(status) ? status : 'generating';

      await service.updateSlideDeckStatus(slideDeckId, dbStatus, {
        phase: status,
        updatedAt: new Date().toISOString(),
      });
    };

    // Generate slide deck with timeout
    // Image generation takes ~70-80s per slide + processing time
    // For 12 slides max: 12 * 90s = 18 minutes, plus buffer = 25 minutes
    const result = await withTimeout(
      service.generateSlideDeck({
        documentIds,
        slideType,
        deckLength,
        customPrompt,
        onStatusUpdate,
      }),
      1500000, // 25 minutes total timeout (image generation takes ~90s per slide)
      'Slide deck generation timed out'
    );

    // Generate title from slide content
    let title = await service.generateTitleFromSlides(result.slides);
    if (title === 'Slide Deck' && result.slides.length > 0) {
      console.log('[SlideDeckGeneration] Title from slides was generic, trying chunks fallback');
      const chunks = await service.fetchChunks(documentIds);
      title = await service.generateTitleFromChunks(chunks);
    }

    // Save slide deck
    await service.saveSlideDeck({
      slideDeckId,
      title,
      slides: result.slides,
      metadata: {
        ...result.metadata,
        slideCount: result.slides.length,
        phase: 'completed',
        generatedAt: new Date().toISOString(),
      },
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'SlideDeckGeneration',
      action: 'job_complete',
      slideDeckId,
      slidesCount: result.slides.length,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'SlideDeckGeneration',
      action: 'job_error',
      slideDeckId,
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
          'slideDeckGeneration',
          { ...payload, attempt: attempt + 1 },
          { runAt: retryAt }
        );

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'SlideDeckGeneration',
          action: 'job_retry_scheduled',
          slideDeckId,
          nextAttempt: attempt + 1,
          retryAt,
        }));
        return;
      } catch (addError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'SlideDeckGeneration',
          action: 'job_retry_failed',
          slideDeckId,
          error: addError instanceof Error ? addError.message : 'Unknown error',
        }));
      }
    }

    // Mark as failed after max retries
    await supabase
      .from('slide_decks')
      .update({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'failed',
          failedAt: new Date().toISOString(),
          attempts: attempt + 1,
        },
      })
      .eq('id', slideDeckId);

    throw error;
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
