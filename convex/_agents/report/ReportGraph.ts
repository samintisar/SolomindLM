"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { END, START, StateGraph, type Send } from "@langchain/langgraph";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { countTokens } from "../_shared/index.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";

import { GRAPH_CONFIG } from "./config.js";
import { validateInput } from "./inputValidation.js";
import { collapse as collapsePhase } from "./nodeCollapse.js";
import { mapProcess as mapProcessPhase } from "./nodeMap.js";
import { mergeResults as mergeResultsNode } from "./nodeMerge.js";
import { reduce as reducePhase } from "./nodeReduce.js";
import { routeToMap as routeToMapPhase } from "./routing.js";
import { MapOutputSchema, createStructuredLLM, type MapOutputInvoker } from "./structuredLlm.js";
import { OverallState, type ChunkProcessState, type OverallStateType } from "./state.js";

export { packChunks, validateChunks } from "./chunkHelpers.js";

export class ReportGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private fastLlmStructured: MapOutputInvoker;
  private maxTokens: number;

  constructor(apiKey: string, mapModel: string, reduceModel: string, maxTokens: number = GRAPH_CONFIG.MAX_TOKENS) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
      timeout: GRAPH_CONFIG.MAP_TIMEOUT_MS,
      maxTokens: GRAPH_CONFIG.MAP_MAX_OUTPUT_TOKENS,
      modelKwargs: mergeModelKwargs(mapModel, "fast"),
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.5,
      timeout: GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
      maxTokens: GRAPH_CONFIG.REDUCE_MAX_OUTPUT_TOKENS,
      modelKwargs: mergeModelKwargs(reduceModel, "smart"),
    });

    this.fastLlmStructured = createStructuredLLM(this.fastLlm, MapOutputSchema);

    this.maxTokens = maxTokens;
  }

  private estimateTokens(text: string): number {
    return countTokens(text);
  }

  routeToMap(state: OverallStateType): Send[] | "collapse" {
    return routeToMapPhase(state);
  }

  routeToMapPublic(state: OverallStateType): Send[] | "collapse" {
    return this.routeToMap(state);
  }

  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    return mapProcessPhase(state, this.fastLlmStructured);
  }

  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    return collapsePhase(state, {
      smartLlm: this.smartLlm,
      estimateTokens: this.estimateTokens.bind(this),
    });
  }

  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
    return reducePhase(state, { smartLlm: this.smartLlm });
  }

  mergeResults(state: OverallStateType): Partial<OverallStateType> {
    return mergeResultsNode(state);
  }

  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode("validate_input", (s: OverallStateType) => validateInput(s));
    builder.addNode("map_process", (s: ChunkProcessState) => this.mapProcess(s));
    builder.addNode("collapse", (s: OverallStateType) => this.collapse(s));
    builder.addNode("reduce", (s: OverallStateType) => this.reduce(s));
    builder.addNode("merge_results", (s: OverallStateType) => this.mergeResults(s));

    builder.addEdge(START, "validate_input" as never);

    builder.addConditionalEdges("validate_input" as never, (s: OverallStateType) => {
      if (s.status === "error") {
        return "merge_results";
      }
      return this.routeToMapPublic(s);
    });

    builder.addEdge("map_process" as never, "collapse" as never);
    builder.addEdge("collapse" as never, "reduce" as never);
    builder.addEdge("reduce" as never, "merge_results" as never);
    builder.addEdge("merge_results" as never, END as never);

    return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
  }
}
