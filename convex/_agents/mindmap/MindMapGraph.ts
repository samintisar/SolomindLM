"use node";
/**
 * MindMapGraph — orchestration and public API for mind map generation.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { END, type Send, START, StateGraph } from "@langchain/langgraph";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { validateChunks } from "./chunkHelpers.js";
import { createSmartFallback as buildSmartFallbackTree } from "./fallbacks.js";
import { type MindMapMapProcessDeps, mapProcess } from "./nodeMap.js";
import { reduceNode } from "./nodeReduce.js";
import { parseMarkdownToTree as markdownToMindMapTree } from "./parsing.js";
import { NODES } from "./prompts.js";
import { createMapTasks } from "./routing.js";
import {
  type ChunkStateType,
  type ConceptExtraction,
  type FinalMindMap,
  type MindMapNode,
  OverallState,
  type OverallStateType,
} from "./state.js";
import { extractConcepts as runConceptExtraction } from "./structuredLlm.js";

export { packChunks, validateChunks } from "./chunkHelpers.js";

/**
 * MindMapGraph class that orchestrates mind map generation.
 * This is the main class that users interact with.
 */
export class MindMapGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private readonly MAX_TOTAL_FAILURES = 5;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.1,
      maxTokens: 8000,
      modelKwargs: mergeModelKwargs(mapModel, "fast"),
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: 16000,
      modelKwargs: mergeModelKwargs(reduceModel, "smart"),
    });
  }

  async mapProcess(state: ChunkStateType): Promise<Partial<OverallStateType> | Send> {
    const deps: MindMapMapProcessDeps = {
      extractConcepts: (c) => runConceptExtraction(this.fastLlm, c),
      maxTotalFailures: this.MAX_TOTAL_FAILURES,
    };
    return mapProcess(state, deps);
  }

  async reduceNode(state: OverallStateType): Promise<Partial<OverallStateType>> {
    return reduceNode(state, this.smartLlm);
  }

  parseMarkdownToTree(markdown: string): MindMapNode {
    return markdownToMindMapTree(markdown);
  }

  createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
    return buildSmartFallbackTree(extractions);
  }

  /**
   * Public API method with input validation.
   */
  async generate(chunks: string[]): Promise<FinalMindMap> {
    if (!chunks || chunks.length === 0) {
      throw new Error("No chunks provided for mind map generation");
    }

    const validated = validateChunks(chunks);
    if (validated.length === 0) {
      throw new Error("All chunks failed validation (empty or too small)");
    }

    const logger = createAgentGraphLogger("MindMapGraph", "mindmap");
    logger.info(`Starting mind map generation with ${validated.length} valid chunks`, {
      agent: "MindMapGraph",
      phase: "initialize",
      inputChunks: chunks.length,
      validChunks: validated.length,
    });

    const graph = this.buildGraph();

    try {
      const result = await graph.invoke({
        allChunks: chunks,
        status: "generating",
      });

      if (!result.finalOutput) {
        throw new Error("Graph execution completed but no output generated");
      }

      return result.finalOutput;
    } catch (error) {
      logger.phaseError("generate", error instanceof Error ? error : new Error(String(error)), {
        agent: "MindMapGraph",
      });

      throw error;
    }
  }

  /**
   * Build Graph - using correct LangGraph map-reduce pattern.
   */
  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode(NODES.MAP_PROCESS, (s: ChunkStateType) => this.mapProcess(s));
    builder.addNode(NODES.REDUCE_NODE, (s: OverallStateType) => this.reduceNode(s));

    builder.addConditionalEdges(START, createMapTasks);

    builder.addEdge(NODES.MAP_PROCESS as any, NODES.REDUCE_NODE as any);
    builder.addEdge(NODES.REDUCE_NODE as any, END);

    return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
  }
}
