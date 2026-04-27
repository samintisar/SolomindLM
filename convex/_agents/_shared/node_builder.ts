"use node";
/**
 * Node builder for agent operations.
 *
 * Provides factory functions for creating standard node patterns used across
 * all graph-based agents.
 *
 * This eliminates boilerplate code for common node patterns like:
 * - LLM invocation with timeout and retry
 * - Progress tracking updates
 * - Error handling and logging
 */

import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { BaseMessage, MessageContent } from "@langchain/core/messages";
import { Send } from "@langchain/langgraph";

// Import shared utilities
import { invokeWithTimeout, invokeWithRetry } from "./index.js";
import { createAgentGraphLogger, type JobLogger } from "./logging.js";
import type { RetryConfig } from "./retry.js";
import type { ProgressInfo } from "./state_factory.js";

// ============================================================
// Types
// ============================================================

/**
 * Type for LLM response with content property
 */
interface LLMResponse {
  content: MessageContent;
}

/**
 * Configuration for creating LLM-based node functions.
 */
export interface NodeConfig {
  /** Agent name for logging (e.g., 'FlashcardGraph', 'AudioOverviewGraph') */
  agentName: string;
  /** Phase name for logging (e.g., 'map', 'reduce', 'extract_beats') */
  phase: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Optional retry configuration */
  retryConfig?: RetryConfig;
  /** Optional progress updater function */
  updateProgress?: (progress: Partial<ProgressInfo>) => Partial<ProgressInfo>;
}

/**
 * Options for LLM node creation.
 */
export interface LLMNodeOptions<TInput = unknown, TOutput = unknown> {
  /** System message to send to the LLM */
  systemMessage: string;
  /** Function to get the human message from input state */
  getUserMessage: (input: TInput) => string | BaseMessage;
  /** Function to transform the LLM response into output state */
  transformResponse?: (response: string, input: TInput) => Partial<TOutput>;
  /** Custom error handler */
  onError?: (error: Error, input: TInput) => Partial<TOutput> | null;
}

/**
 * Result handler for LLM node.
 */
export type ResultHandler<TInput, TOutput> = (
  response: string,
  input: TInput,
  startTime: number
) => Partial<TOutput>;

// ============================================================
// Factory Functions
// ============================================================

function loggerForNodeConfig(config: NodeConfig) {
  return createAgentGraphLogger(config.agentName);
}

/**
 * Creates a standard LLM node function with timeout, retry, and logging.
 *
 * This factory handles the common pattern of:
 * 1. Logging phase start
 * 2. Invoking LLM with timeout and retry
 * 3. Transforming response to output state
 * 4. Logging phase complete
 * 5. Error handling with fallback
 *
 * @param llm - The LLM instance to use
 * @param options - Node options including system message and transformers
 * @param config - Node configuration for logging and timing
 * @returns A node function that can be used in StateGraph
 *
 * @example
 * ```typescript
 * const mapNode = createLLMNode(
 *   fastLlm,
 *   {
 *     systemMessage: 'You are extracting key points from text.',
 *     getUserMessage: (state: ChunkProcessState) => state.chunk,
 *     transformResponse: (response) => ({
 *       mapOutputs: [response],
 *       progress: { phase: 'map', percentage: 50 },
 *     }),
 *   },
 *   {
 *     agentName: 'FlashcardGraph',
 *     phase: 'map',
 *     timeoutMs: 180000,
 *   }
 * );
 * ```
 */
export function createLLMNode<TInput = unknown, TOutput = unknown>(
  llm: BaseLanguageModel,
  options: LLMNodeOptions<TInput, TOutput>,
  config: NodeConfig
): (input: TInput) => Promise<Partial<TOutput>> {
  return async (input: TInput): Promise<Partial<TOutput>> => {
    const startTime = Date.now();
    const logger = loggerForNodeConfig(config);

    logger.phaseStart(config.phase, { agent: config.agentName });

    try {
      // Prepare messages
      const userMessage = options.getUserMessage(input);
      const messages = [
        { role: "system" as const, content: options.systemMessage },
        typeof userMessage === "string"
          ? { role: "human" as const, content: userMessage }
          : userMessage,
      ];

      // Invoke LLM with timeout and retry
      const response = await invokeWithRetry(
        () =>
          invokeWithTimeout(
            () => llm.invoke(messages as BaseMessage[]),
            config.timeoutMs,
            `${config.agentName}${config.phase}`
          ),
        config.retryConfig || {
          maxAttempts: 3,
          baseDelayMs: 1000,
        },
        `${config.agentName}${config.phase}`
      );

      const responseText = String((response as LLMResponse).content);

      // Transform response to output state
      const output = options.transformResponse
        ? options.transformResponse(responseText, input)
        : defaultResultHandler(responseText, input, startTime, config);

      const elapsed = Date.now() - startTime;

      logger.phaseComplete(config.phase, {
        agent: config.agentName,
        outputLength: responseText.length,
        processingTimeMs: elapsed,
      });

      return output;
    } catch (error) {
      const elapsed = Date.now() - startTime;

      const err = error instanceof Error ? error : new Error(String(error));
      logger.phaseError(config.phase, err, {
        agent: config.agentName,
        processingTimeMs: elapsed,
      });

      // Handle error with custom handler or rethrow
      if (options.onError) {
        const fallback = options.onError(error as Error, input);
        if (fallback !== null) {
          return fallback;
        }
      }

      throw error;
    }
  };
}

/**
 * Default result handler for LLM nodes.
 * Returns a partial state with the response and basic progress.
 */
function defaultResultHandler<TOutput>(
  response: string,
  _input: unknown,
  startTime: number,
  config: NodeConfig
): Partial<TOutput> {
  const _elapsed = Date.now() - startTime;

  return {
    [config.phase]: response,
    progress: {
      phase: config.phase,
      percentage: 0, // Caller should override
      message: `${config.phase} complete`,
    },
  } as unknown as Partial<TOutput>;
}

/**
 * Creates a collapse node that recursively collapses multiple outputs.
 *
 * @param config - Node configuration
 * @param maxOutputsPerCollapse - Maximum outputs to collapse in one pass
 * @returns A node function that collapses outputs
 *
 * @example
 * ```typescript
 * const collapseNode = createCollapseNode(
 *   { agentName: 'FlashcardGraph', phase: 'collapse', timeoutMs: 60000 },
 *   10
 * );
 * ```
 */
export function createCollapseNode<TState extends { mapOutputs: string[] }>(
  config: NodeConfig,
  maxOutputsPerCollapse: number = 10
): (state: TState) => Promise<Partial<TState>> {
  return async (state: TState): Promise<Partial<TState>> => {
    const logger = loggerForNodeConfig(config);
    logger.phaseStart(config.phase, {
      agent: config.agentName,
      inputCount: state.mapOutputs.length,
    });

    const collapsed = recursiveCollapse(state.mapOutputs, maxOutputsPerCollapse, logger);

    logger.info(`Collapsed ${state.mapOutputs.length} outputs to ${collapsed.length}`, {
      agent: config.agentName,
      phase: config.phase,
      outputCount: collapsed.length,
    });

    return {
      collapsedOutputs: collapsed,
      progress: {
        phase: config.phase,
        percentage: 50,
        message: `Consolidated ${state.mapOutputs.length} chunks`,
      },
    } as unknown as Partial<TState>;
  };
}

/**
 * Recursively collapses an array of outputs into fewer, larger chunks.
 *
 * @param outputs - Array of output strings to collapse
 * @param maxOutputsPerCollapse - Maximum outputs to include in each collapsed chunk
 * @returns Collapsed array of strings
 */
function recursiveCollapse(
  outputs: string[],
  maxOutputsPerCollapse: number,
  logger: JobLogger
): string[] {
  if (outputs.length <= maxOutputsPerCollapse) {
    return outputs;
  }

  const collapsed: string[] = [];
  for (let i = 0; i < outputs.length; i += maxOutputsPerCollapse) {
    const batch = outputs.slice(i, i + maxOutputsPerCollapse);
    collapsed.push(batch.join("\n\n---\n\n"));
  }

  logger.info(`Recursive collapse: ${outputs.length} -> ${collapsed.length}`, {
    agent: "NodeBuilder",
    phase: "recursive_collapse",
    inputCount: outputs.length,
    outputCount: collapsed.length,
  });

  return collapsed;
}

/**
 * Creates a route function that splits chunks into parallel map tasks.
 *
 * @param packChunksFn - Function to pack chunks into groups
 * @param config - Node configuration for logging
 * @returns A route function for use with Send
 *
 * @example
 * ```typescript
 * const routeToMap = createMapRouteFunction(
 *   (chunks) => packChunks(chunks, 15000),
 *   { agentName: 'FlashcardGraph', phase: 'route_to_map', timeoutMs: 0 }
 * );
 * ```
 */
export function createMapRouteFunction<TState extends { chunks: string[] }>(
  packChunksFn: (chunks: string[]) => string[],
  config: NodeConfig
): (state: TState) => Send[] | "collapse" {
  return (state: TState) => {
    const logger = loggerForNodeConfig(config);

    if (state.chunks.length === 0) {
      logger.warn("No chunks to process, routing to collapse", {
        agent: config.agentName,
        phase: config.phase,
      });
      return "collapse";
    }

    const packedChunks = packChunksFn(state.chunks);

    logger.info(`Creating ${packedChunks.length} parallel map tasks`, {
      agent: config.agentName,
      phase: config.phase,
      originalChunks: state.chunks.length,
      packedChunks: packedChunks.length,
    });

    return packedChunks.map(
      (chunk, idx) =>
        new Send("map", {
          chunk,
          chunkIndex: idx,
          totalChunks: packedChunks.length,
        })
    );
  };
}
