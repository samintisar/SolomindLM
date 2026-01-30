"use node"
/**
 * Shared utilities for LLM agent operations.
 *
 * This module provides production-level patterns used across all agents:
 * - Timeout handling with proper cleanup
 * - Exponential backoff retry with smart error detection
 * - Structured JSON logging
 * - Content sanitization
 * - Chunk operations (packing, validation)
 * - Output validation
 * - Topic extraction with caching
 *
 * @example
 * ```typescript
 * import {
 *   invokeWithTimeout,
 *   invokeWithRetry,
 *   logInfo,
 *   sanitizeUserInput,
 *   packChunks,
 *   validateOutput
 * } from './shared/index.js';
 * ```
 */

// Timeout utilities
export {
  invokeWithTimeout,
  createTimeoutWrapper,
} from './timeout.js';

// Concurrency control utilities
export {
  allWithConcurrency,
  getConcurrencyLimiter,
  createLimiter,
  type AsyncTask,
} from './concurrency.js';

// Retry utilities
export {
  invokeWithRetry,
  createRetryWrapper,
  RetryPolicies,
  type RetryConfig,
} from './retry.js';

// Chunk operations
export {
  packChunks,
  validateChunks,
  calculateOptimalChunkSize,
  splitBySentenceBoundaries,
  getChunkPreview,
  type ChunkConfig,
} from './chunk-operations.js';

// Token counting utilities
export {
  countTokens,
  countTokensBatch,
  freeEncoder,
} from './tokenizer.js';

// Logging utilities
export {
  logInfo,
  logWarn,
  logError,
  logDebug,
  logPhaseStart,
  logPhaseComplete,
  logPhaseTransition,
  logBanner,
  logBatch,
  createTimer,
  createChildLogger,
  type LogContext,
  LogLevel,
} from './logging.js';

// Sanitization utilities
export {
  sanitizeUserInput,
  sanitizeFilename,
  sanitizeMarkdown,
  detectThreats,
  maskSensitiveInfo,
  validateInput,
  type SanitizeConfig,
} from './sanitization.js';

// Validation utilities
export {
  validateOutput,
  validateWithPreset,
  validateFlashcards,
  validateQuiz,
  ValidationPresets,
  type ValidationResult,
  type ValidationConfig,
} from './validation.js';

// Topic extraction utilities
export {
  TopicExtractor,
  extractTopics,
  analyzeTopicDistribution,
  createTopicRequirement,
  selectBalancedByTopic,
  type TopicExtractionConfig,
} from './topic-extraction.js';

// ============================================================
// Composable Factories (New)
// ============================================================

// State factory
export {
  createGraphState,
  type ChunkProcessStateBase,
  type CreateChunkProcessState,
  type GraphStateType,
} from './state-factory.js';

// LLM factory
export {
  createLLMs,
  createLLM,
  createLLMsFromEnv,
  type LLMConfig,
  type LLMInstances,
} from './llm-factory.js';

// Node builder
export {
  createLLMNode,
  createCollapseNode,
  createMapRouteFunction,
  type NodeConfig,
  type LLMNodeOptions,
} from './node-builder.js';

// Graph builder
export {
  buildMapReduceGraph,
  buildLinearGraph,
  buildCustomGraph,
  createConditionalRoute,
  createProgressNode,
  type MapReduceGraphConfig,
  type LinearGraphConfig,
  type NodeFunction,
  type RouteFunction,
} from './graph-builder.js';

// Chunk helper factory
export {
  createChunkHelpers,
  createChunkHelpersFromEnv,
  createMapRoute,
  type ChunkHelperConfig,
  type ChunkHelpers,
} from './chunk-helper-factory.js';

// State cleanup utilities
export {
  createCleanupNode,
  clearStateKeys,
  type CleanupNodeConfig,
  type CleanupResult,
} from './state-cleanup.js';

// LangSmith tracing utilities
export {
  createLangSmithRunConfig,
  type LangSmithRunConfig,
} from './langsmith.js';

// Progress tracking utilities
export {
  createProgressTracker,
  ProgressTracker,
  PROGRESS_PHASES,
  PHASE_NAMES,
  calculateProgress,
  createStateWithProgress,
} from './progress.js';

export type {
  ProgressCallback,
  ProgressInfo,
} from './progress.js';
