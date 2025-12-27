import pg from 'pg';
import { env } from './src/config/env.js';

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

try {
  // Check if schema exists
  const schemaCheck = await pool.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'graphile_worker'"
  );
  console.log('Schema exists:', schemaCheck.rows.length > 0);
  
  // Check functions in the schema
  const funcsCheck = await pool.query(
    "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'graphile_worker' ORDER BY routine_name"
  );
  console.log('Functions in graphile_worker schema:', funcsCheck.rows.map(r => r.routine_name));
  
  // Check tables
  const tablesCheck = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'graphile_worker'"
  );
  console.log('Tables in graphile_worker schema:', tablesCheck.rows.map(r => r.table_name));
} finally {
  await pool.end();
}

