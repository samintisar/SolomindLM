/**
 * Environment variables for Convex functions
 * Centralized config to avoid circular dependencies
 */

export const env = {
  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",

  // Together AI
  TOGETHER_AI_API_KEY: process.env.TOGETHER_AI_API_KEY || "",
  FAST_LLM: process.env.FAST_LLM || "openai/gpt-oss-120b",
  SMART_LLM: process.env.SMART_LLM || "openai/gpt-oss-120b",
  REPORT_LLM: process.env.REPORT_LLM || process.env.SMART_LLM || "openai/gpt-oss-120b",
  FLASHCARDS_LLM: process.env.FLASHCARDS_LLM || process.env.SMART_LLM || "openai/gpt-oss-120b",
  QUIZ_LLM: process.env.QUIZ_LLM || process.env.SMART_LLM || "openai/gpt-oss-120b",
  MINDMAP_LLM: process.env.MINDMAP_LLM || process.env.SMART_LLM || "openai/gpt-oss-120b",
  SPREADSHEET_LLM: process.env.SPREADSHEET_LLM || process.env.SMART_LLM || "openai/gpt-oss-120b",
  WRITTEN_QUESTIONS_LLM: process.env.WRITTEN_QUESTIONS_LLM || process.env.SMART_LLM || "openai/gpt-oss-120b",
  AUDIO_LLM: process.env.AUDIO_LLM || process.env.SMART_LLM || "openai/gpt-oss-120b",

  // Tavily (web search + extraction + deep research)
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",

  // Academic APIs
  SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY || "",
  PUBMED_EMAIL: process.env.PUBMED_EMAIL || "",

  // Mistral (OCR)
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || "",

  // LangSmith (tracing)
  LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY || "",
  LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT || "",
  LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT || "",
  LANGSMITH_TRACING: process.env.LANGSMITH_TRACING || "false",

  // LangChain env vars
  LANGCHAIN_API_KEY: process.env.LANGCHAIN_API_KEY || "",
  LANGCHAIN_PROJECT: process.env.LANGCHAIN_PROJECT || "",
  LANGCHAIN_TRACING_V2: process.env.LANGCHAIN_TRACING_V2 || "false",

  // Supadata
  SUPADATA_API_KEY: process.env.SUPADATA_API_KEY || "",

  // Audio Overview
  AUDIO_MAP_CHUNK_TOKENS: "20000",
  AUDIO_REDUCE_CHUNK_TOKENS: "40000",
  AUDIO_MAP_TIMEOUT_MS: "300000",
  AUDIO_REDUCE_TIMEOUT_MS: "300000",
  /** Max completion tokens for script-writing (reduce); too low yields finish_reason=length and empty content */
  AUDIO_REDUCE_MAX_OUTPUT_TOKENS: "16384",
  AUDIO_TTS_TIMEOUT_MS: "300000",
  /** Together AI TTS model (e.g. Kokoro). */
  AUDIO_TTS_MODEL: "hexgrad/Kokoro-82M",
  /** Kokoro voice IDs — see Together text-to-speech docs. Override via AUDIO_VOICE_HOST_A / _B env vars. */
  AUDIO_VOICE_HOST_A: process.env.AUDIO_VOICE_HOST_A || "af_sky",
  AUDIO_VOICE_HOST_B: process.env.AUDIO_VOICE_HOST_B || "am_echo",

  // Flashcards
  FLASHCARD_MAP_CHUNK_TOKENS: "5000",
  FLASHCARD_REDUCE_CHUNK_TOKENS: "10000",
  FLASHCARD_MAP_TIMEOUT_MS: "180000",
  FLASHCARD_REDUCE_TIMEOUT_MS: "240000",
  FLASHCARD_REDUCE_MAX_TOKENS: "32000",

  // Quiz (map chunk was 2500 when timeout-sensitive; 5000 is safe with current model latency)
  QUIZ_MAP_CHUNK_TOKENS: "5000",
  QUIZ_REDUCE_CHUNK_TOKENS: "10000",
  QUIZ_MAP_TIMEOUT_MS: "400000",
  QUIZ_REDUCE_TIMEOUT_MS: "400000",
  QUIZ_MIN_QUESTIONS_PER_CHUNK: "2",
  QUIZ_MAX_QUESTIONS_PER_CHUNK: "20",
  QUIZ_MIN_CHUNKS: "2",
  QUIZ_MAX_TOKENS: "8000",
  QUIZ_REDUCE_MAX_TOKENS: "24000",
  QUIZ_EXPAND_MAX_TOKENS: "4096",
  QUIZ_EXPAND_CONCURRENCY: "5",

  // Mindmap
  MINDMAP_MAP_CHUNK_TOKENS: "5000",
  MINDMAP_REDUCE_CHUNK_TOKENS: "10000",
  MINDMAP_MAP_TIMEOUT_MS: "300000",
  MINDMAP_REDUCE_TIMEOUT_MS: "300000",

  // Report
  REPORT_MAP_CHUNK_TOKENS: "5000",
  REPORT_REDUCE_CHUNK_TOKENS: "15000",
  REPORT_MAP_TIMEOUT_MS: "600000",
  REPORT_REDUCE_TIMEOUT_MS: "600000",
  REPORT_MAP_MAX_OUTPUT_TOKENS: "8192",
  REPORT_REDUCE_MAX_OUTPUT_TOKENS: "32000",
  REPORT_COLLAPSE_CONCURRENCY: "5",
  REPORT_MAX_TOKENS: "64000",

  // Infographics
  INFOGRAPHIC_MAX_TOKENS: "8000",
  INFOGRAPHIC_GENERATION_TIMEOUT_MS: "180000",
  INFOGRAPHIC_IMAGE_TIMEOUT_MS: "180000",

  // Spreadsheet
  SPREADSHEET_MAP_CHUNK_TOKENS: "5000",
  SPREADSHEET_REDUCE_CHUNK_TOKENS: "15000",
  SPREADSHEET_MAP_MAX_OUTPUT_TOKENS: "8192",
  SPREADSHEET_REDUCE_MAX_OUTPUT_TOKENS: "32000",
  SPREADSHEET_COLLAPSE_CONCURRENCY: "5",
  SPREADSHEET_MAP_TIMEOUT_MS: "300000",
  SPREADSHEET_REDUCE_TIMEOUT_MS: "300000",

  // Written Questions
  WRITTEN_QUESTIONS_MAP_CHUNK_TOKENS: "5000",
  WRITTEN_QUESTIONS_REDUCE_CHUNK_TOKENS: "10000",
  WRITTEN_QUESTIONS_MAP_TIMEOUT_MS: "300000",
  WRITTEN_QUESTIONS_REDUCE_TIMEOUT_MS: "300000",
  WRITTEN_QUESTIONS_MIN_QUESTIONS_PER_CHUNK: "2",
  WRITTEN_QUESTIONS_MAX_QUESTIONS_PER_CHUNK: "30",
  WRITTEN_QUESTIONS_MIN_CHUNKS: "2",
  WRITTEN_QUESTIONS_REDUCE_MAX_TOKENS: "32000",
  WRITTEN_QUESTIONS_MAX_COLLAPSE_DEPTH: "3",
  WRITTEN_QUESTIONS_DYNAMIC_BUFFER_MULTIPLIER: "1.5",
  WRITTEN_QUESTIONS_CHUNK_COVERAGE_THRESHOLD: "0.7",

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "",
  STRIPE_PRO_YEARLY_PRICE_ID: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "",

  // Chat (RAG + reranking)
  CHAT_LLM_TEMPERATURE: "0.2",
  CHAT_VECTOR_MATCH_THRESHOLD: "0.4",
  CHAT_VECTOR_MATCH_COUNT: "25",
  CHAT_RERANK_THRESHOLD: "10",
  CHAT_RERANK_TOP_N: "7",
  CHAT_MAX_RESULTS: "7",
  /** Minimum relevance score for chunks to be considered for context (0.0-1.0). Chunks below this threshold are filtered out. */
  CHAT_MIN_RELEVANCE_THRESHOLD: "0.20",
  /** Maximum tokens for retrieved context chunks (not counting conversation history or system prompt). */
  CHAT_CONTEXT_TOKEN_BUDGET: "8000",
  /** Hard maximum number of chunks to include as a safety cap (prevents pathologically many tiny chunks). */
  CHAT_MAX_CHUNKS_HARD_LIMIT: "50",
  /** Estimated-token budget for prior conversation turns (not including the current user message). */
  CHAT_HISTORY_TOKEN_BUDGET: "4000",
  /** Grounding: async (stream-first + warn), sync (validate + strict retry before stream), off. */
  CHAT_GROUNDING_MODE: "async",
  /** Whole-answer vs cited-chunks embedding similarity bar (grounding_validator). */
  GROUNDING_SIMILARITY_THRESHOLD: "0.30",

  // Hybrid Search
  CHAT_ENABLE_HYBRID_SEARCH: "true",
  CHAT_KEYWORD_MATCH_COUNT: "50",
  CHAT_RRF_K: "60",
  CHAT_HYBRID_THRESHOLD: "0.012",

  // ZeroEntropy (reranking)
  ZEROENTROPY_API_KEY: process.env.ZEROENTROPY_API_KEY || "",
  ZEROENTROPY_RERANK_MODEL: process.env.ZEROENTROPY_RERANK_MODEL || "zerank-2",

  // Convex deployment info
  CONVEX_CLOUD_URL: process.env.CONVEX_CLOUD_URL || "",
};
