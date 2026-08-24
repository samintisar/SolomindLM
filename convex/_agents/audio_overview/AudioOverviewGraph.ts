"use node";
/**
 * AudioOverviewGraph class that orchestrates audio overview generation.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { type CompiledStateGraph, END, Send, START, StateGraph } from "@langchain/langgraph";
import type Together from "together-ai";
import { createTogetherTtsClient } from "../../_services/ai/togetherTts.js";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";
import { createAgentGraphLogger } from "../_shared/logging.js";
import { selectStudioMapBatches } from "../_shared/studioExecutionMode.js";
import { countTokens } from "../_shared/tokenizer.js";
import { packChunks, validateChunks } from "./chunkHelpers.js";
import { collapse } from "./nodeCollapse.js";
import { extractBeats } from "./nodeExtractBeats.js";
import { synthesizeAudio as synthesizeAudioNode } from "./nodeSynthesizeAudio.js";
import { writeScript } from "./nodeWriteScript.js";
import { type ChunkProcessState, OverallState, type OverallStateType } from "./state.js";

export class AudioOverviewGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private together: Together;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
      modelKwargs: mergeModelKwargs(mapModel, "fast"),
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.6,
      modelKwargs: mergeModelKwargs(reduceModel, "smart"),
    });

    this.together = createTogetherTtsClient();
  }

  routeToMap(state: OverallStateType): Send[] | "collapse" | "skip_map" {
    const logger = createAgentGraphLogger("AudioOverviewGraph", "audio");

    if (state.chunks.length === 0) {
      logger.warn("No chunks to process, routing to collapse", {
        agent: "AudioOverviewGraph",
        phase: "route_to_map",
      });
      return "collapse";
    }

    const validatedChunks = validateChunks(state.chunks);
    const { mode, batches: packedChunks } = selectStudioMapBatches({
      documentCount: state.documentIds?.length ?? 0,
      chunks: validatedChunks,
      estimateTokens: countTokens,
      pack: packChunks,
    });

    if (packedChunks.length === 0) {
      logger.warn("No map batches after skip-map planning, routing to collapse", {
        agent: "AudioOverviewGraph",
        phase: "route_to_map",
      });
      return "collapse";
    }

    if (mode === "single_pass") {
      logger.info("Routing directly to skip_map", {
        agent: "AudioOverviewGraph",
        phase: "route_to_map",
        executionMode: mode,
        originalChunks: state.chunks.length,
        validatedChunks: validatedChunks.length,
      });
      return "skip_map";
    }

    logger.info(`Creating ${packedChunks.length} parallel map tasks`, {
      agent: "AudioOverviewGraph",
      phase: "route_to_map",
      executionMode: mode,
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
      audioType: state.audioType,
      length: state.length,
    });

    return packedChunks.map(
      (chunk, idx) =>
        new Send("extract_beats", {
          chunk,
          chunkIndex: idx,
          totalChunks: packedChunks.length,
          audioType: state.audioType,
          length: state.length,
          focus: state.focus,
        })
    );
  }

  async skipMap(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const joinedChunks = validateChunks(state.chunks).join("\n\n");
    const beatExtraction = joinedChunks
      ? await extractBeats(
          {
            chunk: joinedChunks,
            chunkIndex: 0,
            totalChunks: 1,
            audioType: state.audioType,
            length: state.length,
            focus: state.focus,
          },
          this.fastLlm
        )
      : { mapOutputs: [] };

    return {
      collapsedOutputs: beatExtraction.mapOutputs ?? [],
      status: "writing_script",
      progress: {
        phase: "skip_map",
        percentage: 55,
        message: "Skipping map fan-out for single document",
      },
    };
  }

  buildGraph(): CompiledStateGraph<OverallStateType, any, any, any, any, any, any, any, any> {
    const builder = new StateGraph(OverallState);

    builder.addNode("extract_beats", (s: ChunkProcessState) => extractBeats(s, this.fastLlm));
    builder.addNode("skip_map", (s: OverallStateType) => this.skipMap(s));
    builder.addNode("collapse", (s: OverallStateType) => collapse(s));
    builder.addNode("write_script", (s: OverallStateType) => writeScript(s, this.smartLlm));
    builder.addNode("synthesize_audio", (s: OverallStateType) => this.synthesizeAudio(s));

    builder.addConditionalEdges(START, (s: OverallStateType) => this.routeToMap(s));
    builder.addEdge("extract_beats" as never, "collapse" as never);
    builder.addEdge("skip_map" as never, "write_script" as never);
    builder.addEdge("collapse" as never, "write_script" as never);
    builder.addEdge("write_script" as never, "synthesize_audio" as never);
    builder.addEdge("synthesize_audio" as never, END as never);

    return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
  }

  async synthesizeAudio(state: OverallStateType): Promise<Partial<OverallStateType>> {
    return synthesizeAudioNode(state, { together: this.together });
  }
}
