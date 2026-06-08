"use node";

import { v } from "convex/values";
import { invokeWithRetry } from "../../_agents/_shared/index";
import {
  extractJsonObjectString,
  uncachedLlmCall,
} from "../../_agents/_shared/cachedLlm";
import { createErrorMetadata, createJobLogger } from "../../_agents/_shared/logging";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { env } from "../../_lib/env";
import { createTogetherClient } from "../../_services/ai/togetherClient";

/**
 * Map orientation to supported gpt-image-1.5 dimensions.
 * Supported: '1024x1024', '1536x1024', '1024x1536'
 */

/**
 * Robust JSON parser for LLM responses.
 * Handles: markdown wrapping, trailing commas, unquoted keys, truncated JSON.
 */
function parseLlmJson(content: string): Record<string, unknown> {
  // Extract JSON from markdown code blocks or raw text
  let jsonStr = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Find the outermost JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  // Fix common LLM JSON issues
  jsonStr = jsonStr
    // Remove trailing commas before closing brackets/braces
    .replace(/,(\s*[}\]])/g, "$1")
    // Remove single-line comments
    .replace(/\/\/.*$/gm, "")
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "");

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (parseErr) {
    // Try to fix unquoted property names (basic heuristic)
    const fixedStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(fixedStr) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Failed to parse LLM JSON response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Raw: ${content.slice(0, 200)}...`
      );
    }
  }
}

function getImageSize(orientation: string | undefined): string {
  switch (orientation) {
    case "landscape":
      return "1536x1024";
    case "portrait":
      return "1024x1536";
    case "square":
      return "1024x1024";
    default:
      return "1536x1024";
  }
}

/**
 * Build visual style instruction for the prompt
 */
function getVisualStyleInstruction(style: string | undefined): string {
  const styles: Record<string, string> = {
    auto: "Use a professional, clean infographic design with a cohesive modern aesthetic.",
    sketch_note:
      "Use a hand-drawn sketch note style with doodles, arrows, organic layouts, and a casual pen-on-paper feel.",
    kawaii:
      "Use a cute kawaii style with pastel colors, rounded shapes, adorable characters, and playful decorations.",
    professional:
      "Use a corporate professional style with clean lines, modern sans-serif typography, and a refined blue/grey color palette.",
    scientific:
      "Use an academic scientific poster style with structured sections, data visualizations, precise labeling, and a neutral color scheme.",
    anime:
      "Use an anime manga style with vibrant colors, dynamic compositions, speed lines, and Japanese aesthetic influences.",
    clay: "Use a 3D clay render style with soft rounded forms, pastel colors, tactile textures, and gentle lighting.",
    editorial:
      "Use a magazine editorial layout with elegant serif typography, high contrast, sophisticated design, and plenty of white space.",
    instructional:
      "Use a step-by-step instructional guide style with numbered sections, clear diagrams, icons, and a how-to format.",
    bento_grid:
      "Use a bento box grid layout with modular card-based sections, rounded corners, organized compartments, and subtle shadows.",
    bricks:
      "Use a brick wall mosaic style with rectangular blocks, bold colors, geometric patterns, and a tiled layout.",
  };
  return styles[style || "auto"] || styles["auto"];
}

/**
 * Build detail level instruction for the prompt
 */
function getDetailLevelInstruction(level: string | undefined): string {
  switch (level) {
    case "concise":
      return "Cover exactly 3 key points. Keep text minimal and visual elements simple. Prioritize clarity and brevity.";
    case "standard":
    default:
      return "Cover 5-7 key points with a balanced mix of text and visuals. Include some charts or diagrams where relevant.";
  }
}

/**
 * Generate infographic action.
 * Simplified pipeline: map-reduce for large docs → single LLM prompt → Together AI image generation.
 */
export const generateInfographicImage = internalAction({
  args: {
    infographicId: v.id("infographics"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    customPrompt: v.optional(v.string()),
    orientation: v.optional(
      v.union(v.literal("landscape"), v.literal("portrait"), v.literal("square"))
    ),
    visualStyle: v.optional(v.string()),
    detailLevel: v.optional(
      v.union(v.literal("concise"), v.literal("standard"), v.literal("detailed"))
    ),
  },
  handler: async (ctx, args) => {
    const {
      infographicId,
      userId,
      notebookId,
      documentIds,
      customPrompt,
      orientation,
      visualStyle,
      detailLevel,
    } = args;

    const logger = createJobLogger({
      jobType: "infographic",
      jobId: infographicId,
      notebookId,
      userId,
    });

    logger.jobStart({ docCount: documentIds.length });
    const jobTimer = logger.createTimer();

    try {
      logger.phaseStart("status_update", { status: "generating" });
      await ctx.runMutation(internal.studio.infographic.index.updateStatus, {
        infographicId,
        status: "generating",
      });
      logger.phaseComplete("status_update");

      logger.phaseStart("fetch_chunks", { documentCount: documentIds.length });
      const chunks = await ctx.runAction(internal.documents.chunks.fetchChunks, {
        documentIds,
      });
      logger.phaseComplete("fetch_chunks", { chunkCount: chunks.length });

      if (chunks.length === 0) {
        throw new Error("No content found in selected sources");
      }

      logger.phaseStart("create_client");
      const togetherClient = createTogetherClient();
      logger.phaseComplete("create_client");

      // Concatenate chunk contents (up to ~8k tokens worth of text)
      logger.phaseStart("prepare_content", { chunkCount: chunks.length });
      const MAX_CHARS = 30000; // ~8k tokens
      let sourceText = chunks.map((c: any) => c.content).join("\n\n");
      if (sourceText.length > MAX_CHARS) {
        sourceText = sourceText.substring(0, MAX_CHARS) + "\n[...content truncated...]";
      }
      logger.phaseComplete("prepare_content", { sourceTextLength: sourceText.length });

      // Build style and detail instructions
      const styleInstruction = getVisualStyleInstruction(visualStyle);
      const detailInstruction = getDetailLevelInstruction(detailLevel);
      const sizeInstruction = `Aspect ratio: ${getImageSize(orientation)} (${orientation || "landscape"})`;

      // Extract key concepts and design visual infographic
      logger.phaseStart("content_analysis");
      const designResponse = await invokeWithRetry(
        () =>
          uncachedLlmCall({
            model: env.SMART_LLM,
            messages: [
              {
                role: "system",
                content: `You are an expert infographic designer. Analyze the source content and design a visual infographic concept.

${styleInstruction}

${sizeInstruction}

${detailInstruction}

DESIGN RULES:
- COUNT FIRST: Count the exact number of distinct items/concepts in the source. Your infographic MUST display every single one.
- NEVER group multiple distinct items into one section or card. Each item gets its own visible label and icon.
- Use VISUALS to convey information: diagrams, flowcharts, icons, illustrations, connections, layers
- Text should be MINIMAL: short labels (2-5 words), section headers, brief annotations
- Choose layout based on content type AND item count:
  * Process/flow (few items) -> horizontal or vertical flowchart with arrows
  * Hierarchy (few items) -> tree diagram, pyramid, or layered architecture
  * Categories (few items) -> grouped sections with visual metaphors
  * Comparison (few items) -> side-by-side visual comparison
  * List (many items, 10+) -> COMPACT grid layout: small cards or numbered cells, 4-6 columns, minimal padding. Each cell must show: number, short name (2-4 words), tiny icon.
- Include visual elements: icons, arrows, boxes, connectors, diagrams
- Use the visual style to determine colors, textures, and aesthetic
- Each item from the source must have a visual representation (icon, diagram element, or illustration)
- VALIDATION: Before returning, count the items in your design. Ensure the count matches the source exactly.

Return JSON: {
  "title": "string (compelling title)",
  "layout_type": "flowchart|hierarchy|comparison|grid|layers|timeline",
  "visual_metaphor": "string (e.g., building architecture, neural network, factory pipeline, mind map)",
  "sections": [
    {
      "section_title": "string (2-4 words)",
      "visual_description": "string (what to draw: icons, diagrams, arrows, boxes)",
      "text_elements": ["short label 1", "short label 2"]
    }
  ],
  "color_scheme": "string (based on visual style)",
  "image_prompt": "string (detailed prompt for image generation model)"
}`,
              },
              {
                role: "user",
                content: `${customPrompt ? `Custom request: ${customPrompt}\n\n` : ""}Source content:\n${sourceText}`,
              },
            ],
            temperature: 0.7,
            reasoningEnabled: true,
            responseFormat: { type: "json_object" },
          }),
        {
          maxAttempts: 3,
          baseDelayMs: 2000,
          onRetry: (attempt, error, delayMs) => {
            logger.warn(`Design generation retry ${attempt}/3 after ${delayMs}ms`, {
              attempt,
              error: error.message,
            });
          },
        },
        "InfographicDesignGen"
      );

      const designContent =
        designResponse.structuredJson?.trim() ||
        extractJsonObjectString(designResponse.content) ||
        designResponse.content ||
        "{}";
      const design = parseLlmJson(designContent) as Record<string, any>;
      if (!design.image_prompt) {
        throw new Error(
          "LLM design step did not return an image_prompt — cannot generate a meaningful infographic"
        );
      }
      logger.phaseComplete("content_analysis", {
        title: design.title,
        layout: design.layout_type,
        sections: design.sections?.length || 0,
      });

      // Use the LLM-generated image prompt
      logger.phaseStart("prompt_generation");
      const imagePrompt =
        design.image_prompt ||
        `Professional infographic: ${design.title}. ${design.visual_metaphor}. Clean layout. ${styleInstruction}`;
      logger.phaseComplete("prompt_generation", { title: design.title || "(generated)" });

      // Generate image via Together AI gpt-image-1.5
      logger.phaseStart("image_generation", { size: getImageSize(orientation) });
      const size = getImageSize(orientation);
      const [widthStr, heightStr] = size.split("x");
      const width = parseInt(widthStr, 10);
      const height = parseInt(heightStr, 10);

      const imageResponse = await invokeWithRetry(
        () =>
          togetherClient.images.generate({
            model: "openai/gpt-image-1.5",
            prompt: imagePrompt,
            width,
            height,
            n: 1,
          }),
        {
          maxAttempts: 2,
          baseDelayMs: 2000,
          onRetry: (attempt, error, delayMs) => {
            logger.warn(`Image generation retry ${attempt}/2 after ${delayMs}ms`, {
              attempt,
              error: error.message,
            });
          },
        },
        "InfographicImageGen"
      );

      const imageData = imageResponse.data?.[0];
      let imageUrl: string;

      if ((imageData as any)?.b64_json) {
        imageUrl = `data:image/png;base64,${(imageData as any).b64_json}`;
      } else if (imageData?.url) {
        imageUrl = imageData.url;
      } else {
        throw new Error("No image data returned from Together AI");
      }
      logger.phaseComplete("image_generation", { imageUrl: imageUrl.slice(0, 80) });

      // Store image in Convex storage
      logger.phaseStart("storage");
      let imageBytes: Uint8Array;
      if (imageUrl.startsWith("data:")) {
        // Extract base64 from data URL
        const parts = imageUrl.split(",");
        if (parts.length < 2 || !parts[1]) {
          throw new Error("Together AI returned a malformed data URL — cannot decode image");
        }
        const base64Data = parts[1];
        imageBytes = Uint8Array.from(Buffer.from(base64Data, "base64"));
      } else {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
          throw new Error(`Failed to fetch image: ${imgRes.status} ${imgRes.statusText}`);
        }
        imageBytes = new Uint8Array(await imgRes.arrayBuffer());
      }
      const storageId = await ctx.storage.store(
        new Blob([imageBytes.buffer as ArrayBuffer], { type: "image/png" })
      );
      const publicUrl = await ctx.storage.getUrl(storageId);

      if (!publicUrl) {
        throw new Error("Failed to get public URL for stored image");
      }
      logger.phaseComplete("storage", { storageId, publicUrl: publicUrl.slice(0, 80) });

      // Use design title or generate one
      let finalTitle = design.title;
      if (!finalTitle) {
        logger.phaseStart("title_generation");
        finalTitle = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
          chunk: imagePrompt,
        });
        logger.phaseComplete("title_generation", { title: finalTitle });
      }

      // Save results
      logger.phaseStart("save_results");
      await ctx.runMutation(internal.studio.infographic.index.updateData, {
        infographicId,
        data: {
          imageUrl: publicUrl,
          title: finalTitle,
          prompt: imagePrompt,
          metadata: {
            sourceDocumentIds: documentIds,
            generatedAt: Date.now(),
            customPrompt,
            orientation,
            visualStyle,
            detailLevel,
          },
        },
      });

      await ctx.runMutation(internal.studio.infographic.index.patch, {
        infographicId,
        patch: {
          title: finalTitle,
          status: "completed",
        },
      });
      logger.phaseComplete("save_results");

      // Consume rate limit token on success
      await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
        userId: userId as string,
        feature: "infographic",
      });

      logger.jobComplete({
        durationMs: jobTimer.end(),
        chunkCount: chunks.length,
      });
    } catch (error) {
      const errorMeta = createErrorMetadata(error, "infographic_generation");
      logger.jobError(error, { errorMeta });

      await ctx.runMutation(internal.studio.infographic.index.patch, {
        infographicId,
        patch: {
          status: "failed",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
            errorType: errorMeta.type,
            errorPhase: errorMeta.phase,
          },
          metadata: {
            error: error instanceof Error ? error.message : "Unknown error",
            errorType: errorMeta.type,
            errorPhase: errorMeta.phase,
          },
        },
      });
      throw error;
    }
  },
});
