import { makeWorkerUtils, runMigrations } from 'graphile-worker';
import { pgPool } from '../config/worker.js';

// ============================================================
// JOB PRIORITY CONSTANTS
// ============================================================
// Lower number = higher priority (executed first)
// Graphile Worker default priority is 0

export const JobPriority = {
  // CRITICAL: User waiting for immediate access
  DOC_EMBEDDING: 5,

  // HIGH: Fast, interactive features
  FLASHCARD_GENERATION: 10,
  QUIZ_GENERATION: 15,

  // MEDIUM: Medium duration tasks
  WRITTEN_QUESTIONS_GENERATION: 20,
  REPORT_GENERATION: 25,

  // LOW: Slower, resource-intensive tasks
  MINDMAP_GENERATION: 40,

  // LOWEST: Very long running, can wait
  AUDIO_OVERVIEW_GENERATION: 50,
} as const;

// ============================================================
// JOB QUEUE NAMES
// ============================================================
// Use named queues for isolation if needed

export const JobQueue = {
  DEFAULT: 'default',

  // Per-user queues (sequential execution per user)
  // Usage: `user:${userId}` for strict per-user isolation
  // Usage: `user:${userId}:${shardIndex}` for limited concurrency per user

  // Task-specific queues (if you want dedicated workers)
  FAST_QUEUE: 'fast',      // For embeddings, flashcards, quizzes
  SLOW_QUEUE: 'slow',      // For reports, audio, mindmaps
} as const;

// ============================================================
// JOB OPTIONS TYPE
// ============================================================

export interface JobScheduleOptions {
  priority?: number;
  queueName?: string;
  maxAttempts?: number;
  runAt?: Date;
}

// ============================================================
// WORKER UTILITIES SINGLETON
// ============================================================

let workerUtilsPromise: ReturnType<typeof makeWorkerUtils> | null = null;

/**
 * Get or create worker utilities instance
 * Runs migrations automatically on first call
 */
export async function getWorkerUtils() {
  if (!workerUtilsPromise) {
    await runMigrations({ pgPool });
    workerUtilsPromise = makeWorkerUtils({ pgPool });
  }
  return workerUtilsPromise;
}

// ============================================================
// JOB SCHEDULING HELPERS
// ============================================================

/**
 * Add a job to the queue with proper error handling
 */
export async function scheduleJob(
  taskIdentifier: string,
  payload: unknown,
  options: JobScheduleOptions = {}
): Promise<void> {
  const workerUtils = await getWorkerUtils();

  const {
    priority = 50,
    queueName = JobQueue.DEFAULT,
    maxAttempts = 25,
    runAt,
  } = options;

  await workerUtils.addJob(
    taskIdentifier,
    payload,
    {
      queueName,
      priority,
      maxAttempts,
      runAt,
    }
  );
}

// ============================================================
// TASK-SPECIFIC HELPERS
// ============================================================

/**
 * Schedule a document embedding job
 * Priority: HIGHEST (user waiting to use document)
 */
export async function scheduleDocEmbedding(
  payload: {
    documentId: string;
    userId: string;
    noteId: string;
    type: 'file' | 'url' | 'youtube' | 'text';
    source: string;
  },
  options?: JobScheduleOptions
) {
  return scheduleJob('docEmbedding', payload, {
    priority: JobPriority.DOC_EMBEDDING,
    ...options,
  });
}

/**
 * Schedule a flashcard generation job
 * Priority: HIGH (fast, interactive feature)
 */
export async function scheduleFlashcardGeneration(
  payload: {
    flashcardId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    cardCount: number;
    difficulty: string;
    topic?: string;
  },
  options?: JobScheduleOptions
) {
  return scheduleJob('flashcardGeneration', payload, {
    priority: JobPriority.FLASHCARD_GENERATION,
    ...options,
  });
}

/**
 * Schedule a quiz generation job
 * Priority: HIGH (fast, interactive feature)
 */
export async function scheduleQuizGeneration(
  payload: {
    quizId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    questionCount: number;
    difficulty: string;
  },
  options?: JobScheduleOptions
) {
  return scheduleJob('quizGeneration', payload, {
    priority: JobPriority.QUIZ_GENERATION,
    ...options,
  });
}

/**
 * Schedule a written questions generation job
 * Priority: MEDIUM
 */
export async function scheduleWrittenQuestionsGeneration(
  payload: {
    writtenQuestionId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    questionCount: number;
  },
  options?: JobScheduleOptions
) {
  return scheduleJob('writtenQuestionsGeneration', payload, {
    priority: JobPriority.WRITTEN_QUESTIONS_GENERATION,
    ...options,
  });
}

/**
 * Schedule a mindmap generation job
 * Priority: MEDIUM
 */
export async function scheduleMindmapGeneration(
  payload: {
    mindmapId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
  },
  options?: JobScheduleOptions
) {
  return scheduleJob('mindmapGeneration', payload, {
    priority: JobPriority.MINDMAP_GENERATION,
    ...options,
  });
}

/**
 * Schedule a report generation job
 * Priority: LOW (longer duration)
 */
export async function scheduleReportGeneration(
  payload: {
    reportId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    reportType: string;
    customPrompt?: string;
  },
  options?: JobScheduleOptions
) {
  return scheduleJob('reportGeneration', payload, {
    priority: JobPriority.REPORT_GENERATION,
    ...options,
  });
}

/**
 * Schedule an audio overview generation job
 * Priority: LOWEST (very long running, can wait)
 */
export async function scheduleAudioOverviewGeneration(
  payload: {
    audioOverviewId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
  },
  options?: JobScheduleOptions
) {
  return scheduleJob('audioOverviewGeneration', payload, {
    priority: JobPriority.AUDIO_OVERVIEW_GENERATION,
    ...options,
  });
}
