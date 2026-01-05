import { supabase } from '../../config/database.js';
import { WrittenQuestionsGenerationService } from '../generation/WrittenQuestionsGenerationService.js';

export interface WrittenQuestionsGenerationJobPayload {
  writtenQuestionsId: string;
  userId: string;
  notebookId: string;
  documentIds: string[];
  questionCount: number;
  difficulty: string;
  questionType: string;
  focus?: string;
  attempt?: number;
}

// Graphile Worker task handler
export async function writtenQuestionsGenerationJob(
  payload: WrittenQuestionsGenerationJobPayload,
  helpers?: { addJob: (identifier: string, payload: unknown, options?: { runAt: Date }) => void }
) {
  const { writtenQuestionsId, userId: _userId, notebookId: _notebookId, documentIds, questionCount, difficulty, questionType, focus, attempt = 0 } = payload;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'WrittenQuestionsGeneration',
    action: 'process_job',
    writtenQuestionsId,
    questionCount,
    difficulty,
    questionType,
    attempt,
  }));

  const maxRetries = 3;

  try {
    // Update status to generating
    await supabase
      .from('written_questions')
      .update({ status: 'generating' })
      .eq('id', writtenQuestionsId);

    // Initialize service
    const service = new WrittenQuestionsGenerationService();

    // Status update callback
    const onStatusUpdate = async (status: string) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'WrittenQuestionsGeneration',
        action: 'status_update',
        writtenQuestionsId,
        status,
      }));

      const validStatuses = ['generating', 'completed', 'failed'];
      const dbStatus = validStatuses.includes(status) ? status : 'generating';

      await service.updateWrittenQuestionsStatus(writtenQuestionsId, dbStatus, {
        phase: status,
        updatedAt: new Date().toISOString(),
      });
    };

    // Generate written questions with timeout
    const result = await withTimeout(
      service.generateWrittenQuestions({
        documentIds,
        questionCount,
        difficulty,
        questionType,
        focus,
        onStatusUpdate,
      }),
      300000, // 5 minutes total timeout
      'Written questions generation timed out'
    );

    // Generate AI-powered title from questions
    let title = await service.generateTitleFromQuestions(result.questions);
    if (title === 'Written Questions' && result.questions.length > 0) {
      console.log('[WrittenQuestionsGeneration] Title from questions was generic, using service fallback');
      title = service.getWrittenQuestionsTitle(focus, questionType);
    }

    // Save written questions
    await service.saveWrittenQuestions({
      writtenQuestionsId,
      title,
      questions: result.questions,
      metadata: {
        ...result.metadata,
        questionCount: result.questions.length, // Override with actual count
        phase: 'completed',
        generatedAt: new Date().toISOString(),
      },
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'WrittenQuestionsGeneration',
      action: 'job_complete',
      writtenQuestionsId,
      questionsCount: result.questions.length,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'WrittenQuestionsGeneration',
      action: 'job_error',
      writtenQuestionsId,
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
          'writtenQuestionsGeneration',
          { ...payload, attempt: attempt + 1 },
          { runAt: retryAt }
        );

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'WrittenQuestionsGeneration',
          action: 'job_retry_scheduled',
          writtenQuestionsId,
          nextAttempt: attempt + 1,
          retryAt,
        }));
        return;
      } catch (addError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'WrittenQuestionsGeneration',
          action: 'job_retry_failed',
          writtenQuestionsId,
          error: addError instanceof Error ? addError.message : 'Unknown error',
        }));
      }
    }

    // Mark as failed after max retries
    await supabase
      .from('written_questions')
      .update({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'failed',
          failedAt: new Date().toISOString(),
          attempts: attempt + 1,
        },
      })
      .eq('id', writtenQuestionsId);

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
