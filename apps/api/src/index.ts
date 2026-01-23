import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error.js';
import { csrfProtection } from './middleware/csrf.js';
import { env } from './config/env.js';
import { runMigrations } from 'graphile-worker';
import { pgPool } from './config/worker.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Increase the default max listeners to prevent warnings during concurrent operations
// This is safe for I/O-bound operations like API calls and streaming responses
EventEmitter.defaultMaxListeners = 20;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../');

// Load environment variables from .env first, then .env.local
// .env.local takes precedence (loaded last with override: true)
dotenv.config({
  override: true,
  path: [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.env.local'),
  ],
});

// Ensure Graphile Worker schema is migrated before starting server
async function ensureGraphileWorkerSchema() {
  try {
    await runMigrations({ pgPool });

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
  } catch (error) {
    console.error('[API] CRITICAL: Graphile Worker schema migration failed:', error);
    // Still attempt to start, but background jobs will fail
  }
}

const app = express();
const PORT = Number(env.PORT) || 3001;

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
    // Allow requests without origin (direct browser navigation, mobile apps)
    // Origin is only sent for cross-origin AJAX requests, not direct navigation
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      // Exact match
      if (allowedOrigin === origin) {
        return true;
      }

      // Wildcard pattern support (e.g., https://*.vercel.app, https://*-*-*.vercel.app)
      if (allowedOrigin.includes('*')) {
        // Replace * with a pattern that matches any characters except /
        // This allows matching subdomains and Vercel preview URLs
        const pattern = allowedOrigin.replace(/\*/g, '[^/]+');
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
  credentials: true, // Required for cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-XSRF-Token', 'x-xsrf-token', 'X-CSRF-Token', 'x-csrf-token'],
  maxAge: 86400, // 24 hours
  exposedHeaders: ['Set-Cookie'], // Expose Set-Cookie header for Safari compatibility
}));

// Safari/iPhone compatibility headers
// These headers help with Safari's ITP (Intelligent Tracking Prevention)
app.use((req, res, next) => {
  // Set additional headers for Safari compatibility
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Ensure Vary header includes Origin for proper caching
  res.setHeader('Vary', 'Origin');
  next();
});

// JSON parser for all routes EXCEPT webhooks (webhooks need raw body for signature verification)
app.use((req, res, next) => {
  if (req.path === '/api/webhook/stripe') {
    return next();
  }
  express.json({ limit: '1mb' })(req, res, next);
});

// Parse cookies for httpOnly cookie-based authentication
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Simple request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// CSRF protection for state-changing operations
// Now required since we're using cookie-based authentication
app.use('/api', csrfProtection);

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
  try {
    // Ensure Graphile Worker schema exists
    await ensureGraphileWorkerSchema();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 SolomindLM API running on http://0.0.0.0:${PORT} (${env.NODE_ENV})`);
    });
  } catch (error) {
    console.error('[API] ❌ Failed to start server:');
    console.error(error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error('[API] ❌ Fatal error during startup:');
  console.error(error);
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
