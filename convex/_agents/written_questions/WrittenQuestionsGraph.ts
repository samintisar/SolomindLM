"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { END, START, StateGraph } from "@langchain/langgraph";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";

import { validateChunks } from "./chunkHelpers.js";
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

    this.fastLlmStructured = createStructuredLLM(WrittenQuestionsArraySchema, {
      model: mapModel,
      maxTokens: 16_000,
      temperature: 0.3,
    });
  }

  async skipMap(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const joinedChunk = validateChunks(state.chunks).join("\n\n");
    const questionsPerChunk = Math.max(3, Math.min(20, Math.ceil(state.questionCount * 2.5)));
    const mapResult = await mapProcess(
      {
        chunk: joinedChunk,
        chunkIndex: 0,
        retryCount: 0,
        questionCount: state.questionCount,
        difficulty: state.difficulty,
        questionType: state.questionType,
        focus: state.focus,
        questionsPerChunk,
      },
      this.fastLlmStructured
    );

    return {
      collapsedOutputs: mapResult.mapOutputs ?? [],
      status: "reducing",
      progress: {
        phase: "skip_map",
        percentage: 60,
        message: "Skipping map fan-out for single document",
      },
    };
  }

  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode("split_chunks", (s: OverallStateType) => splitChunks(s));
    builder.addNode("map_process", (s: ChunkProcessState) => mapProcess(s, this.fastLlmStructured));
    builder.addNode("skip_map", (s: OverallStateType) => this.skipMap(s));
    builder.addNode("collapse", (s: OverallStateType) => collapse(s));
    builder.addNode("reduce", (s: OverallStateType) => reduce(s, this.smartLlm));

    builder.addEdge(START, "split_chunks" as any);

    builder.addConditionalEdges("split_chunks" as any, (s: OverallStateType) => routeToMap(s), {
      map_process: "map_process",
      skip_map: "skip_map",
      collapse: "collapse",
    } as any);

    builder.addEdge("map_process" as any, "collapse" as any);
    builder.addEdge("skip_map" as any, "reduce" as any);
    builder.addEdge("collapse" as any, "reduce" as any);
    builder.addEdge("reduce" as any, END as any);

    return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
  }
}
