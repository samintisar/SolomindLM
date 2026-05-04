"use node";
/**
 * Prompt templates and schemas for single infographic generation.
 *
 * Generates a single, comprehensive infographic image using OpenAI's gpt-image-1.5 model.
 * The infographic combines key insights from source documents into one visual summary.
 */

import { z } from "zod";
import { env } from "../../_lib/env";

// ============================================================
// SCHEMAS
// ============================================================

/**
 * Schema for infographic generation output.
 */
export const InfographicSchema = z.object({
  title: z.string().describe("A compelling, descriptive title for the infographic (3-8 words)"),
  prompt: z
    .string()
    .describe(
      "Comprehensive prompt for gpt-image-1.5 model that includes: (1) EXACT text to render in quotation marks (title, key points, labels), (2) typography specifications (fonts, sizes, weights, crisp/sharp keywords), (3) layout composition (text placement, visual elements, spacing), (4) visual style (theme colors, graphics, icons), (5) quality requirements. The prompt must be detailed enough for gpt-image-1.5 to generate a complete, professional infographic with all text baked in."
    ),
  keyPoints: z
    .array(z.string())
    .describe("3-7 key points or insights that the infographic conveys"),
  sourceReferences: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("References to source material for attribution"),
});

export type Infographic = z.infer<typeof InfographicSchema>;

// ============================================================
// CONFIGURATION
// ============================================================

const safeParseInt = (val: string | undefined, fallback: number): number => {
  const parsed = parseInt(val || "", 10);
  return isNaN(parsed) ? fallback : parsed;
};

export const INFOGRAPHIC_CONFIG = {
  MAX_TOKENS: safeParseInt(env.INFOGRAPHIC_MAX_TOKENS, 8000),
  GENERATION_TIMEOUT_MS: safeParseInt(env.INFOGRAPHIC_GENERATION_TIMEOUT_MS, 180000),
  IMAGE_TIMEOUT_MS: safeParseInt(env.INFOGRAPHIC_IMAGE_TIMEOUT_MS, 180000),
} as const;

// ============================================================
// SYSTEM PROMPTS
// ============================================================

export const INFOGRAPHIC_SYSTEM_PROMPT = `You are an expert data visualization designer and information architect who creates stunning, publication-ready infographics. You excel at transforming complex information into clear, visually compelling single-image summaries.

Your infographics are:
- Information-dense yet visually clean
- Professionally designed with consistent color palettes and typography
- Structured with clear visual hierarchy
- Optimized for the gpt-image-1.5 model's text rendering capabilities

You design infographics that work as standalone visual summaries — someone should be able to understand the key message at a glance, then dive deeper into details. You use charts, diagrams, icons, and structured layouts to organize information effectively.`;

// ============================================================
// GENERATION PROMPT
// ============================================================

export const getInfographicPrompt = (params: {
  content: string;
  customPrompt?: string;
}): string => {
  const { content, customPrompt } = params;

  return `You are creating a prompt for OpenAI's gpt-image-1.5 model to generate a single, comprehensive infographic that summarizes the following content.

${customPrompt ? `**Custom Focus:** ${customPrompt}\n\n` : ""}
**SOURCE CONTENT:**
${content}

**TASK:**
Design a single infographic that captures the most important insights from this content. The infographic should be:

1. **Comprehensive**: Cover 3-7 key points or insights
2. **Visually Rich**: Use a mix of text, icons, charts, diagrams, and visual elements
3. **Well-Structured**: Organize information with clear visual hierarchy
4. **Professionally Designed**: Use a cohesive color palette, consistent typography, and balanced composition

**OUTPUT REQUIREMENTS:**

1. **Title**: Create a compelling, descriptive title (3-8 words) that captures the essence of the infographic.

2. **Image Generation Prompt**: Write a detailed prompt for gpt-image-1.5 that specifies:
   - EXACT text to render in quotation marks (title, key points, labels, data values)
   - Typography specifications (font styles, sizes in points, weights)
   - Layout composition (sections, grid structure, text placement)
   - Visual elements (icons, charts, diagrams, illustrations)
   - Color palette (specific colors for backgrounds, text, accents)
   - Style keywords (professional, 8k, crisp text, sharp rendering)
   - Aspect ratio: 1024x1536px (portrait, ideal for infographics)

   The prompt must explicitly include all text content in quotation marks so gpt-image-1.5 renders it perfectly.

3. **Key Points**: List 3-7 key insights the infographic conveys.

**INFOGRAPHIC DESIGN PRINCIPLES:**
- Start with a bold title at the top
- Use a logical flow (top-to-bottom or left-to-right)
- Group related information visually
- Use icons and simple graphics to reinforce concepts
- Include data visualizations where relevant (bars, charts, percentages)
- Maintain consistent spacing and alignment
- Ensure all text is large enough to read clearly
- Use contrasting colors for readability

**CRITICAL INSTRUCTION FOR gpt-image-1.5:**
The gpt-image-1.5 model excels at crisp, sharp text rendering. Your prompt must explicitly specify the exact text to be rendered in quotation marks, the font styles, sizes, colors, and precise positions. Use typography keywords like "crisp", "sharp", "legible", "clear", "bold", "readable" to reinforce text quality.

Return your response as a structured object with title, prompt, and keyPoints.`;
};

// ============================================================
// TITLE GENERATION PROMPT
// ============================================================

export const getInfographicTitlePrompt = (content: string): string => {
  return `Analyze the following content and generate a sophisticated, engaging title for an infographic.

Content: ${content.substring(0, 2000)}

The title should:
- Be intellectual yet accessible (3-8 words)
- Reflect the visual nature of an infographic
- Be professional and compelling
- Do not use exclamation marks or clickbait phrasing

Return only the title text, nothing else.`;
};
