import { supabase } from '../../config/database.js';
import { QuizGenerationService } from '../generation/QuizGenerationService.js';

export interface QuizGenerationJobPayload {
  quizId: string;
  userId: string;
  notebookId: string;
  documentIds: string[];
  questionCount: number;
  difficulty: string;
  focus?: string;
  attempt?: number;
}

// Graphile Worker task handler
export async function quizGenerationJob(
  payload: QuizGenerationJobPayload,
  helpers?: { addJob: (identifier: string, payload: unknown, options?: { runAt: Date }) => void }
) {
  const { quizId, userId: _userId, notebookId: _notebookId, documentIds, questionCount, difficulty, focus, attempt = 0 } = payload;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'QuizGeneration',
    action: 'process_job',
    quizId,
    questionCount,
    difficulty,
    attempt,
  }));

  const maxRetries = 3;

  try {
    // Update status to generating
    await supabase
      .from('quizzes')
      .update({ status: 'generating' })
      .eq('id', quizId);

    // Initialize service
    const service = new QuizGenerationService();

    // Status update callback
    const onStatusUpdate = async (status: string) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'QuizGeneration',
        action: 'status_update',
        quizId,
        status,
      }));

      const validStatuses = ['generating', 'completed', 'failed'];
      const dbStatus = validStatuses.includes(status) ? status : 'generating';

      await service.updateQuizStatus(quizId, dbStatus, {
        phase: status,
        updatedAt: new Date().toISOString(),
      });
    };

    // Generate quiz with timeout
    const result = await withTimeout(
      service.generateQuiz({
        documentIds,
        questionCount,
        difficulty,
        focus,
        onStatusUpdate,
      }),
      300000, // 5 minutes total timeout
      'Quiz generation timed out'
    );

    // Generate AI-powered title from quiz content
    let title = await service.generateTitleFromQuestions(result.questions);
    if (title === 'Quiz' && result.questions.length > 0) {
      console.log('[QuizGeneration] Title from questions was generic, trying chunks fallback');
      const chunks = await service.fetchChunks(documentIds);
      title = await service.generateTitleFromChunks(chunks);
    }

    // Save quiz
    await service.saveQuiz({
      quizId,
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
      service: 'QuizGeneration',
      action: 'job_complete',
      quizId,
      questionsCount: result.questions.length,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'QuizGeneration',
      action: 'job_error',
      quizId,
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
          'quizGeneration',
          { ...payload, attempt: attempt + 1 },
          { runAt: retryAt }
        );

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'QuizGeneration',
          action: 'job_retry_scheduled',
          quizId,
          nextAttempt: attempt + 1,
          retryAt,
        }));
        return;
      } catch (addError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'QuizGeneration',
          action: 'job_retry_failed',
          quizId,
          error: addError instanceof Error ? addError.message : 'Unknown error',
        }));
      }
    }

    // Mark as failed after max retries
    await supabase
      .from('quizzes')
      .update({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'failed',
          failedAt: new Date().toISOString(),
          attempts: attempt + 1,
        },
      })
      .eq('id', quizId);

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
