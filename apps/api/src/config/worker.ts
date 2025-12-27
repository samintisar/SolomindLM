import { Pool } from 'pg';
import { env } from './env.js';

// Create a PostgreSQL connection pool for Graphile Worker
export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
});

// Graphile Worker options
export const workerOptions = {
  pgPool,
  concurrency: 5,
  // Poll interval in milliseconds
  pollInterval: 2000,
};
