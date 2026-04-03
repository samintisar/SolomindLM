"use node"

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  allWithConcurrency,
  clearStateKeys,
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
} from '../_shared/index.js';
import type { JobLogger } from '../_shared/logging.js';
import { createAgentGraphLogger } from '../_shared/logging.js';

import { GRAPH_CONFIG, SLIDE_COUNT_MAP } from './config.js';
import {
  getRefineSlidePrompt,
  getSlideSelectionPrompt,
  REFINE_SLIDES_SYSTEM_PROMPT,
  SlideSelectionSchema,
  SLIDE_SELECTION_SYSTEM_PROMPT,
  type Slide,
  type SlideCandidate,
  type SlideSelectionResponse,
} from './prompts.js';
import {
  heuristicDedupeSlides,
  preSelectSlides,
  selectSlidesHeuristic,
} from './slideHeuristics.js';
import { callStatusUpdate } from './nodeSplit.js';
import type { OverallStateType } from './state.js';
import type { StructuredOutputInvoker } from './structuredLlm.js';

export interface ReduceNodeDeps {
  smartLlm: ChatTogetherAI;
  slideStructured: StructuredOutputInvoker<Slide>;
}

async function refineSelectedSlides(
  selectedCandidates: SlideCandidate[],
  state: OverallStateType,
  targetSlideCount: number,
  slideStructured: StructuredOutputInvoker<Slide>,
  logger: JobLogger
): Promise<Partial<OverallStateType>> {
  logger.info(`Refining ${selectedCandidates.length} slides with image generation prompts...`, {
    agent: 'SlideDeckGraph',
    phase: 'refine_slides',
    slidesToRefine: selectedCandidates.length,
  });

  const refinedSlidesWithPrompts = await allWithConcurrency(
    selectedCandidates.slice(0, targetSlideCount).map((candidate, index) => {
      return async () => {
        try {
          const refinePrompt = getRefineSlidePrompt(
            candidate,
            index + 1,
            state.slideType,
            state.themeSpecification,
            state.customPrompt
          );

          const refinedSlideRaw = await invokeWithRetry(
            () =>
              invokeWithTimeout(
                () =>
                  (slideStructured as any).invoke(
                    [new SystemMessage(REFINE_SLIDES_SYSTEM_PROMPT), new HumanMessage(refinePrompt)],
                    createLangSmithRunConfig({
                      runName: 'SlideDeckGraph.RefineSlide',
                      tags: ['agent', 'slides', 'refine', 'smart-llm'],
                      metadata: {
                        slideNumber: index + 1,
                        slideType: state.slideType,
                      },
                    })
                  ),
                GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
                'SlideRefine'
              ),
            {
              maxAttempts: 2,
              baseDelayMs: 1000,
            },
            'SlideRefine'
          );

          const refinedSlide = refinedSlideRaw as Slide;

          refinedSlide.slideNumber = index + 1;

          logger.info(`Refined slide ${index + 1}: ${refinedSlide.title}`, {
            agent: 'SlideDeckGraph',
            phase: 'refine_slide',
            slideNumber: index + 1,
          });

          return refinedSlide;
        } catch (error) {
          logger.phaseError(
            'refine_slide',
            error instanceof Error ? error : new Error(String(error)),
            {
              agent: 'SlideDeckGraph',
              index,
              slideNumber: index + 1,
              candidateTitle: candidate.title,
            }
          );

          throw new Error(
            `Failed to refine slide ${index + 1} ("${candidate.title}"): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      };
    }),
    5
  );

  logger.info(`Slide content generation complete: ${refinedSlidesWithPrompts.length} slides refined`, {
    agent: 'SlideDeckGraph',
    phase: 'reduce_complete',
    slidesWithPromptsCount: refinedSlidesWithPrompts.length,
  });

  return {
    ...state,
    slidesWithPrompts: refinedSlidesWithPrompts,
    status: 'generating_images',
    ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
    progress: {
      phase: 'reduce',
      percentage: 75,
      message: `Slide content ready: ${refinedSlidesWithPrompts.length} slides prepared for image generation`,
      itemsGenerated: refinedSlidesWithPrompts.length,
      totalItems: refinedSlidesWithPrompts.length,
    },
  };
}

export async function reduce(
  state: OverallStateType,
  deps: ReduceNodeDeps
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger('SlideDeckGraph', 'slides');
  await callStatusUpdate(state, 'reducing');

  logger.phaseStart('reduce', {
    agent: 'SlideDeckGraph',
    collapsedOutputsCount: state.collapsedOutputs.length,
    slideType: state.slideType,
    deckLength: state.deckLength,
  });

  const allCandidates: SlideCandidate[] = [];
  for (const output of state.collapsedOutputs) {
    try {
      const parsed = JSON.parse(output) as SlideCandidate[];
      allCandidates.push(...parsed);
    } catch (e) {
      logger.warn('Failed to parse slide array in reduce', {
        agent: 'SlideDeckGraph',
        phase: 'reduce_parse_error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (allCandidates.length === 0) {
    logger.phaseError('reduce', new Error('No candidates generated'), {
      agent: 'SlideDeckGraph',
    });
    return {
      ...state,
      slidesWithPrompts: [],
      finalOutput: [],
      status: 'failed',
    };
  }

  const countRange = SLIDE_COUNT_MAP[state.deckLength];
  const minSlides = countRange.min;
  const maxSlides = countRange.max;
  const targetSlideCount = Math.floor((minSlides + maxSlides) / 2);

  logger.info(`Collected ${allCandidates.length} candidates, targeting ${targetSlideCount} slides`, {
    agent: 'SlideDeckGraph',
    phase: 'reduce_initial',
    totalCandidates: allCandidates.length,
    minSlides,
    maxSlides,
    targetSlideCount,
  });

  if (allCandidates.length <= maxSlides) {
    logger.info(`Skipping LLM selection: ${allCandidates.length} candidates within limit`, {
      agent: 'SlideDeckGraph',
      phase: 'reduce_skip_llm',
      candidateCount: allCandidates.length,
      maxSlides,
    });
    return refineSelectedSlides(allCandidates, state, targetSlideCount, deps.slideStructured, logger);
  }

  const dedupedSlides = heuristicDedupeSlides(allCandidates);

  const preSelectedSlides = preSelectSlides(dedupedSlides, 30);

  try {
    const selectionStructuredLLM = deps.smartLlm.withStructuredOutput<SlideSelectionResponse>(SlideSelectionSchema, {
      name: 'slide_selection',
    });

    const selectionPrompt = getSlideSelectionPrompt({
      candidates: preSelectedSlides,
      minSlides,
      maxSlides,
      slideType: state.slideType,
      deckLength: state.deckLength,
      customPrompt: state.customPrompt,
    });

    const response: SlideSelectionResponse = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            (selectionStructuredLLM as any).invoke(
              [new SystemMessage(SLIDE_SELECTION_SYSTEM_PROMPT), new HumanMessage(selectionPrompt)],
              createLangSmithRunConfig({
                runName: 'SlideDeckGraph.SelectSlides',
                tags: ['agent', 'slides', 'select', 'smart-llm'],
              })
            ),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'SlideSelection'
        ),
      { maxAttempts: 2, baseDelayMs: 1000 },
      'SlideSelection'
    );

    logger.info(`LLM selection: ${preSelectedSlides.length} → ${response.slides.length} slides`, {
      agent: 'SlideDeckGraph',
      phase: 'reduce_llm_selection',
      inputSlides: preSelectedSlides.length,
      outputSlides: response.slides.length,
      reasoning: response.reasoning,
    });

    return refineSelectedSlides(response.slides, state, targetSlideCount, deps.slideStructured, logger);
  } catch (error) {
    logger.warn('LLM selection failed, using heuristic fallback', {
      agent: 'SlideDeckGraph',
      phase: 'reduce_llm_failed',
      error: error instanceof Error ? error.message : String(error),
    });

    const fallbackSlides = selectSlidesHeuristic(preSelectedSlides, targetSlideCount, minSlides, maxSlides);
    return refineSelectedSlides(fallbackSlides, state, targetSlideCount, deps.slideStructured, logger);
  }
}
