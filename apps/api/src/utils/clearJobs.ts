import { makeWorkerUtils } from 'graphile-worker';
import { Pool } from 'pg';
import { env } from '../config/env.js';

async function clearJobs() {
  let workerUtils;
  let pool;

  try {
    // Create a new pool for this operation
    // SSL configuration: Supabase requires self-signed certs to be allowed
    const isSupabaseDatabase = env.DATABASE_URL?.toLowerCase().includes('supabase') || 
                               env.DATABASE_URL?.toLowerCase().includes('.supabase.co');
    const isCloudDeployment = !!(
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.VERCEL ||
      process.env.HEROKU_APP_NAME ||
      process.env.AWS_LAMBDA_FUNCTION_NAME
    );
    const isProductionDeployment = env.NODE_ENV === 'production' && isCloudDeployment;
    const shouldRejectUnauthorized = isProductionDeployment && !isSupabaseDatabase;
    
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: shouldRejectUnauthorized ? {
        rejectUnauthorized: true,
      } : {
        rejectUnauthorized: false,
      },
    });

    // Initialize worker utilities
    workerUtils = await makeWorkerUtils({
      pgPool: pool,
    });

    // Get all jobs
    const jobs = await workerUtils.withPgClient(async (pgClient) => {
      const result = await pgClient.query(`
        SELECT
          task_identifier,
          COUNT(*) as count,
          MAX(attempts) as max_attempts,
          MAX(last_error) as last_error
        FROM graphile_worker.jobs
        GROUP BY task_identifier
      `);
      return result.rows;
    });

    console.log('[ClearJobs] Current jobs in queue:');
    console.table(jobs);

    // Delete from the private jobs table
    const deleted = await workerUtils.withPgClient(async (pgClient) => {
      const result = await pgClient.query(`
        WITH deleted AS (
          DELETE FROM graphile_worker._private_jobs
          RETURNING *
        )
        SELECT COUNT(*) as count FROM deleted
      `);
      return result.rows[0].count;
    });

    console.log(`[ClearJobs] Deleted ${deleted} jobs from queue`);
    console.log('[ClearJobs] Queue is now empty');
  } catch (error) {
    console.error('[ClearJobs] Error:', error);
  } finally {
    if (workerUtils) {
      await workerUtils.release();
    }
    if (pool) {
      await pool.end();
    }
  }
}

clearJobs();
