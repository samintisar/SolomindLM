"use node"

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { END, START, StateGraph } from '@langchain/langgraph';

import { countTokens } from '../_shared/index.js';

import {
  type CollapseReduceDeps,
  recursiveCollapse,
  refineFlashcardSelection,
} from './collapseReduceLlm.js';
import { FLASHCARD_CONFIG } from './config.js';
import { collapse } from './nodeCollapse.js';
import { mapProcess } from './nodeMap.js';
import { reduceFlashcards } from './nodeReduce.js';
import { splitChunks } from './nodeSplit.js';
import { FlashcardArraySchema } from './prompts.js';
import { routeToMap } from './routing.js';
import { type ChunkProcessState, OverallState, type OverallStateType } from './state.js';
import { createStructuredLLM, type FlashcardOutputInvoker } from './structuredLlm.js';

export class FlashcardGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private fastLlmStructured: FlashcardOutputInvoker;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
      modelKwargs: { chat_template_kwargs: { thinking: false } },
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      timeout: FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
      maxTokens: FLASHCARD_CONFIG.REDUCE_MAX_TOKENS,
      modelKwargs: { chat_template_kwargs: { thinking: false } },
    });

    this.fastLlmStructured = createStructuredLLM(this.fastLlm, FlashcardArraySchema);
  }

  private estimateTokens(text: string): number {
    return countTokens(text);
  }

  buildGraph() {
    const builder = new StateGraph(OverallState);
    const collapseReduceDeps: CollapseReduceDeps = {
      smartLlm: this.smartLlm,
      estimateTokens: this.estimateTokens.bind(this),
    };

    builder.addNode('split_chunks', (s: OverallStateType) => splitChunks(s));
    builder.addNode('map_process', (s: ChunkProcessState) => mapProcess(s, this.fastLlmStructured));
    builder.addNode('collapse', (s: OverallStateType) => collapse(s, {
      estimateTokens: this.estimateTokens.bind(this),
      recursiveCollapse: (outputs, topic) => recursiveCollapse(outputs, collapseReduceDeps, topic),
    }));
    builder.addNode('reduce', (s: OverallStateType) => reduceFlashcards(s, {
      refineFlashcardSelection: (flashcards, targetCount, difficulty, topic) =>
        refineFlashcardSelection(flashcards, targetCount, difficulty, collapseReduceDeps, topic),
    }));

    builder.addEdge(START, 'split_chunks' as any);
    builder.addConditionalEdges(
      'split_chunks' as any,
      (s: OverallStateType) => routeToMap(s),
      { map_process: 'map_process', collapse: 'collapse' } as any
    );
    builder.addEdge('map_process' as any, 'collapse' as any);
    builder.addEdge('collapse' as any, 'reduce' as any);
    builder.addEdge('reduce' as any, END as any);

    return builder.compile();
  }
}
