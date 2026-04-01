"use node"
/**
 * SlideDeckGraph class — orchestrates slide deck generation.
 * Node implementations live in node*.ts, routing.ts, and services/.
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';

import { countTokens } from '../_shared/index.js';

import { GRAPH_CONFIG } from './config.js';
import { collapse } from './nodeCollapse.js';
import { generateImages } from './nodeGenerateImages.js';
import { mapProcess } from './nodeMap.js';
import { reduce } from './nodeReduce.js';
import { splitChunks } from './nodeSplit.js';
import { SlideCandidateArraySchema, SlideSchema, type SlideCandidateResponse } from './prompts.js';
import { routeToMap } from './routing.js';
import { SlideImageGenerationService } from './services/SlideImageGenerationService.js';
import { OverallState, type ChunkProcessState, type OverallStateType, type Slide } from './state.js';
import { createStructuredLLM, type StructuredOutputInvoker } from './structuredLlm.js';

export { packChunks, validateChunks } from './chunkHelpers.js';

/**
 * SlideDeckGraph class that orchestrates slide deck generation.
 *
 * Uses two LLM models:
 * - FAST_LLM: For map phase (extracting slide concepts from chunks)
 * - SMART_LLM: For reduce phases (selection, refinement, image prompt generation)
 */
export class SlideDeckGraph {
  private fastLlm: ChatTogetherAI;
  private fastLlmStructured: StructuredOutputInvoker<SlideCandidateResponse>;

  private smartLlm: ChatTogetherAI;
  private slideStructured: StructuredOutputInvoker<Slide>;

  private imageService: SlideImageGenerationService;

  constructor(
    apiKey: string,
    fastModel: string,
    smartModel: string,
    zhipuAiApiKey: string,
    uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>
  ) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: fastModel,
      temperature: 0.4,
      maxTokens: GRAPH_CONFIG.MAX_TOKENS,
      modelKwargs: { chat_template_kwargs: { thinking: false } },
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: smartModel,
      temperature: 0.4,
      maxTokens: GRAPH_CONFIG.MAX_TOKENS,
    });

    this.fastLlmStructured = createStructuredLLM<SlideCandidateResponse>(
      this.fastLlm,
      SlideCandidateArraySchema,
      'slide_candidates'
    );

    this.slideStructured = createStructuredLLM<Slide>(this.smartLlm, SlideSchema, 'slide');

    this.imageService = new SlideImageGenerationService(zhipuAiApiKey, uploadStorage);
  }

  private estimateTokens(text: string): number {
    return countTokens(text);
  }

  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    return mapProcess(state, {
      estimateTokens: this.estimateTokens.bind(this),
      structured: this.fastLlmStructured,
    });
  }

  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode('split_chunks', (s: OverallStateType) => splitChunks(s));
    builder.addNode('map_process', (s: ChunkProcessState) => this.mapProcess(s));
    builder.addNode('collapse', (s: OverallStateType) =>
      collapse(s, { estimateTokens: this.estimateTokens.bind(this) })
    );
    builder.addNode('reduce', (s: OverallStateType) =>
      reduce(s, {
        smartLlm: this.smartLlm,
        slideStructured: this.slideStructured,
      })
    );
    builder.addNode('generate_images', (s: OverallStateType) => generateImages(s, this.imageService));

    builder.addEdge(START, 'split_chunks' as any);

    builder.addConditionalEdges(
      'split_chunks' as any,
      (s: OverallStateType) => routeToMap(s, this.estimateTokens.bind(this)),
      { map_process: 'map_process', collapse: 'collapse' } as any
    );

    builder.addEdge('map_process' as any, 'collapse' as any);
    builder.addEdge('collapse' as any, 'reduce' as any);
    builder.addEdge('reduce' as any, 'generate_images' as any);
    builder.addEdge('generate_images' as any, END as any);

    return builder.compile();
  }
}
