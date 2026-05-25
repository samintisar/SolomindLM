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

// Timeout utilities
export { invokeWithTimeout, createTimeoutWrapper } from "./timeout.js";

// Concurrency control utilities
export {
  allWithConcurrency,
  getConcurrencyLimiter,
  createLimiter,
  type AsyncTask,
} from "./concurrency.js";

// Retry utilities
export { invokeWithRetry, createRetryWrapper, RetryPolicies, type RetryConfig } from "./retry.js";

// Chunk operations
export {
  packChunks,
  validateChunks,
  calculateOptimalChunkSize,
  splitBySentenceBoundaries,
  getChunkPreview,
  type ChunkConfig,
} from "./chunk_operations.js";

// Token counting utilities
export { countTokens, countTokensBatch, freeEncoder } from "./tokenizer.js";

// Logging utilities
export {
  createJobLogger,
  createAgentGraphLogger,
  type JobLogContext,
  type JobLogger,
  type JobType,
  LogLevel,
} from "./logging.js";

// Sanitization utilities
export {
  sanitizeUserInput,
  sanitizeFilename,
  sanitizeMarkdown,
  detectThreats,
  maskSensitiveInfo,
  validateInput,
  type SanitizeConfig,
} from "./sanitization.js";

// Validation utilities
export {
  validateOutput,
  validateWithPreset,
  validateFlashcards,
  validateQuiz,
  ValidationPresets,
  type ValidationResult,
  type ValidationConfig,
} from "./validation.js";

// Topic extraction utilities
export {
  TopicExtractor,
  extractTopics,
  analyzeTopicDistribution,
  createTopicRequirement,
  selectBalancedByTopic,
  type TopicExtractionConfig,
} from "./topic_extraction.js";

// ============================================================
// Composable Factories (New)
// ============================================================

// State factory
export {
  createGraphState,
  type ChunkProcessStateBase,
  type CreateChunkProcessState,
  type GraphStateType,
} from "./state_factory.js";

// LLM factory
export {
  createLLMs,
  createLLM,
  createLLMsFromEnv,
  mergeModelKwargs,
  type LLMConfig,
  type LLMInstances,
  type TogetherModelPhase,
} from "./llm_factory.js";

// Node builder
export {
  createLLMNode,
  createCollapseNode,
  createMapRouteFunction,
  type NodeConfig,
  type LLMNodeOptions,
} from "./node_builder.js";

// Graph builder
export { AGENT_LANGGRAPH_RECURSION_LIMIT } from "./agent_graph_limits.js";
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
} from "./graph_builder.js";

// Chunk helper factory
export {
  createChunkHelpers,
  createChunkHelpersFromEnv,
  createMapRoute,
  type ChunkHelperConfig,
  type ChunkHelpers,
} from "./chunk_helper_factory.js";

// State cleanup utilities
export {
  createCleanupNode,
  clearStateKeys,
  type CleanupNodeConfig,
  type CleanupResult,
} from "./state_cleanup.js";

// LangGraph partial-update helpers (avoid duplicating concat reducer fields)
export {
  withoutMapOutputs,
  withoutExtractedConcepts,
  withoutResearchEvidence,
  mapOutputsMergeReducer,
} from "./stateUpdateHelpers.js";

// Progress tracking utilities
export {
  createProgressTracker,
  ProgressTracker,
  PROGRESS_PHASES,
  PHASE_NAMES,
  calculateProgress,
  createStateWithProgress,
} from "./progress.js";

export type { ProgressCallback, ProgressInfo } from "./progress.js";
