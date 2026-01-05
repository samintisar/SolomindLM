import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  SUPABASE_URL: z.string(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  DATABASE_URL: z.string(), // PostgreSQL connection for Graphile Worker
  COHERE_API_KEY: z.string(),
  COHERE_EMBEDDING_MODEL: z.string().default('embed-multilingual-v3.0'),
  COHERE_RERANK_MODEL: z.string().default('rerank-v4.0-fast'),
  MISTRAL_API_KEY: z.string(),
  TOGETHER_AI_API_KEY: z.string(),
  DEEPGRAM_API_KEY: z.string(),
  FAST_LLM: z.string().default('meta-llama/Llama-3.2-3B-Instruct-Turbo'),
  SMART_LLM: z.string().optional(), // Optional: smarter model for complex tasks
  IMAGE_LLM: z.string().default('Qwen/Qwen-Image'), // Image generation model
  REPORT_MAX_TOKENS: z.string().default('64000'), // Max tokens for report output (increased to prevent truncation)
  REPORT_MAP_BATCH_SIZE: z.string().default('10'),
  // Flashcard Generation
  // Map phase (fast_llm with 131K context): ~7.5K tokens per chunk
  FLASHCARD_MAP_CHUNK_SIZE: z.string().default('30000'),
  // Reduce phase (smart_llm with 261K context): ~15K tokens per chunk
  FLASHCARD_REDUCE_CHUNK_SIZE: z.string().default('60000'),
  // Cards per chunk bounds for quality control
  FLASHCARD_MIN_CARDS_PER_CHUNK: z.string().default('2'),
  FLASHCARD_MAX_CARDS_PER_CHUNK: z.string().default('18'),
  // Minimum chunks to process for diversity
  FLASHCARD_MIN_CHUNKS: z.string().default('3'),
  // Timeout settings for LLM calls
  FLASHCARD_MAP_TIMEOUT_MS: z.string().default('180000'),
  FLASHCARD_REDUCE_TIMEOUT_MS: z.string().default('240000'),
  // Mind Map Generation
  // Map phase: 15K chars ≈ 3.75K tokens (~3% of 131K context)
  MINDMAP_MAP_CHUNK_SIZE: z.string().default('15000'),
  // Reduce phase: 30K chars for aggregation
  MINDMAP_REDUCE_CHUNK_SIZE: z.string().default('30000'),
  // Timeout settings for LLM calls
  MINDMAP_MAP_TIMEOUT_MS: z.string().default('300000'),
  MINDMAP_REDUCE_TIMEOUT_MS: z.string().default('300000'),
  // Report Generation
  // Map phase: 30K chars ≈ 7.5K tokens (~6% of 131K context)
  REPORT_MAP_CHUNK_SIZE: z.string().default('30000'),
  // Reduce phase: 60K chars ≈ 15K tokens (~6% of 261K context)
  REPORT_REDUCE_CHUNK_SIZE: z.string().default('60000'),
  // Max OUTPUT tokens for map phase (extracting topics/insights)
  REPORT_MAP_MAX_OUTPUT_TOKENS: z.string().default('8192'),
  // Max OUTPUT tokens for reduce phase (final report generation)
  REPORT_REDUCE_MAX_OUTPUT_TOKENS: z.string().default('32000'),
  // Quiz Generation
  // Map phase: 20K chars ≈ 5K tokens (~4% of 131K context)
  QUIZ_MAP_CHUNK_SIZE: z.string().default('20000'),
  // Reduce phase: 40K chars ≈ 10K tokens (~4% of 261K context)
  QUIZ_REDUCE_CHUNK_SIZE: z.string().default('40000'),
  QUIZ_MAX_TOKENS: z.string().default('16000'),
  // Timeout settings for LLM calls
  QUIZ_MAP_TIMEOUT_MS: z.string().default('180000'),
  QUIZ_REDUCE_TIMEOUT_MS: z.string().default('240000'),
  // Written Questions Generation
  // Map phase: 30K chars ≈ 7.5K tokens (~6% of 131K context)
  WRITTEN_QUESTIONS_MAP_CHUNK_SIZE: z.string().default('30000'),
  // Reduce phase: 60K chars ≈ 15K tokens (~6% of 261K context)
  WRITTEN_QUESTIONS_REDUCE_CHUNK_SIZE: z.string().default('60000'),
  // Timeout settings for LLM calls
  WRITTEN_QUESTIONS_MAP_TIMEOUT_MS: z.string().default('180000'),
  WRITTEN_QUESTIONS_REDUCE_TIMEOUT_MS: z.string().default('240000'),
  // Audio Overview Generation
  AUDIO_MAP_CHUNK_SIZE: z.string().default('15000'),
  AUDIO_REDUCE_CHUNK_SIZE: z.string().default('40000'),
  AUDIO_MAP_TIMEOUT_MS: z.string().default('180000'),
  AUDIO_REDUCE_TIMEOUT_MS: z.string().default('300000'),
  AUDIO_TTS_TIMEOUT_MS: z.string().default('300000'),
  // Deepgram Voice Models
  AUDIO_VOICE_HOST_A: z.string().default('aura-2-thalia-en'),
  AUDIO_VOICE_HOST_B: z.string().default('aura-2-hermes-en'),
  // Chat/RAG Configuration
  CHAT_LLM_TEMPERATURE: z.string().default('0.3'),
  CHAT_MAX_HISTORY_MESSAGES: z.string().default('20'),
  CHAT_VECTOR_MATCH_THRESHOLD: z.string().default('0.5'),
  CHAT_VECTOR_MATCH_COUNT: z.string().default('10'),
  CHAT_RERANK_THRESHOLD: z.string().default('3'),
  CHAT_RERANK_TOP_N: z.string().default('15'),
  CHAT_MAX_RESULTS: z.string().default('20'),
  CHAT_DOCUMENT_MAX_CHARS: z.string().default('3000'),
  SUPADATA_API_KEY: z.string(),
  TAVILY_API_KEY: z.string(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Graphile Worker Configuration
  WORKER_CONCURRENCY: z.string().default('5'),
  WORKER_INSTANCES: z.string().default('1'),
  DB_POOL_MAX: z.string().default('10'),
});

export const env = envSchema.parse(process.env);
