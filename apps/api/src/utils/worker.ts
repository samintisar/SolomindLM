import { run, runMigrations } from 'graphile-worker';
import { pgPool } from '../config/worker.js';

// Type imports for payloads
type DocEmbeddingJobPayload = import('../services/jobs/DocEmbeddingJob.js').DocEmbeddingJobPayload;
type ReportGenerationJobPayload = import('../services/jobs/ReportGenerationJob.js').ReportGenerationJobPayload;
type MindMapGenerationJobPayload = import('../services/jobs/MindMapGenerationJob.js').MindMapGenerationJobPayload;
type FlashcardGenerationJobPayload = import('../services/jobs/FlashcardGenerationJob.js').FlashcardGenerationJobPayload;
type QuizGenerationJobPayload = import('../services/jobs/QuizGenerationJob.js').QuizGenerationJobPayload;

// Lazy import tasks to catch import errors early
async function loadTasks() {
  const { docEmbeddingJob } = await import('../services/jobs/DocEmbeddingJob.js');
  const { reportGenerationJob } = await import('../services/jobs/ReportGenerationJob.js');
  const { mindMapGenerationJob } = await import('../services/jobs/MindMapGenerationJob.js');
  const { flashcardGenerationJob } = await import('../services/jobs/FlashcardGenerationJob.js');
  const { quizGenerationJob } = await import('../services/jobs/QuizGenerationJob.js');
  return { docEmbeddingJob, reportGenerationJob, mindMapGenerationJob, flashcardGenerationJob, quizGenerationJob };
}

// ============================================================
// WINDOWS-SAFE WORKER CONFIGURATION
// ============================================================
// Minimized configuration to prevent signal handling issues on Windows.
// Let graphile-worker manage its own lifecycle and shutdown.

async function startWorker() {
  console.log('[Worker] Starting Graphile Worker...');

  // Load tasks dynamically to catch import errors
  console.log('[Worker] Loading task handlers...');
  let tasks;
  try {
    tasks = await loadTasks();
    console.log('[Worker] Task handlers loaded successfully');
  } catch (error) {
    console.error('[Worker] Failed to load task handlers:', error);
    throw error;
  }

  // Test database connection
  console.log('[Worker] Testing database connection...');
  try {
    const result = await pgPool.query('SELECT NOW()');
    console.log('[Worker] Database connection OK, server time:', result.rows[0].now);
  } catch (error) {
    console.error('[Worker] Database connection failed:', error);
    throw error;
  }

  // Run migrations to ensure worker tables exist
  console.log('[Worker] Running database migrations...');
  await runMigrations({
    pgPool,
  });
  console.log('[Worker] Migrations completed');

  // Clean up stale locks from previous crashed workers
  console.log('[Worker] Cleaning up stale locks...');
  try {
    await pgPool.query(`
      -- Unlock job queues locked for more than 5 minutes
      UPDATE graphile_worker._private_job_queues
      SET locked_at = NULL, locked_by = NULL
      WHERE locked_at < NOW() - INTERVAL '5 minutes';

      -- Unlock jobs locked for more than 30 minutes
      UPDATE graphile_worker._private_jobs
      SET locked_at = NULL, locked_by = NULL
      WHERE locked_at IS NOT NULL
        AND locked_at < NOW() - INTERVAL '30 minutes';
    `);
    console.log('[Worker] Stale locks cleaned up');
  } catch (error) {
    console.error('[Worker] Failed to clean up stale locks:', error);
  }

  console.log('[Worker] Starting Graphile Worker with concurrency=5, pollInterval=1000ms');
  console.log('[Worker] Registered tasks: docEmbedding, reportGeneration, mindmapGeneration, flashcardGeneration, quizGeneration');

  // Start worker - let graphile-worker handle signals (remove noHandleSignals)
  await run({
    pgPool,
    concurrency: 5,
    pollInterval: 1000,
    // CRITICAL: Let graphile-worker handle its own signals for proper Windows support
    // noHandleSignals: true, // REMOVED - causes issues on Windows
    taskList: {
      docEmbedding: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received docEmbedding task (Job ID: ${jobId})`);
        try {
          await tasks.docEmbeddingJob(payload as DocEmbeddingJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] docEmbedding task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] docEmbedding task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
      reportGeneration: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received reportGeneration task (Job ID: ${jobId})`);
        try {
          await tasks.reportGenerationJob(payload as ReportGenerationJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] reportGeneration task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] reportGeneration task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
      mindmapGeneration: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received mindmapGeneration task (Job ID: ${jobId})`);
        try {
          await tasks.mindMapGenerationJob(payload as MindMapGenerationJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] mindmapGeneration task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] mindmapGeneration task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
      flashcardGeneration: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received flashcardGeneration task (Job ID: ${jobId})`);
        try {
          await tasks.flashcardGenerationJob(payload as FlashcardGenerationJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] flashcardGeneration task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] flashcardGeneration task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
      quizGeneration: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received quizGeneration task (Job ID: ${jobId})`);
        try {
          await tasks.quizGenerationJob(payload as QuizGenerationJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] quizGeneration task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] quizGeneration task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
    },
  });

  console.log('[Worker] Graphile Worker started successfully');

  // Keep the process alive with a periodic heartbeat
  setInterval(async () => {
    try {
      // Cleanup stale locks every heartbeat (10 seconds)
      await pgPool.query(`
        -- Unlock job queues locked for more than 5 minutes
        UPDATE graphile_worker._private_job_queues
        SET locked_at = NULL, locked_by = NULL
        WHERE locked_at < NOW() - INTERVAL '5 minutes';

        -- Unlock jobs locked for more than 30 minutes
        UPDATE graphile_worker._private_jobs
        SET locked_at = NULL, locked_by = NULL
        WHERE locked_at IS NOT NULL
          AND locked_at < NOW() - INTERVAL '30 minutes';
      `);

      // Check pending jobs with details
      const jobsResult = await pgPool.query(
        `SELECT id, task_identifier, run_at, locked_at, attempts, max_attempts, last_error
         FROM graphile_worker.jobs
         WHERE locked_at IS NULL
         ORDER BY created_at ASC
         LIMIT 10`
      );
      const pendingCount = jobsResult.rows.length;
      console.log(`[Worker] Heartbeat: ${pendingCount} pending jobs`);

      // Log details of pending jobs
      if (pendingCount > 0) {
        console.log('[Worker] Pending jobs details:');
        for (const row of jobsResult.rows) {
          console.log(`[Worker]   - Job ID: ${row.id}, Task: ${row.task_identifier}, Run at: ${row.run_at}, Attempts: ${row.attempts}/${row.max_attempts}, Last error: ${row.last_error || 'none'}`);
        }
      }

      // Check locked jobs
      const lockedResult = await pgPool.query(
        `SELECT id, task_identifier, locked_at, locked_by
         FROM graphile_worker.jobs
         WHERE locked_at IS NOT NULL`
      );
      const lockedCount = lockedResult.rows.length;
      if (lockedCount > 0) {
        console.log(`[Worker] Currently locked jobs: ${lockedCount}`);
        for (const row of lockedResult.rows) {
          console.log(`[Worker]   - Job ID: ${row.id}, Task: ${row.task_identifier}, Locked at: ${row.locked_at}, Locked by: ${row.locked_by}`);
        }
      }
    } catch (error) {
      console.error('[Worker] Heartbeat failed:', error);
    }
  }, 10000);
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the worker
startWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
