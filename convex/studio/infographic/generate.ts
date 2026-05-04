"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { createTogetherClient } from "../../_services/ai/togetherClient";
import { generateInfographicImage as generateImageViaTogether } from "../../_services/ai/togetherImages";
import { invokeWithRetry } from "../../_agents/_shared/index";
import { env } from "../../_lib/env";

/**
 * Sleep utility for staggering requests
 */
function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map orientation to supported gpt-image-1.5 dimensions.
 * Supported: '1024x1024', '1536x1024', '1024x1536'
 */
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
    sketch_note: "Use a hand-drawn sketch note style with doodles, arrows, organic layouts, and a casual pen-on-paper feel.",
    kawaii: "Use a cute kawaii style with pastel colors, rounded shapes, adorable characters, and playful decorations.",
    professional: "Use a corporate professional style with clean lines, modern sans-serif typography, and a refined blue/grey color palette.",
    scientific: "Use an academic scientific poster style with structured sections, data visualizations, precise labeling, and a neutral color scheme.",
    anime: "Use an anime manga style with vibrant colors, dynamic compositions, speed lines, and Japanese aesthetic influences.",
    clay: "Use a 3D clay render style with soft rounded forms, pastel colors, tactile textures, and gentle lighting.",
    editorial: "Use a magazine editorial layout with elegant serif typography, high contrast, sophisticated design, and plenty of white space.",
    instructional: "Use a step-by-step instructional guide style with numbered sections, clear diagrams, icons, and a how-to format.",
    bento_grid: "Use a bento box grid layout with modular card-based sections, rounded corners, organized compartments, and subtle shadows.",
    bricks: "Use a brick wall mosaic style with rectangular blocks, bold colors, geometric patterns, and a tiled layout.",
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
    orientation: v.optional(v.union(v.literal("landscape"), v.literal("portrait"), v.literal("square"))),
    visualStyle: v.optional(v.string()),
    detailLevel: v.optional(v.union(v.literal("concise"), v.literal("standard"))),
  },
  handler: async (ctx, args) => {
    const { infographicId, userId, notebookId, documentIds, customPrompt, orientation, visualStyle, detailLevel } = args;

    try {
      // Update status
      await ctx.runMutation(internal.studio.infographic.index.updateStatus, {
        infographicId,
        status: "generating",
      });

      // Fetch document chunks
      const chunks = await ctx.runAction(internal.documents.index.fetchChunks, {
        documentIds,
      });
      if (chunks.length === 0) {
        throw new Error("No content found in selected sources");
      }

      const togetherClient = createTogetherClient();

      // Map phase: Extract key elements from chunks
      // Process sequentially with staggered delays to respect Together AI rate limits (10 QPS)
      const mapResults: { index: number; elements: string }[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Stagger requests: 150ms delay between calls = ~6.6 QPS (well under 10 QPS limit)
        if (i > 0) {
          await sleepMs(150);
        }

        const response = await invokeWithRetry(
          () =>
            togetherClient.chat.completions.create({
              model: env.FAST_LLM,
              messages: [
                {
                  role: "system",
                  content:
                    "Extract key infographic elements from this document chunk: statistics, concepts, timeline events, comparisons, quotes. Return as JSON array.",
                },
                {
                  role: "user",
                  content: chunk.content,
                },
              ],
              temperature: 0.3,
            }),
          {
            maxAttempts: 3,
            baseDelayMs: 2000,
            onRetry: (attempt, error, delayMs) => {
              console.log(
                `[InfographicMap] Chunk ${i + 1}/${chunks.length} retry ${attempt}/3 after ${delayMs}ms: ${error.message}`
              );
            },
          },
          `InfographicMap-${i}`
        );

        mapResults.push({
          index: i,
          elements: response.choices[0]?.message?.content || "",
        });
      }

      // Build style and detail instructions
      const styleInstruction = getVisualStyleInstruction(visualStyle);
      const detailInstruction = getDetailLevelInstruction(detailLevel);
      const sizeInstruction = `Aspect ratio: ${getImageSize(orientation)} (${orientation || "landscape"})`;

      // Reduce phase: Synthesize into single infographic prompt
      const reduceResponse = await invokeWithRetry(
        () =>
          togetherClient.chat.completions.create({
            model: env.SMART_LLM,
            messages: [
              {
                role: "system",
                content: `Create a detailed prompt for an AI image generator (gpt-image-1.5) to create a single beautiful infographic.

${styleInstruction}

${detailInstruction}

${sizeInstruction}

The prompt should specify:
- Layout and visual hierarchy
- Typography and colors
- All key data points and text content in quotation marks
- Icons, charts, and visual elements
- Overall style and mood

Return JSON: { "title": string, "infographicPrompt": string }`,
              },
              {
                role: "user",
                content: `Custom focus: ${customPrompt || "Create a comprehensive infographic"}\n\nExtracted elements:\n${mapResults.map((r) => r.elements).join("\n---\n")}`,
              },
            ],
            temperature: 0.7,
          }),
        {
          maxAttempts: 3,
          baseDelayMs: 2000,
          onRetry: (attempt, error, delayMs) => {
            console.log(
              `[InfographicReduce] Retry ${attempt}/3 after ${delayMs}ms: ${error.message}`
            );
          },
        },
        "InfographicReduce"
      );

      const reduceContent = reduceResponse.choices[0]?.message?.content || "{}";
      const { title, infographicPrompt } = JSON.parse(reduceContent);

      // Generate image via Together AI
      const { imageUrl } = await generateImageViaTogether(togetherClient, {
        prompt: infographicPrompt,
        size: getImageSize(orientation),
        quality: "medium",
        timeoutMs: 180000,
      });

      // Store image in Convex storage
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const storageId = await ctx.storage.store(blob);
      const publicUrl = await ctx.storage.getUrl(storageId);

      if (!publicUrl) {
        throw new Error("Failed to get public URL for stored image");
      }

      // Generate title if not provided
      const finalTitle =
        title ||
        (await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
          chunk: infographicPrompt,
        }));

      // Save results
      await ctx.runMutation(internal.studio.infographic.index.updateData, {
        infographicId,
        data: {
          imageUrl: publicUrl,
          title: finalTitle,
          prompt: infographicPrompt,
          metadata: {
            sourceDocumentIds: documentIds,
            generatedAt: Date.now(),
            customPrompt,
            orientation,
            visualStyle,
            detailLevel,
            mapResultsCount: mapResults.length,
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
    } catch (error) {
      console.error("Infographic generation failed:", error);
      await ctx.runMutation(internal.studio.infographic.index.patch, {
        infographicId,
        patch: {
          status: "failed",
          metadata: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        },
      });
      throw error;
    }
  },
});
