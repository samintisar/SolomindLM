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
  MAX_TOKENS: 8_000,
  GENERATION_TIMEOUT_MS: 180_000,
  IMAGE_TIMEOUT_MS: 180_000,
} as const;

// ============================================================
// SYSTEM PROMPTS
// ============================================================

export const INFOGRAPHIC_SYSTEM_PROMPT = `You are an expert data visualization designer and information architect who creates stunning, publication-ready infographics. You excel at transforming complex information into clear, visually compelling single-image summaries.

Your infographics are:
- Accurate: Every item, count, and data point is factually correct with no duplicates
- Readable: Large, clear text that can be read easily without zooming
- Clean: Uncluttered layouts with generous whitespace and logical grouping
- Professionally designed with consistent color palettes and typography
- Structured with clear visual hierarchy
- Optimized for the gpt-image-1.5 model's text rendering capabilities

CRITICAL RULES:
1. COUNT FIRST: Before designing, count the exact number of items/concepts in the source. Your infographic MUST display every single one — no clustering, no grouping multiple items into one card, no omitting items.
2. NEVER group multiple distinct items into a single card or section. Each item gets its own visible space with its own label/icon.
3. ALWAYS count items carefully and ensure the exact requested number is shown
4. NEVER include duplicate entries — verify uniqueness before finalizing
5. Use LARGE fonts (minimum 28pt for body text, 52pt+ for titles) — text must be easily readable
6. AVOID cluttered extras like charts, pies, graphs, or legends that compete for attention
7. Group related items logically with clear visual separation
8. Prefer clean grid or list layouts over dense, overlapping designs
9. Layout guidance: For N items, use a grid that fits all N (e.g., 20 items = 5 columns × 4 rows, or 4 columns × 5 rows). NEVER use "maximum 4 columns and 6 rows" as an excuse to omit items.
10. Cards need generous padding and whitespace — never cram text to the edges
11. VALIDATION STEP: Before finalizing your prompt, count every item you included. If the count doesn't match the source, redesign the layout to fit all items.`;


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
Design a single infographic that captures ALL important items from this content. The infographic should be:

1. **Exhaustive**: Include EVERY distinct item, concept, or pattern from the source content. Count them first. Do not cluster or group multiple items into one card.
2. **Visually Rich**: Use a mix of text, icons, and visual elements
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

3. **Key Points**: List ALL items that appear in the infographic. The count must match the source content exactly.

**INFOGRAPHIC DESIGN PRINCIPLES:**
- Start with a bold title at the top
- Use a logical flow (top-to-bottom or left-to-right)
- For many items (10+), use a COMPACT NUMBERED LIST or GRID layout — NOT large cards
- Each item must be visible with: a number, a short name (2-4 words), and a tiny icon
- Use icons and simple graphics to reinforce concepts
- NO charts, graphs, pies, or legends — keep it clean
- Maintain consistent spacing and alignment
- Text size: 20-24pt for item names, 52pt+ for titles — smaller but still readable
- Use contrasting colors for readability
- Layout must accommodate ALL items: For 20 items, use a dense grid (e.g., 5 columns × 4 rows) with minimal padding. Each cell should be compact.
- NEVER omit items. If space is tight, make cells smaller but ensure every item is visible and labeled.

**CRITICAL INSTRUCTION FOR gpt-image-1.5:**
The gpt-image-1.5 model excels at crisp, sharp text rendering. Your prompt must explicitly specify the exact text to be rendered in quotation marks, the font styles, sizes, colors, and precise positions. Use typography keywords like "crisp", "sharp", "legible", "clear", "bold", "readable" to reinforce text quality. DO NOT include pie charts, bar charts, or legends — they clutter the infographic and make text harder to read.

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
