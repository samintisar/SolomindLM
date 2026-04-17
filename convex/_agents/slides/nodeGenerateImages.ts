"use node";

import { clearStateKeys } from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { callStatusUpdate } from "./nodeSplit.js";
import type { SlideImageGenerationService } from "./services/SlideImageGenerationService.js";
import type { OverallStateType } from "./state.js";

export async function generateImages(
  state: OverallStateType,
  imageService: SlideImageGenerationService
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("SlideDeckGraph", "slides");
  await callStatusUpdate(state, "generating_images");

  logger.phaseStart("generate_images", {
    agent: "SlideDeckGraph",
    slidesToProcess: state.slidesWithPrompts.length,
  });

  if (!state.slidesWithPrompts || state.slidesWithPrompts.length === 0) {
    logger.phaseError("generate_images", new Error("No slides with prompts"), {
      agent: "SlideDeckGraph",
    });
    await callStatusUpdate(state, "failed");
    return {
      ...state,
      finalOutput: [],
      status: "failed",
    };
  }

  const imageConcurrency = 1;

  logger.info(`Starting image generation for ${state.slidesWithPrompts.length} slides...`, {
    agent: "SlideDeckGraph",
    phase: "generate_images",
    totalSlides: state.slidesWithPrompts.length,
    concurrency: imageConcurrency,
  });

  const tempSlideDeckId = `temp-${Date.now()}`;
  const slidesWithImages = await imageService.generateSlideImages(
    state.slidesWithPrompts,
    tempSlideDeckId,
    imageConcurrency
  );

  logger.info("SLIDE DECK GENERATION COMPLETE", {
    agent: "SlideDeckGraph",
    phase: "generation_complete",
    finalSlideCount: slidesWithImages.length,
    milestone: true,
  });

  return {
    ...state,
    finalOutput: slidesWithImages,
    status: "completed",
    ...clearStateKeys<OverallStateType>(["slidesWithPrompts"]),
    progress: {
      phase: "generate_images",
      percentage: 100,
      message: `Completed: ${slidesWithImages.length} slides generated`,
      itemsGenerated: slidesWithImages.length,
      totalItems: slidesWithImages.length,
    },
  };
}
