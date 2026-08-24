"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { END, START, StateGraph } from "@langchain/langgraph";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { countTokens } from "../_shared/index.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";

import { validateChunks } from "./chunkHelpers.js";
import { GRAPH_CONFIG } from "./config.js";
import { collapse } from "./nodeCollapse.js";
import { mapProcess as runMapProcess } from "./nodeMap.js";
import { reduce } from "./nodeReduce.js";
import { splitChunks } from "./nodeSplit.js";
import {
  QuizCandidateArraySchema,
  type QuizCandidateResponse,
  type QuizQuestion,
  QuizQuestionSchema,
} from "./prompts.js";
import { routeToMap } from "./routing.js";
import { type ChunkProcessState, OverallState, type OverallStateType } from "./state.js";
import { createStructuredLLM, type StructuredOutputInvoker } from "./structuredLlm.js";

export class QuizGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private fastLlmCandidateStructured: StructuredOutputInvoker<QuizCandidateResponse>;
  private expandLlm: ChatTogetherAI;
  private expandLlmQuestionStructured: StructuredOutputInvoker<QuizQuestion>;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.4,
      maxTokens: GRAPH_CONFIG.MAP_MAX_TOKENS,
      modelKwargs: mergeModelKwargs(mapModel, "fast"),
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: GRAPH_CONFIG.REDUCE_MAX_TOKENS,
      modelKwargs: mergeModelKwargs(reduceModel, "smart"),
    });

    this.expandLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: GRAPH_CONFIG.EXPAND_MAX_TOKENS,
      modelKwargs: mergeModelKwargs(reduceModel, "smart"),
    });

    this.fastLlmCandidateStructured = createStructuredLLM<QuizCandidateResponse>(
      QuizCandidateArraySchema,
      "quiz_candidates",
      { model: mapModel, maxTokens: GRAPH_CONFIG.MAP_MAX_TOKENS, temperature: 0.4 }
    );
    this.expandLlmQuestionStructured = createStructuredLLM<QuizQuestion>(
      QuizQuestionSchema,
      "quiz_question_expand",
      {
        model: reduceModel,
        maxTokens: GRAPH_CONFIG.EXPAND_MAX_TOKENS,
        temperature: 0.3,
        reasoningEnabled: true,
      }
    );
  }

  private estimateTokens(text: string): number {
    return countTokens(text);
  }

  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    return runMapProcess(state, {
      fastLlmCandidateStructured: this.fastLlmCandidateStructured,
      estimateTokens: this.estimateTokens.bind(this),
    });
  }

  async skipMap(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const joinedChunk = validateChunks(state.chunks).join("\n\n");
    const questionsPerChunk = Math.max(
      GRAPH_CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.min(
        GRAPH_CONFIG.MAX_QUESTIONS_PER_CHUNK,
        Math.ceil(state.questionCount * 1.2)
      )
    );
    const mapResult = await this.mapProcess({
      chunk: joinedChunk,
      chunkIndex: 0,
      questionCount: state.questionCount,
      difficulty: state.difficulty,
      focus: state.focus,
      questionsPerChunk,
    });

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

    const mapDeps = {
      fastLlmCandidateStructured: this.fastLlmCandidateStructured,
      estimateTokens: this.estimateTokens.bind(this),
    };

    const collapseDeps = {
      estimateTokens: this.estimateTokens.bind(this),
    };

    const reduceDeps = {
      smartLlm: this.smartLlm,
      expandLlmQuestionStructured: this.expandLlmQuestionStructured,
    };

    builder.addNode("split_chunks", (s: OverallStateType) => splitChunks(s));
    builder.addNode("map_process", (s: ChunkProcessState) => runMapProcess(s, mapDeps));
    builder.addNode("skip_map", (s: OverallStateType) => this.skipMap(s));
    builder.addNode("collapse", (s: OverallStateType) => collapse(s, collapseDeps));
    builder.addNode("reduce", (s: OverallStateType) => reduce(s, reduceDeps));

    builder.addEdge(START, "split_chunks" as any);

    builder.addConditionalEdges(
      "split_chunks" as any,
      (s: OverallStateType) => routeToMap(s, { estimateTokens: this.estimateTokens.bind(this) }),
      { map_process: "map_process", skip_map: "skip_map", collapse: "collapse" } as any
    );

    builder.addEdge("map_process" as any, "collapse" as any);
    builder.addEdge("skip_map" as any, "reduce" as any);
    builder.addEdge("collapse" as any, "reduce" as any);
    builder.addEdge("reduce" as any, END as any);

    return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
  }
}
