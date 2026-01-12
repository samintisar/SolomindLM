import { Pool } from 'pg';
import { env } from './env.js';

// Graphile Worker configuration from environment
// Optimized for AI/LLM I/O-bound workloads
const CONCURRENCY = parseInt(env.WORKER_CONCURRENCY, 10);
const WORKER_INSTANCES = parseInt(env.WORKER_INSTANCES, 10);
const DB_POOL_MAX = parseInt(env.DB_POOL_MAX, 10);

// Calculate pool size for horizontal scaling
// Formula for AI workloads with DB access: max(concurrency + 3, 10) per instance
// Using max() ensures we have minimum connections for small instances
const CALCULATED_POOL_MAX = Math.max(CONCURRENCY + 3, 10);

// Use explicit DB_POOL_MAX if provided, otherwise calculate
const poolMax = DB_POOL_MAX > 0 ? DB_POOL_MAX : CALCULATED_POOL_MAX;

// Create a PostgreSQL connection pool for Graphile Worker
// Optimized for I/O-bound AI/LLM tasks with external API calls
// SSL configuration: Supabase uses certificates not in standard trust chain, so we allow self-signed certs
// Check if database is Supabase (Supabase requires self-signed certs to be allowed)
const isSupabaseDatabase = env.DATABASE_URL?.toLowerCase().includes('supabase') || 
                           env.DATABASE_URL?.toLowerCase().includes('.supabase.co');
// For Supabase, always allow self-signed certs (Supabase's CA isn't in standard trust chain)
// For other databases in production, enforce strict SSL
const isCloudDeployment = !!(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.VERCEL ||
  process.env.HEROKU_APP_NAME ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
);
const isProductionDeployment = env.NODE_ENV === 'production' && isCloudDeployment;
const shouldRejectUnauthorized = isProductionDeployment && !isSupabaseDatabase;

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: poolMax,
  min: Math.ceil(poolMax / 3), // Keep ~30% of connections ready (reduced from fixed 5)
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Fail fast if can't get connection
  // SSL configuration: Allow self-signed certs for Supabase, strict for other DBs in production
  ssl: shouldRejectUnauthorized ? {
    rejectUnauthorized: true, // Enforce valid SSL certificates for non-Supabase databases in production
  } : {
    rejectUnauthorized: false, // Allow self-signed certs for Supabase and local development
  },
});

// Task-specific concurrency limits for AI workloads
// Limits expensive operations while allowing fast tasks to run at higher concurrency
export const taskConcurrencyLimits: Record<string, number> = {
  // Fast operations - higher concurrency (quick LLM calls)
  flashcardGeneration: 15,
  quizGeneration: 15,

  // Medium operations - balanced concurrency
  docEmbedding: 10,
  mindmapGeneration: 10,
  writtenQuestionsGeneration: 10,

  // Resource-intensive - controlled concurrency
  reportGeneration: 5, // Longer generation tasks
  audioOverviewGeneration: 3, // Expensive Deepgram TTS calls
};

// Graphile Worker options
export const workerOptions = {
  pgPool,
  // Number of jobs to process concurrently per worker
  concurrency: CONCURRENCY,
  // Poll interval in milliseconds (default recommended: 2000ms)
  pollInterval: 2000,
};

// Export configuration for reference
export const workerConfig = {
  concurrency: CONCURRENCY,
  instances: WORKER_INSTANCES,
  poolMax,
  totalCapacity: WORKER_INSTANCES * CONCURRENCY,
  taskConcurrencyLimits,
};

// Monitoring: Pool health check query
export const poolHealthQuery = `
  SELECT count(*) as count, state
  FROM pg_stat_activity
  WHERE application_name LIKE '%graphile_worker%'
  GROUP BY state
`;

// Monitoring: Job queue depth by task
export const queueDepthQuery = `
  SELECT task_identifier, COUNT(*) as pending_count
  FROM graphile_worker.jobs
  WHERE locked_at IS NULL
  GROUP BY task_identifier
  ORDER BY pending_count DESC
`;
