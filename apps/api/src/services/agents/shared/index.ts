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
  estimateTokens,
  getChunkPreview,
  type ChunkConfig,
} from './chunk-operations.js';

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
