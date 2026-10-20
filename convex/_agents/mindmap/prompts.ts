"use node";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

/**
 * Prompt templates for MindMapGraph.
 *
 * Contains all prompt templates for concept extraction and mind map generation.
 */

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase concept extraction */
export const MAP_SYSTEM_PROMPT =
  "Extract main theme, 2–3 sentence summary, and 10–20 key concepts.";

/** System prompt for reduce phase mind map generation */
export const REDUCE_SYSTEM_PROMPT =
  "You are a Mind Map Architect. Create hierarchical markdown outlines.";

// ============================================================
// PROMPT TEMPLATES
// ============================================================

// Main items come first and each gets its own concept. A fixed "exactly 15 concepts" let dense chunks
// squeeze listed items out, or fold them into another concept or the summary, so the map never got them.
export const MAP_PROMPT = `You are a Research Assistant analyzing document chunks.

${MARKDOWN_MATH_NOTATION_FOR_APP}

CRITICAL GROUNDING REQUIREMENTS:
- ONLY extract concepts EXPLICITLY STATED in the content below
- DO NOT add concepts from your training data
- DO NOT infer relationships not explicitly mentioned
- If a concept isn't directly in the text, DO NOT include it

Extract EXACTLY this structure:
1. **Main Theme:** Single sentence identifying the core subject (max 15 words)
2. **Summary:** 2-3 sentences covering key points (50-100 words)
3. **Key Concepts:** 15–25 distinct concepts as bullet points
   - First, every main item or topic this text covers, each as its own concept, using the text's own names (if the text numbers its items, include every one). Never fold a main item into another concept's context or into the summary.
   - Then the most important details of those items, until you reach 15–25 concepts in all
   - ONLY concepts explicitly mentioned in the source
   - Format: "Concept name: brief context (5-10 words)"
   - Avoid: Generic terms, duplicates, concepts not in source

Input chunk:
{content}`;

export const REDUCE_PROMPT = `You are a Mind Map Architect.
Analyze the extracted data and create a deep, hierarchical mind map.

CRITICAL GROUNDING REQUIREMENTS:
- ONLY use concepts and themes from the extracted data below
- DO NOT add branches, nodes, or concepts not present in the source material
- DO NOT use generic labels like "Overview", "Introduction", "Conclusion", "Aspect", "Category"
- Each terminal node must be a specific concept from the source
- If the extracted data doesn't support a 4-level hierarchy, use fewer levels rather than inventing content

OUTPUT FORMAT:
- Use Markdown bullet points (* or -).
- Indentation determines depth (2 spaces per level).
- The first line must be the Root Topic prefixed with # (e.g., "# [Root topic]").

MANDATORY STRUCTURE:
- Level 0 (Root): # Single overarching topic
- Level 1: 4-7 main branches (* with 2-space indent)
- Level 2: 3-5 sub-topics per branch (4-space indent)
- Level 3-4: Granular concepts (6-8 space indent)

VALIDATION:
- Minimum 4 levels deep for at least 2 branches (only if supported by content)
- No generic labels like "Overview", "Introduction", "Conclusion", "Aspect", "Category"
- Each terminal node must be a specific concept from the source, not a category

EXAMPLE SHAPE (placeholders only; every label must come from the data below):
# [Root topic]
* [Main branch]
  * [Sub-topic]
    * [Specific concept]
      * [Detail]
      * [Detail]
    * [Specific concept]
  * [Sub-topic]
    * [Specific concept]
* [Main branch]
  * [Sub-topic]
    * [Specific concept]

DATA (Themes and Concepts from documents):
{extractions}

Generate the mind map now.`;

/**
 * Add the user's custom prompt (already sanitized) to a map or reduce prompt. Without one the
 * prompt is unchanged.
 */
export function withMindMapRequest(prompt: string, request: string | undefined): string {
  const trimmed = request?.trim();
  if (!trimmed) return prompt;
  return `${prompt}

USER REQUEST (follow it for focus, emphasis and organization): "${trimmed}"
Only use concepts from the source material above; if the source doesn't cover part of the request, leave that part out rather than inventing it.`;
}

// ============================================================
// NODE NAMES
// ============================================================

export const NODES = {
  MAP_PROCESS: "map_process",
  REDUCE_NODE: "reduce_node",
} as const;
