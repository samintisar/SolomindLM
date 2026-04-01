"use node"

import {
  clearStateKeys,
  logBanner,
  logError,
  logInfo,
  logPhaseStart,
} from '../_shared/index.js';

import { callStatusUpdate } from './nodeSplit.js';
import type { SlideImageGenerationService } from './services/SlideImageGenerationService.js';
import type { OverallStateType } from './state.js';

export async function generateImages(
  state: OverallStateType,
  imageService: SlideImageGenerationService
): Promise<Partial<OverallStateType>> {
  await callStatusUpdate(state, 'generating_images');

  logPhaseStart({
    agent: 'SlideDeckGraph',
    phase: 'generate_images',
    slidesToProcess: state.slidesWithPrompts.length,
  });

  if (!state.slidesWithPrompts || state.slidesWithPrompts.length === 0) {
    logError(
      {
        agent: 'SlideDeckGraph',
        phase: 'generate_images',
        error: 'No slides with prompts',
      },
      'CRITICAL: No slides with prompts to generate images for!'
    );
    await callStatusUpdate(state, 'failed');
    return {
      ...state,
      finalOutput: [],
      status: 'failed',
    };
  }

  const imageConcurrency = 1;

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'generate_images',
      totalSlides: state.slidesWithPrompts.length,
      concurrency: imageConcurrency,
    },
    `Starting image generation for ${state.slidesWithPrompts.length} slides...`
  );

  const tempSlideDeckId = `temp-${Date.now()}`;
  const slidesWithImages = await imageService.generateSlideImages(
    state.slidesWithPrompts,
    tempSlideDeckId,
    imageConcurrency
  );

  logBanner(
    {
      agent: 'SlideDeckGraph',
      phase: 'generation_complete',
      finalSlideCount: slidesWithImages.length,
    },
    'SLIDE DECK GENERATION COMPLETE'
  );

  return {
    ...state,
    finalOutput: slidesWithImages,
    status: 'completed',
    ...clearStateKeys<OverallStateType>(['slidesWithPrompts']),
    progress: {
      phase: 'generate_images',
      percentage: 100,
      message: `Completed: ${slidesWithImages.length} slides generated`,
      itemsGenerated: slidesWithImages.length,
      totalItems: slidesWithImages.length,
    },
  };
}
