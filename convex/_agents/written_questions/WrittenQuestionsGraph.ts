"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { END, START, StateGraph } from "@langchain/langgraph";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";

import { GRAPH_CONFIG } from "./config.js";
import { collapse } from "./nodeCollapse.js";
import { mapProcess } from "./nodeMap.js";
import { reduce } from "./nodeReduce.js";
import { splitChunks } from "./nodeSplit.js";
import { WrittenQuestionsArraySchema } from "./prompts.js";
import { routeToMap } from "./routing.js";
import type { ChunkProcessState, OverallStateType } from "./state.js";
import { OverallState } from "./state.js";
import { createStructuredLLM, type WrittenQuestionsOutputInvoker } from "./structuredLlm.js";

export { packChunks, validateChunks } from "./chunkHelpers.js";

export class WrittenQuestionsGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private fastLlmStructured: WrittenQuestionsOutputInvoker;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
      maxTokens: 16000,
      modelKwargs: mergeModelKwargs(mapModel, "fast"),
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: GRAPH_CONFIG.REDUCE_MAX_TOKENS,
      modelKwargs: mergeModelKwargs(reduceModel, "smart"),
    });

    this.fastLlmStructured = createStructuredLLM(this.fastLlm, WrittenQuestionsArraySchema);
  }

  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode("split_chunks", (s: OverallStateType) => splitChunks(s));
    builder.addNode("map_process", (s: ChunkProcessState) => mapProcess(s, this.fastLlmStructured));
    builder.addNode("collapse", (s: OverallStateType) => collapse(s));
    builder.addNode("reduce", (s: OverallStateType) => reduce(s, this.smartLlm));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    builder.addEdge(START, "split_chunks" as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    builder.addConditionalEdges("split_chunks" as any, (s: OverallStateType) => routeToMap(s), {
      map_process: "map_process",
      collapse: "collapse",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    builder.addEdge("map_process" as any, "collapse" as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    builder.addEdge("collapse" as any, "reduce" as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    builder.addEdge("reduce" as any, END as any);

    return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
  }
}
