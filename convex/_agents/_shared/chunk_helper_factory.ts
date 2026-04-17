"use node";
/**
 * Chunk helper factory for agent operations.
 *
 * Provides factory functions for creating typed packChunks and validateChunks
 * wrappers with agent-specific configuration.
 *
 * This eliminates the need for each agent to define its own wrapper functions
 * around the shared chunk operations utilities.
 */

import {
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
} from "./chunk_operations.js";
import type { ChunkConfig } from "./chunk_operations.js";
import { Send } from "@langchain/langgraph";

// ============================================================
// Types
// ============================================================

/**
 * Configuration for chunk helpers.
 */
export interface ChunkHelperConfig {
  /** Target chunk size in characters */
  targetSize: number;
  /** Minimum chunk length in characters (default: 50) */
  minChunkLength?: number;
  /** Maximum chunk length in characters (default: 50000) */
  maxChunkLength?: number;
}

/**
 * Chunk helpers providing packChunks and validateChunks functions.
 */
export interface ChunkHelpers {
  /** Packs chunks into groups of target size */
  packChunks: (chunks: string[]) => string[];
  /** Validates chunks meet size requirements */
  validateChunks: (chunks: string[]) => string[];
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Creates typed packChunks and validateChunks helpers for a specific agent.
 *
 * This factory wraps the shared chunk operations utilities with agent-specific
 * configuration, eliminating the need for each agent to define its own wrappers.
 *
 * @param agentName - Name of the agent (for logging)
 * @param config - Chunk configuration
 * @returns Object containing packChunks and validateChunks functions
 *
 * @example
 * ```typescript
 * // Create chunk helpers for FlashcardGraph
 * const { packChunks, validateChunks } = createChunkHelpers('FlashcardGraph', {
 *   targetSize: 30000,
 *   minChunkLength: 50,
 *   maxChunkLength: 50000,
 * });
 *
 * // Use in agent
 * const packed = packChunks(chunks);
 * const validated = validateChunks(chunks);
 * ```
 */
export function createChunkHelpers(agentName: string, config: ChunkHelperConfig): ChunkHelpers {
  const chunkConfig: ChunkConfig = {
    targetSize: config.targetSize,
    minChunkLength: config.minChunkLength ?? 50,
    maxChunkLength: config.maxChunkLength ?? 50000,
    agentName,
  };

  return {
    /**
     * Packs chunks into groups of approximately targetSize characters.
     * Wraps shared packChunks utility with agent configuration.
     */
    packChunks: (chunks: string[]) => sharedPackChunks(chunks, chunkConfig),

    /**
     * Validates chunks meet size requirements.
     * Wraps shared validateChunks utility with agent configuration.
     */
    validateChunks: (chunks: string[]) => sharedValidateChunks(chunks, chunkConfig),
  };
}

/**
 * Creates chunk helpers from environment variable patterns.
 *
 * This is a convenience function that reads chunk size from standard env
 * variable naming conventions (e.g., FLASHCARD_MAP_CHUNK_SIZE).
 *
 * @param agentName - Name of the agent (for logging and env var prefix)
 * @param env - Environment variables object
 * @param defaultTargetSize - Default target size if env var not found
 * @returns Object containing packChunks and validateChunks functions
 *
 * @example
 * ```typescript
 * import { env } from '../../_lib/env';
 *
 * const chunkHelpers = createChunkHelpersFromEnv(
 *   'FlashcardGraph',
 *   env,
 *   30000
 * );
 *
 * // Will look for env.FLASHCARDGRAPH_MAP_CHUNK_SIZE or env.FLASHCARD_MAP_CHUNK_SIZE
 * ```
 */
export function createChunkHelpersFromEnv(
  agentName: string,
  env: Record<string, string | undefined>,
  defaultTargetSize: number
): ChunkHelpers {
  const normalizedAgentName = agentName.replace(/Graph$/, "");
  const envKey = `${normalizedAgentName.toUpperCase()}_MAP_CHUNK_SIZE`;
  const targetSize = parseInt(env[envKey] || "", 10) || defaultTargetSize;

  return createChunkHelpers(agentName, { targetSize });
}

/**
 * Creates a route function for MapReduce graphs that packs chunks and
 * creates Send objects for parallel processing.
 *
 * @param packChunksFn - Function to pack chunks
 * @param mapNodeName - Name of the map node (default: 'map')
 * @param agentName - Agent name for logging
 * @returns A route function
 *
 * @example
 * ```typescript
 * const routeToMap = createMapRoute(
 *   (chunks) => packChunks(chunks, 15000),
 *   'extract_beats',
 *   'AudioOverviewGraph'
 * );
 *
 * builder.addConditionalEdges(START, routeToMap);
 * ```
 */
export function createMapRoute(
  packChunksFn: (chunks: string[]) => string[],
  mapNodeName: string = "map",
  agentName: string = "Agent"
): (state: { chunks: string[] }) => Send[] | "collapse" {
  return (state: { chunks: string[] }) => {
    if (state.chunks.length === 0) {
      console.log(
        JSON.stringify({
          agent: agentName,
          phase: "route_to_map",
          message: "No chunks to process, routing to collapse",
        })
      );
      return "collapse";
    }

    const packedChunks = packChunksFn(state.chunks);

    console.log(
      JSON.stringify({
        agent: agentName,
        phase: "route_to_map",
        originalChunks: state.chunks.length,
        packedChunks: packedChunks.length,
        message: `Creating ${packedChunks.length} parallel map tasks`,
      })
    );

    return packedChunks.map(
      (chunk, idx) =>
        new Send(mapNodeName, {
          chunk,
          chunkIndex: idx,
          totalChunks: packedChunks.length,
        })
    );
  };
}
