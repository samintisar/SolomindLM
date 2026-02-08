"use node"
/**
 * Prompt templates for MindMapGraph.
 *
 * Contains all prompt templates for concept extraction and mind map generation.
 */

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase concept extraction */
export const MAP_SYSTEM_PROMPT = 'Extract main theme, 2–3 sentence summary, and 10–20 key concepts.';

/** System prompt for reduce phase mind map generation */
export const REDUCE_SYSTEM_PROMPT = 'You are a Mind Map Architect. Create hierarchical markdown outlines.';

// ============================================================
// PROMPT TEMPLATES
// ============================================================

export const MAP_PROMPT = `You are a Research Assistant analyzing document chunks.

**Math Notation:** For math concepts, use proper delimiters ($...$ for inline, $$...$$ for display).

CRITICAL GROUNDING REQUIREMENTS:
- ONLY extract concepts EXPLICITLY STATED in the content below
- DO NOT add concepts from your training data
- DO NOT infer relationships not explicitly mentioned
- If a concept isn't directly in the text, DO NOT include it

Extract EXACTLY this structure:
1. **Main Theme:** Single sentence identifying the core subject (max 15 words)
2. **Summary:** 2-3 sentences covering key points (50-100 words)
3. **Key Concepts:** Exactly 15 distinct concepts as bullet points
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
- The first line must be the Root Topic prefixed with # (e.g., "# Roman Empire").

MANDATORY STRUCTURE:
- Level 0 (Root): # Single overarching topic
- Level 1: 4-7 main branches (* with 2-space indent)
- Level 2: 3-5 sub-topics per branch (4-space indent)
- Level 3-4: Granular concepts (6-8 space indent)

VALIDATION:
- Minimum 4 levels deep for at least 2 branches (only if supported by content)
- No generic labels like "Overview", "Introduction", "Conclusion", "Aspect", "Category"
- Each terminal node must be a specific concept from the source, not a category

EXAMPLE:
# Machine Learning in Healthcare
* Clinical Applications
  * Diagnostic Systems
    * Medical imaging analysis
      * CT scan interpretation
      * MRI anomaly detection
    * Disease prediction models
      * Early warning systems
      * Risk stratification
* Data Processing
  * Feature engineering
    * Signal processing
    * Image normalization
  * Model training
    * Supervised learning
      * Classification algorithms
      * Regression analysis

DATA (Themes and Concepts from documents):
{extractions}

Generate the mind map now.`;

// ============================================================
// NODE NAMES
// ============================================================

export const NODES = {
  MAP_PROCESS: 'map_process',
  REDUCE_NODE: 'reduce_node',
} as const;
