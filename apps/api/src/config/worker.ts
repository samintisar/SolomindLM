import { Pool } from 'pg';
import { env } from './env.js';

// Graphile Worker configuration from environment
const CONCURRENCY = parseInt(env.WORKER_CONCURRENCY, 10);
const WORKER_INSTANCES = parseInt(env.WORKER_INSTANCES, 10);
const DB_POOL_MAX = parseInt(env.DB_POOL_MAX, 10);

// Calculate pool size for horizontal scaling
// Formula: (instances × concurrency) + overhead for connections
const CALCULATED_POOL_MAX = (WORKER_INSTANCES * CONCURRENCY) + 5;

// Use explicit DB_POOL_MAX if provided, otherwise calculate
const poolMax = DB_POOL_MAX > 0 ? DB_POOL_MAX : CALCULATED_POOL_MAX;

// Create a PostgreSQL connection pool for Graphile Worker
// Optimized for multiple worker instances
export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: poolMax,
  min: 5, // Keep minimum connections ready
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Fail fast if can't get connection
});

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
};
