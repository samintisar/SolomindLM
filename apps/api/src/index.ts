import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

// Parse allowed origins from environment variable
const allowedOrigins = env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map(o => o.trim()) : [];

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS configuration with origin validation and wildcard support
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      // Exact match
      if (allowedOrigin === origin) {
        return true;
      }

      // Wildcard pattern support (e.g., https://*.vercel.app)
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace(/\*/g, '[^.]+');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }

      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.error(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
}));
// JSON parser for all routes EXCEPT webhooks (webhooks need raw body for signature verification)
app.use((req, res, next) => {
  if (req.path === '/api/webhook/stripe') {
    return next();
  }
  express.json({ limit: '50mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Simple request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// CSRF protection (optional - for state-changing operations)
// Note: Since this uses JWT auth with Authorization headers, CSRF risk is minimal
// Uncomment the following line to enable CSRF protection:
// import { csrfProtection } from './middleware/csrf.js';
// app.use('/api', csrfProtection);

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
