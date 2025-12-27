import pg from 'pg';
import { env } from './src/config/env.js';

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

try {
  // Get function definition
  const result = await pool.query(`
    SELECT 
      routine_schema,
      routine_name,
      routine_definition
    FROM information_schema.routines 
    WHERE routine_schema = 'graphile_worker' AND routine_name = 'reset_locked'
  `);
  console.log('Function definition:', JSON.stringify(result.rows, null, 2));
  
  // Try to call it directly
  const callResult = await pool.query('SELECT graphile_worker.reset_locked()');
  console.log('Function call result:', callResult.rows);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Full error:', error);
} finally {
  await pool.end();
}



