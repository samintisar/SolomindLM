"use node";

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
 *   createAgentGraphLogger,
 *   sanitizeUserInput,
 *   packChunks,
 *   validateOutput
 * } from './shared/index.js';
 * ```
 */

// Chunk operations
export {
  type ChunkConfig,
  calculateOptimalChunkSize,
  getChunkPreview,
  packChunks,
  splitBySentenceBoundaries,
  validateChunks,
} from "./chunk_operations.js";

// Concurrency control utilities
export {
  type AsyncTask,
  allWithConcurrency,
  createLimiter,
  getConcurrencyLimiter,
} from "./concurrency.js";
// Logging utilities
export {
  createAgentGraphLogger,
  createJobLogger,
  type JobLogContext,
  type JobLogger,
  type JobType,
  LogLevel,
} from "./logging.js";
// Retry utilities
export { createRetryWrapper, invokeWithRetry, type RetryConfig, RetryPolicies } from "./retry.js";
// Sanitization utilities
export {
  detectThreats,
  maskSensitiveInfo,
  type SanitizeConfig,
  sanitizeFilename,
  sanitizeMarkdown,
  sanitizeUserInput,
  validateInput,
} from "./sanitization.js";
// Timeout utilities
export { createTimeoutWrapper, invokeWithTimeout } from "./timeout.js";
// Token counting utilities
export { countTokens, countTokensBatch, freeEncoder } from "./tokenizer.js";
// Topic extraction utilities
export {
  analyzeTopicDistribution,
  createTopicRequirement,
  extractTopics,
  selectBalancedByTopic,
  type TopicExtractionConfig,
  TopicExtractor,
} from "./topic_extraction.js";
// Validation utilities
export {
  type ValidationConfig,
  ValidationPresets,
  type ValidationResult,
  validateFlashcards,
  validateOutput,
  validateQuiz,
  validateWithPreset,
} from "./validation.js";

// ============================================================
// Composable Factories (New)
// ============================================================

// Graph builder
export { AGENT_LANGGRAPH_RECURSION_LIMIT } from "./agent_graph_limits.js";
// Chunk helper factory
export {
  type ChunkHelperConfig,
  type ChunkHelpers,
  createChunkHelpers,
  createChunkHelpersFromEnv,
  createMapRoute,
} from "./chunk_helper_factory.js";
export {
  buildCustomGraph,
  buildLinearGraph,
  buildMapReduceGraph,
  createConditionalRoute,
  createProgressNode,
  type LinearGraphConfig,
  type MapReduceGraphConfig,
  type NodeFunction,
  type RouteFunction,
} from "./graph_builder.js";
// LLM factory
export {
  createLLM,
  createLLMs,
  createLLMsFromEnv,
  type LLMConfig,
  type LLMInstances,
  mergeModelKwargs,
  type TogetherModelPhase,
} from "./llm_factory.js";
// Node builder
export {
  createCollapseNode,
  createLLMNode,
  createMapRouteFunction,
  type LLMNodeOptions,
  type NodeConfig,
} from "./node_builder.js";
export type { ProgressCallback, ProgressInfo } from "./progress.js";
// Progress tracking utilities
export {
  calculateProgress,
  createProgressTracker,
  createStateWithProgress,
  PHASE_NAMES,
  PROGRESS_PHASES,
  ProgressTracker,
} from "./progress.js";
// State cleanup utilities
export {
  type CleanupNodeConfig,
  type CleanupResult,
  clearStateKeys,
  createCleanupNode,
} from "./state_cleanup.js";
// State factory
export {
  type ChunkProcessStateBase,
  type CreateChunkProcessState,
  createGraphState,
  type GraphStateType,
} from "./state_factory.js";
// LangGraph partial-update helpers (avoid duplicating concat reducer fields)
export {
  mapOutputsMergeReducer,
  withoutExtractedConcepts,
  withoutMapOutputs,
  withoutResearchEvidence,
} from "./stateUpdateHelpers.js";
