import { run, runMigrations } from 'graphile-worker';
import { pgPool, workerConfig, poolHealthQuery, queueDepthQuery, taskConcurrencyLimits } from '../config/worker.js';

// Type imports for payloads
type DocEmbeddingJobPayload = import('../services/jobs/DocEmbeddingJob.js').DocEmbeddingJobPayload;
type ReportGenerationJobPayload = import('../services/jobs/ReportGenerationJob.js').ReportGenerationJobPayload;
type MindMapGenerationJobPayload = import('../services/jobs/MindMapGenerationJob.js').MindMapGenerationJobPayload;
type FlashcardGenerationJobPayload = import('../services/jobs/FlashcardGenerationJob.js').FlashcardGenerationJobPayload;
type QuizGenerationJobPayload = import('../services/jobs/QuizGenerationJob.js').QuizGenerationJobPayload;
type AudioOverviewGenerationJobPayload = import('../services/jobs/AudioOverviewGenerationJob.js').AudioOverviewGenerationJobPayload;
type WrittenQuestionsGenerationJobPayload = import('../services/jobs/WrittenQuestionsGenerationJob.js').WrittenQuestionsGenerationJobPayload;
type SlideDeckGenerationJobPayload = import('../services/jobs/SlideDeckGenerationJob.js').SlideDeckGenerationJobPayload;

// Lazy import tasks to catch import errors early
async function loadTasks() {
  const { docEmbeddingJob } = await import('../services/jobs/DocEmbeddingJob.js');
  const { reportGenerationJob } = await import('../services/jobs/ReportGenerationJob.js');
  const { mindMapGenerationJob } = await import('../services/jobs/MindMapGenerationJob.js');
  const { flashcardGenerationJob } = await import('../services/jobs/FlashcardGenerationJob.js');
  const { quizGenerationJob } = await import('../services/jobs/QuizGenerationJob.js');
  const { audioOverviewGenerationJob } = await import('../services/jobs/AudioOverviewGenerationJob.js');
  const { writtenQuestionsGenerationJob } = await import('../services/jobs/WrittenQuestionsGenerationJob.js');
  const { slideDeckGenerationJob } = await import('../services/jobs/SlideDeckGenerationJob.js');
  return { docEmbeddingJob, reportGenerationJob, mindMapGenerationJob, flashcardGenerationJob, quizGenerationJob, audioOverviewGenerationJob, writtenQuestionsGenerationJob, slideDeckGenerationJob };
}

// Heartbeat function to monitor worker health
function startHeartbeat() {
  // NOTE: Increased from 10s to 5 minutes to avoid interfering with Graphile Worker's built-in recovery mechanisms
  // Graphile Worker has native mechanisms to handle crashed workers
  setInterval(async () => {
    try {
      // Check pending jobs (summary only, no details to reduce log spam)
      const jobsResult = await pgPool.query(
        `SELECT COUNT(*) as count
         FROM graphile_worker.jobs
         WHERE locked_at IS NULL`
      );
      const pendingCount = parseInt(jobsResult.rows[0].count);
      console.log(`[Worker] Heartbeat: ${pendingCount} pending jobs`);

      // Only log details if there are many pending jobs (potential issue)
      if (pendingCount > 20) {
        const taskBreakdown = await pgPool.query(
          `SELECT task_identifier, COUNT(*) as count
           FROM graphile_worker.jobs
           WHERE locked_at IS NULL
           GROUP BY task_identifier`
        );
        console.log('[Worker] High pending job count - breakdown by task:');
        for (const row of taskBreakdown.rows) {
          console.log(`[Worker]   - ${row.task_identifier}: ${row.count}`);
        }
      }

      // Check locked jobs (summary only)
      const lockedResult = await pgPool.query(
        `SELECT COUNT(*) as count
         FROM graphile_worker.jobs
         WHERE locked_at IS NOT NULL`
      );
      const lockedCount = parseInt(lockedResult.rows[0].count);
      if (lockedCount > 0) {
        console.log(`[Worker] Currently locked jobs: ${lockedCount}`);
      }
    } catch (error) {
      console.error('[Worker] Heartbeat failed:', error);
    }
  }, 300000); // 5 minutes (300000ms) instead of 10 seconds
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

  console.log(`[Worker] Starting Graphile Worker with concurrency=${workerConfig.concurrency}, pollInterval=2000ms (Total capacity: ${workerConfig.totalCapacity})`);
  console.log('[Worker] Configuration:');
  console.log(`[Worker]   - Instances: ${workerConfig.instances}`);
  console.log(`[Worker]   - Concurrency per instance: ${workerConfig.concurrency}`);
  console.log(`[Worker]   - Total capacity: ${workerConfig.totalCapacity} jobs`);
  console.log(`[Worker]   - DB pool max: ${workerConfig.poolMax} connections`);
  console.log('[Worker] Task-specific concurrency limits:');
  for (const [task, limit] of Object.entries(taskConcurrencyLimits)) {
    console.log(`[Worker]   - ${task}: ${limit}`);
  }
  console.log('[Worker] Registered tasks: docEmbedding, reportGeneration, mindmapGeneration, flashcardGeneration, quizGeneration, audioOverviewGeneration, writtenQuestionsGeneration, slideDeckGeneration');

  // Start heartbeat in parallel (don't await it)
  startHeartbeat();

  // Start worker - let graphile-worker handle signals (remove noHandleSignals)
  const promise = run({
    pgPool,
    concurrency: workerConfig.concurrency,
    pollInterval: 2000,
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
      audioOverviewGeneration: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received audioOverviewGeneration task (Job ID: ${jobId})`);
        try {
          await tasks.audioOverviewGenerationJob(payload as AudioOverviewGenerationJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] audioOverviewGeneration task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] audioOverviewGeneration task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
      writtenQuestionsGeneration: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received writtenQuestionsGeneration task (Job ID: ${jobId})`);
        try {
          await tasks.writtenQuestionsGenerationJob(payload as WrittenQuestionsGenerationJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] writtenQuestionsGeneration task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] writtenQuestionsGeneration task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
      slideDeckGeneration: async (payload, helpers) => {
        const jobId = helpers?.job?.id || 'unknown';
        console.log(`[Worker] [${new Date().toISOString()}] Received slideDeckGeneration task (Job ID: ${jobId})`);
        try {
          await tasks.slideDeckGenerationJob(payload as SlideDeckGenerationJobPayload);
          console.log(`[Worker] [${new Date().toISOString()}] slideDeckGeneration task (Job ID: ${jobId}) completed successfully`);
        } catch (error) {
          console.error(`[Worker] [${new Date().toISOString()}] slideDeckGeneration task (Job ID: ${jobId}) failed:`, error);
          throw error;
        }
      },
    },
  });

  // The run() promise will resolve when the worker stops
  console.log('[Worker] Graphile Worker started successfully');
  await promise;
}

// Handle graceful shutdown
async function shutdown(signal: string) {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);

  try {
    // Close the database pool
    await pgPool.end();
    console.log('[Worker] Database pool closed');

    process.exit(0);
  } catch (error) {
    console.error('[Worker] Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

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
