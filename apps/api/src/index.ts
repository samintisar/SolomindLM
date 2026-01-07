import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error.js';
import { env } from './config/env.js';
import { runMigrations } from 'graphile-worker';
import { pgPool } from './config/worker.js';

// Load environment variables
dotenv.config();

// Ensure Graphile Worker schema is migrated before starting server
async function ensureGraphileWorkerSchema() {
  try {
    console.log('[API] Running Graphile Worker schema migration...');
    await runMigrations({ pgPool });
    console.log('[API] Graphile Worker schema migration completed');

    // Verify the schema is installed by checking for the add_job function
    const verifyResult = await pgPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'add_job'
        AND pronamespace = 'graphile_worker'::regnamespace
      )
    `);
    if (!verifyResult.rows[0].exists) {
      throw new Error('Graphile Worker schema verification failed - add_job function not found');
    }
    console.log('[API] Graphile Worker schema verified successfully');
  } catch (error) {
    console.error('[API] CRITICAL: Graphile Worker schema migration failed:', error);
    if (error instanceof Error) {
      console.error('[API] Error details:', {
        message: error.message,
        code: (error as any).code,
      });
    }
    // Still attempt to start, but flashcard creation will fail
  }
}

const app = express();
const PORT = env.PORT || 3001;

// Middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
// JSON parser for all routes EXCEPT webhooks (webhooks need raw body for signature verification)
app.use((req, res, next) => {
  if (req.path === '/api/webhook/stripe') {
    return next();
  }
  express.json({ limit: '50mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', routes);

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'SolomindLM API',
    version: '1.0.0',
    status: 'running',
  });
});

// Error handling
app.use(errorHandler);

// Start server
async function startServer() {
  // Ensure Graphile Worker schema exists
  await ensureGraphileWorkerSchema();

  app.listen(PORT, () => {
    console.log(`
╔═════════════════════════════════════════════════════════╗
║                                                         ║
║        SolomindLM Ingestion Pipeline API               ║
║                                                         ║
║        Server running on port ${PORT}                     ║
║        Environment: ${env.NODE_ENV}                       ║
║        Background: Graphile Worker (PostgreSQL)        ║
║                                                         ║
╚═════════════════════════════════════════════════════════╝
  `);
  });
}

startServer().catch((error) => {
  console.error('[API] Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});
