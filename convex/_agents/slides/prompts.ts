"use node";
/**
 * Prompt templates and schemas for SlideDeckGraph.
 *
 * This system leverages OpenAI's gpt-image-1.5 model's excellent text rendering
 * capabilities to generate complete, professional presentation slides with
 * all text (titles, bullet points, labels) baked directly into the images.
 *
 * Handles:
 * - AI-driven theme selection based on content analysis
 * - Slide concept generation with professional narrative flow (map phase)
 * - Intelligent slide selection for coherent storytelling (selection phase)
 * - Detailed image generation prompts with exact text specifications (refine phase)
 */

import { z } from "zod";
import { env } from "../../_lib/env";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

// ============================================================
// SCHEMAS
// ============================================================

/**
 * Final output Schema for a complete slide.
 */
export const SlideSchema = z.object({
  slideNumber: z.number().int().min(1).describe("The slide number in the deck (1-indexed)"),
  title: z.string().describe("The title of the slide"),
  prompt: z
    .string()
    .describe(
      "Comprehensive prompt for gpt-image-1.5 model that includes: (1) EXACT text to render in quotation marks (title, bullet points, labels), (2) typography specifications (fonts, sizes, weights, crisp/sharp keywords), (3) layout composition (text placement, visual elements, spacing), (4) visual style (AI-selected theme colors, graphics), (5) quality requirements. The prompt must be detailed enough for gpt-image-1.5 to generate a complete, professional presentation slide with all text baked in."
    ),
  imageUrl: z
    .string()
    .nullable()
    .optional()
    .describe("URL to the generated slide image (filled in after image generation)"),
  talkingPoints: z
    .array(z.string())
    .describe(
      "Array of talking points for the presenter (3-5 bullet points) - these are also rendered as bullet points in the slide image for detailed_deck type"
    ),
  sourceReferences: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("References to source material for attribution"),
  metadata: z
    .record(z.string(), z.any())
    .nullable()
    .optional()
    .describe("Additional metadata about the slide"),
});

/**
 * Intermediate candidate schema for slide concepts.
 */
export const SlideCandidateSchema = z.object({
  title: z.string().describe("The title of the slide concept"),
  content: z.string().describe("The main content/topic of the slide"),
  talkingPoints: z.array(z.string()).describe("Key talking points (3-5 bullet points)"),
  sourceSnippet: z.string().describe("Relevant text from source for grounding and reference"),
  themeSpecification: z
    .string()
    .nullable()
    .describe("AI-selected theme specification (only in first slide concept)"),
});

/**
 * Array schema for map phase output.
 */
export const SlideCandidateArraySchema = z.object({
  slides: z.array(SlideCandidateSchema).describe("Array of slide candidate concepts"),
});

/**
 * Array schema for final slide deck.
 */
export const SlideArraySchema = z.object({
  slides: z.array(SlideSchema).describe("Array of final slides with image prompts"),
});

/**
 * Schema for intelligent slide selection from candidates.
 */
export const SlideSelectionSchema = z.object({
  slides: z
    .array(SlideCandidateSchema)
    .describe("Selected slide candidates after intelligent selection"),
  reasoning: z.string().describe("Brief explanation of selection strategy"),
});

// Types inferred from Zod
export type Slide = z.infer<typeof SlideSchema>;
export type SlideCandidate = z.infer<typeof SlideCandidateSchema>;
export type SlideSelectionResponse = z.infer<typeof SlideSelectionSchema>;
export interface SlideCandidateResponse {
  slides: SlideCandidate[];
}
export interface SlideResponse {
  slides: Slide[];
}

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Slide count range mapping for deck lengths.
 */
export const SLIDE_COUNT_MAP = {
  short: { min: 4, max: 6 },
  default: { min: 8, max: 12 },
} as const;

/** Graph configuration. Defaults are defined in convex/_lib/env.ts. */
const SLIDES_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.SLIDES_MAP_CHUNK_TOKENS, 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.SLIDES_REDUCE_CHUNK_TOKENS, 10),
  MIN_SLIDES_PER_CHUNK: parseInt(env.SLIDES_MIN_SLIDES_PER_CHUNK, 10),
  MAX_SLIDES_PER_CHUNK: parseInt(env.SLIDES_MAX_SLIDES_PER_CHUNK, 10),
  MAX_TOKENS: parseInt(env.SLIDES_MAX_TOKENS, 10),
  MAP_TIMEOUT_MS: parseInt(env.SLIDES_MAP_TIMEOUT_MS, 10),
  REDUCE_TIMEOUT_MS: parseInt(env.SLIDES_REDUCE_TIMEOUT_MS, 10),
  IMAGE_TIMEOUT_MS: parseInt(env.SLIDES_IMAGE_TIMEOUT_MS, 10),
  MAX_COLLAPSE_DEPTH: 5,
} as const;

export const GRAPH_CONFIG = {
  ...SLIDES_CONFIG,
} as const;

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase slide concept generation */
export const MAP_CONCEPTS_SYSTEM_PROMPT = `You are an expert instructional designer and presentation architect. You create professional slide deck concepts that follow Mayer's Principles of Multimedia Learning, with clear narrative flow, specific content, and strong visual storytelling potential. Every slide you design has a clear purpose in the overall narrative arc.`;

/** System prompt for reduce phase slide refinement with image generation prompts */
export const REFINE_SLIDES_SYSTEM_PROMPT = `You are a master presentation designer who creates complete, professional slides where ALL text (titles, bullet points, labels) is rendered directly in the image by OpenAI's gpt-image-1.5 model. You craft detailed prompts that specify exact text content in quotation marks, crisp typography with sharp/legible keywords, precise layout, and visual elements to produce publication-ready slides with excellent text rendering.

You excel at adapting visual styles to match content - from vintage academia to modern minimalist, corporate professional to creative bold, technical diagrams to artistic illustrations. You always select and apply the most appropriate theme for the subject matter and audience, maintaining perfect consistency across all slides.`;

/** System prompt for title generation */
export const TITLE_GENERATION_SYSTEM_PROMPT =
  "You are an expert at creating compelling, descriptive titles for presentations.";

/** System prompt for intelligent slide selection */
export const SLIDE_SELECTION_SYSTEM_PROMPT =
  "You are an expert instructional designer and presentation architect selecting the best slides for a coherent, educational narrative arc.";

// ============================================================
// MAP PROMPT (CONCEPT GENERATION)
// ============================================================

export const getCandidateMapPrompt = (params: {
  chunk: string;
  slidesPerChunk: number;
  slideType: "detailed_deck" | "presenter_slides";
  deckLength: "short" | "default";
  customPrompt?: string;
}): string => {
  const { chunk, slidesPerChunk, slideType, deckLength, customPrompt } = params;

  // Optimized for Cognitive Load Theory
  const slideTypeDescription =
    slideType === "detailed_deck"
      ? "Detailed Deck: Professional slides with clear titles and 3-5 concise bullet points. Each bullet should be a complete, actionable insight (not fragments). Balance text with visual elements."
      : "Presenter Slides: Highly visual slides with bold titles and 1-2 key phrases maximum. The visual tells the story; text provides anchors.";

  const deckLengthDescription =
    deckLength === "short"
      ? 'Short Deck: 4-6 slides. Focus on the "Big Idea" and 3 key supporting pillars. Each slide must be impactful.'
      : "Standard Deck: 8-12 slides. A complete narrative arc: Hook -> Foundation -> Core Concepts -> Deep Dive -> Application -> Conclusion.";

  return `You are an expert instructional designer and presentation architect analyzing educational content.

${MARKDOWN_MATH_NOTATION_FOR_APP}

**Slide Strategy:** ${slideTypeDescription}
**Deck Scope:** ${deckLengthDescription}
${customPrompt ? `**Custom Focus:** ${customPrompt}` : ""}

TASK: Extract approximately ${slidesPerChunk} slide concepts that will form a cohesive, professional presentation.

For each concept, strictly provide:
1. **Title**: Compelling, specific title (8-12 words max). Use active language. Examples:
   - Good: "How Neural Networks Learn from Data"
   - Bad: "Neural Networks" or "Learning Process"

2. **Content**: The core learning objective in 1-2 sentences. What key insight will the audience gain?

3. **Talking Points**: ${slideType === "detailed_deck" ? "3-5 complete, concise bullet points" : "1-2 key phrases or statistics"}. Each point should be:
   - Self-contained and meaningful (not fragments like "Introduction" or "Overview")
   - Specific and actionable (include numbers, examples, or concrete details)
   - Written in parallel structure for professional flow
   ${slideType === "detailed_deck" ? "- 10-15 words per bullet point maximum" : "- 3-8 words per phrase maximum"}

4. **Source Snippet**: Verbatim text backing this concept (for attribution).

PRESENTATION DESIGN PRINCIPLES:
- **Narrative Flow**: Each slide should logically lead to the next. Think: Setup → Insight → Evidence → Application
- **One Concept Per Slide**: Avoid cramming multiple ideas. If a topic is complex, split it across multiple slides.
- **Visual Storytelling**: Prioritize concepts that can be illustrated (processes, comparisons, hierarchies, timelines)
- **Professional Tone**: Use clear, confident language. Avoid jargon unless essential.
- **Audience Engagement**: Start with "why it matters", then explain "how it works"

QUALITY CHECKLIST FOR EACH SLIDE:
✓ Title is specific and engaging (not generic)
✓ Talking points are complete thoughts (not fragments)
✓ Content flows logically from previous slide concepts
✓ Concept can be visualized effectively
✓ Text is concise enough to render clearly in image

Content to analyze:
${chunk}`;
};

// ============================================================
// REFINE PROMPT (IMAGE GENERATION)
// ============================================================

export const getRefineSlidePrompt = (
  candidate: SlideCandidate,
  slideNumber: number,
  slideType: "detailed_deck" | "presenter_slides",
  themeInstructions?: string,
  customPrompt?: string
): string => {
  const layoutGuidance =
    slideType === "detailed_deck"
      ? `LAYOUT STRUCTURE FOR DETAILED DECK:
    - Professional presentation slide with clear hierarchy
    - Title at the top in large, bold font appropriate to the theme (crisp, sharp text)
    - 3-5 bullet points in clean, readable font (legible, high contrast)
    - Visual element (diagram, illustration, or icon) integrated with the text
    - Balanced composition with proper whitespace
    - Text should be large enough to read clearly (minimum 24pt for body, 48pt for title)
    - Use quotation marks around all text to render`
      : `LAYOUT STRUCTURE FOR PRESENTER SLIDES:
    - Minimalist presentation slide with strong visual impact
    - Large, bold title that dominates the top or center (crisp, sharp typography)
    - 1-2 key phrases or statistics (if any) with clear, readable text
    - Dominant visual element that conveys the concept
    - Minimal text, maximum visual storytelling
    - Title should be very large (60-80pt)
    - Use quotation marks around all text to render`;

  // Format talking points as bullet text for the image
  const bulletPoints = candidate.talkingPoints.slice(0, slideType === "detailed_deck" ? 5 : 2);
  const bulletText = bulletPoints.map((point, idx) => `${idx + 1}. ${point}`).join("\n");

  return `You are creating a prompt for OpenAI's gpt-image-1.5 model, which EXCELS at rendering crisp, sharp text within images.
${customPrompt ? `**Custom Focus:** Ensure the slide content reflects this focus area: ${customPrompt}` : ""}

**THEME INSTRUCTIONS:**
${themeInstructions || "Apply a professional, modern aesthetic appropriate for the content. Use clean typography, balanced layouts, and a cohesive color palette that enhances the message."}

**SLIDE CONTEXT:**
Slide Number: ${slideNumber}
Title: "${candidate.title}"
Core Concept: ${candidate.content}

**${layoutGuidance}**

TASK: Create a complete, professional presentation slide with ALL text rendered directly in the image.

IMPORTANT: You MUST set slideNumber to ${slideNumber} in your response.

Your prompt must include:

1. **EXACT TEXT TO RENDER:**
   - Title (large, prominent): "${candidate.title}"
   ${
     slideType === "detailed_deck"
       ? `- Bullet points (clear, readable):\n${bulletText}`
       : bulletPoints.length > 0
         ? `- Key phrase (impactful, center): "${bulletPoints[0]}"`
         : ""
   }

2. **VISUAL DESIGN:**
   - Background: As specified in theme instructions
   - Visual element: ${candidate.content} (represented as illustration, diagram, or graphic appropriate to the theme)
   - Color palette: As specified in theme instructions
   - Typography: Fonts appropriate to the theme (clear, readable, with crisp text rendering)

3. **LAYOUT COMPOSITION:**
   - Professional presentation format (16:9 aspect ratio, 1728x960px)
   - Clear visual hierarchy with proper spacing
   - Balanced composition between text and visuals
   - High-quality, publication-ready appearance

4. **STYLE REQUIREMENTS:**
   - High definition, 8k quality
   - Professional presentation aesthetic aligned with theme
   - All text must be perfectly legible, crisp, sharp, and spelled correctly
   - Use clear, readable typography with high contrast
   - Bold fonts for emphasis where appropriate

**CRITICAL INSTRUCTION FOR gpt-image-1.5:**
The gpt-image-1.5 model excels at crisp, sharp text rendering. Your prompt should explicitly specify the exact text to be rendered in quotation marks, the font styles (serif/sans-serif), sizes in points, colors, and precise positions. Use typography keywords like "crisp", "sharp", "legible", "clear", "bold", "readable" to reinforce text quality. The model will generate a complete slide with all text baked into the image professionally.

**KEY ELEMENTS YOUR PROMPT MUST INCLUDE:**
✓ Exact text to render (title + bullet points) with quotation marks
✓ Font specifications (serif/sans-serif, sizes in pt)
✓ Color codes for text and background (appropriate to theme)
✓ Precise layout percentages or positioning
✓ Visual element description (what to illustrate and how)
✓ Style keywords (professional, 8k, etc.)
✓ Aspect ratio confirmation (16:9, 1728x960px)

Output the complete slide object with the detailed image generation prompt.`;
};

// ============================================================
// TITLE GENERATION PROMPT
// ============================================================

export const getTitleGenerationPrompt = (slides: Slide[]): string => {
  const slideTopics = slides.map((s) => s.title).join(", ");
  return `Analyze the following slide deck topics and generate a sophisticated, academic title for the presentation.

Slide topics: ${slideTopics}

The title should:
- Be intellectual yet accessible (3-8 words)
- Reflect the "Vintage/Research" aesthetic (e.g., "A Treatise on...", "The Mechanics of...", "Exploring...")
- Be professional
- Do not use exclamation marks or clickbait phrasing

Return only the title text, nothing else.`;
};

// ============================================================
// SLIDE SELECTION PROMPT
// ============================================================

export const getSlideSelectionPrompt = (params: {
  candidates: SlideCandidate[];
  minSlides: number;
  maxSlides: number;
  slideType: "detailed_deck" | "presenter_slides";
  deckLength: "short" | "default";
  customPrompt?: string;
}): string => {
  const { candidates, minSlides, maxSlides, deckLength, customPrompt } = params;
  const targetCount = Math.floor((minSlides + maxSlides) / 2);

  // Format candidates for LLM
  const candidatesList = candidates
    .map(
      (c, i) =>
        `[ID: ${i}] TITLE: ${c.title}\n    CONCEPT: ${c.content}\n    POINTS: ${c.talkingPoints.slice(0, 2).join(" | ")}`
    )
    .join("\n\n");

  const narrativeGuidance =
    deckLength === "short"
      ? `**SHORT DECK NARRATIVE (4-6 slides):**
1. **Opening Hook** (1 slide): Why this topic matters - the big picture
2. **Core Concept** (2-3 slides): The essential ideas, mechanisms, or frameworks
3. **Closing Impact** (1 slide): Key takeaway, application, or call-to-action`
      : `**STANDARD DECK NARRATIVE (8-12 slides):**
1. **Opening Hook** (1-2 slides): Problem statement, context, or "why this matters"
2. **Foundation** (1-2 slides): Key definitions, background, or prerequisites
3. **Core Concepts** (3-5 slides): The main ideas, broken into digestible chunks
4. **Deep Dive/Examples** (1-2 slides): Detailed exploration or case studies
5. **Application/Implications** (1-2 slides): How to use this, what it means
6. **Conclusion** (1 slide): Summary, next steps, or future outlook`;

  return `You are a Senior Presentation Architect curating a world-class educational slide deck.

**GOAL:** Select ${targetCount} slides (Range: ${minSlides}-${maxSlides}) that form a compelling, professional narrative.
${customPrompt ? `**Custom Focus:** ${customPrompt}` : ""}

${narrativeGuidance}

**INPUT CANDIDATES:**
${candidatesList}

**SELECTION CRITERIA:**

1. **Narrative Coherence**: 
   - Each slide must logically flow from the previous one
   - Avoid jumps in complexity or topic
   - Build knowledge progressively (scaffolding)

2. **Content Quality**:
   - Prioritize slides with specific, concrete information over vague concepts
   - Choose slides with clear visual potential (diagrams, processes, comparisons)
   - Ensure talking points are substantive (not generic filler)

3. **Audience Engagement**:
   - Start strong: Hook the audience with relevance or intrigue
   - Middle substance: Deliver core value with clarity
   - End memorably: Leave them with actionable insights

4. **Professional Polish**:
   - Eliminate redundancy: Merge similar slides into one stronger slide
   - Remove weak slides: Cut anything too vague, too minor, or off-topic
   - Balance depth: Don't overload one area while neglecting others

**MERGING GUIDELINES:**
If multiple candidates cover similar ground (e.g., ID:3 and ID:7 both discuss "benefits"), combine them:
- Keep the better title
- Merge the best talking points from both
- Combine content descriptions

**OUTPUT:**
Return the final curated list of slides with your reasoning for the narrative arc you've constructed.`;
};

// ============================================================
// EXAMPLE PROMPTS (FOR REFERENCE)
// ============================================================

/**
 * Example of a well-formed image generation prompt for gpt-image-1.5.
 * These examples demonstrate the level of detail and specificity required.
 */
export const EXAMPLE_IMAGE_PROMPTS = {
  detailed_deck: `Professional presentation slide. 16:9 aspect ratio (1728x960px).

TITLE (top, large bold font 60pt, primary color):
"How Neural Networks Learn from Data"

BULLET POINTS (left side, clean sans-serif 28pt, high contrast):
1. Networks adjust weights through backpropagation algorithm
2. Training requires labeled datasets and loss function optimization
3. Learning rate controls the speed of weight adjustments
4. Overfitting occurs when model memorizes rather than generalizes

VISUAL ELEMENT (right side, 50% of slide):
Technical diagram of a neural network with nodes and connections, arrows showing data flow, clean modern illustration style

BACKGROUND:
Professional solid color or subtle gradient appropriate to the theme

LAYOUT:
Split composition - text occupies left 45%, visual occupies right 55%, proper margins and spacing

STYLE:
Professional presentation quality, 8k resolution, crisp text rendering`,

  presenter_slides: `Professional presentation slide. 16:9 aspect ratio (1728x960px).

TITLE (center-top, very large bold font 72pt, primary color):
"The Power of Compound Interest"

KEY PHRASE (center, medium sans-serif 36pt, accent color):
"Small changes today, exponential results tomorrow"

VISUAL ELEMENT (dominant, 85% of slide):
Clean graph showing exponential growth curve, smooth modern style, subtle grid lines

BACKGROUND:
Professional solid color or subtle gradient appropriate to the theme

LAYOUT:
Hero composition - title at top 10%, key phrase in middle 10%, massive visual dominates 80%

STYLE:
Professional presentation design, 8k quality, perfect text rendering`,
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function formatCandidatesAsText(candidates: SlideCandidate[]): string {
  return candidates
    .map((c, index) => {
      return `Slide ${index + 1}
Title: ${c.title}
Content: ${c.content}
Talking Points:
${c.talkingPoints.map((p, i) => `   ${i + 1}. ${p}`).join("\n")}
Source: ${c.sourceSnippet.substring(0, 200)}...`;
    })
    .join("\n\n---\n\n");
}
