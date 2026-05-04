"use node";
/**
 * AudioOverviewGraph class that orchestrates audio overview generation.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { createTogetherTtsClient } from "../../_services/ai/togetherTts.js";
import type Together from "together-ai";
import { END, START, Send, StateGraph, type CompiledStateGraph } from "@langchain/langgraph";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";
import { createAgentGraphLogger } from "../_shared/logging.js";
import { OverallState, type OverallStateType, type ChunkProcessState } from "./state.js";
import { packChunks, validateChunks } from "./chunkHelpers.js";
import { extractBeats } from "./nodeExtractBeats.js";
import { collapse } from "./nodeCollapse.js";
import { writeScript } from "./nodeWriteScript.js";
import { synthesizeAudio as synthesizeAudioNode } from "./nodeSynthesizeAudio.js";

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

  /**
   * Route to map phase - creates Send objects for parallel processing.
   */
  routeToMap(state: OverallStateType): Send[] | "collapse" {
    const logger = createAgentGraphLogger("AudioOverviewGraph", "audio");

    if (state.chunks.length === 0) {
      logger.warn("No chunks to process, routing to collapse", {
        agent: "AudioOverviewGraph",
        phase: "route_to_map",
      });
      return "collapse";
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks);

    logger.info(`Creating ${packedChunks.length} parallel map tasks`, {
      agent: "AudioOverviewGraph",
      phase: "route_to_map",
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

  /**
   * Build the state graph for audio overview generation.
   */
   
   
   
   
   
   
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildGraph(): CompiledStateGraph<OverallStateType, any, any, any, any, any, any, any, any> {
    const builder = new StateGraph(OverallState);

    builder.addNode("extract_beats", (s: ChunkProcessState) => extractBeats(s, this.fastLlm));
    builder.addNode("collapse", (s: OverallStateType) => collapse(s));
    builder.addNode("write_script", (s: OverallStateType) => writeScript(s, this.smartLlm));
    builder.addNode("synthesize_audio", (s: OverallStateType) => this.synthesizeAudio(s));

    builder.addConditionalEdges(START, (s: OverallStateType) => this.routeToMap(s));
    builder.addEdge("extract_beats" as never, "collapse" as never);
    builder.addEdge("collapse" as never, "write_script" as never);
    builder.addEdge("write_script" as never, "synthesize_audio" as never);
    builder.addEdge("synthesize_audio" as never, END as never);

    return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
  }

  /**
   * Synthesize audio from dialogue script (TTS phase).
   */
  async synthesizeAudio(state: OverallStateType): Promise<Partial<OverallStateType>> {
    return synthesizeAudioNode(state, { together: this.together });
  }
}
