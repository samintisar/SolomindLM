import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error.js';
import { env } from './config/env.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = env.PORT || 3001;

// Middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});
