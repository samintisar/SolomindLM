"use node";
/**
 * Prompt templates and schemas for FlashcardGraph.
 *
 * Contains all prompt template functions, Zod schemas, and constants
 * related to flashcard generation prompts.
 */

import { z } from "zod";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

// ============================================================
// SCHEMAS
// ============================================================

export const FlashcardArraySchema = z.object({
  flashcards: z.array(
    z.object({
      type: z.enum(["wh-question", "fill-blank", "true-false", "definition", "scenario"]),
      front: z.string(),
      back: z.string(),
      // FIX: TogetherAI/OpenAI strict output requires .nullable() before .optional()
      topic: z.string().nullable().optional().describe("Topic category or null if not applicable"),
    })
  ),
});

export interface Flashcard {
  type: "wh-question" | "fill-blank" | "true-false" | "definition" | "scenario";
  front: string;
  back: string;
  topic?: string | null; // Optional topic field (nullable for TogetherAI/OpenAI strict output)
}

export interface FlashcardResponse {
  flashcards: Flashcard[];
}

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase flashcard generation */
export const MAP_SYSTEM_PROMPT = "You are an expert educator. Output strictly in JSON.";

/** System prompt for collapse phase flashcard consolidation */
export const COLLAPSE_SYSTEM_PROMPT =
  "You are a skilled content consolidator. Output strictly in JSON.";

/** System prompt for reduce phase flashcard selection and diversification */
export const REDUCE_SYSTEM_PROMPT =
  "You are an expert curriculum designer creating DIVERSE study sets. Your goal is to spread selections across ALL topics, not cluster on one.";

// ============================================================
// CONSTANTS
// ============================================================

// Problematic phrases that indicate flashcards aren't self-contained
// Only include phrases that are strong indicators of external content references
// Note: "the following" is intentionally excluded - it's commonly used in questions
export const PROBLEMATIC_PHRASES = [
  "the diagram",
  "the above",
  "as shown",
  "this chart",
  "that example",
  "the table",
  "this figure",
] as const;

/**
 * The front is what the learner sees before recalling the back, so it must not
 * already contain the back. Shared by map, collapse and refine so merged or
 * rewritten cards keep the rule; `flashcardDefects.ts` enforces it afterwards.
 */
export const ANSWER_NOT_ON_FRONT_RULES = `**NEVER PUT THE ANSWER ON THE FRONT:**
- The front must not contain the answer from the back: not in parentheses, not in quotes, and not elsewhere in the sentence.
- A fill-in-the-blank hint may give a base or dictionary form, a category, or a choice list, but never the exact word or phrase that fills the blank.
- Explanations belong on the back. Never append "(True)", "(False - ...)" or the definition to the front.
- Read the front with the answer put into the blank: it must be a complete, correct sentence. The blank covers the whole answer and nothing more, so no word is left doubled or half-written beside it.`;

// ============================================================
// PROMPT TEMPLATES
// ============================================================

/**
 * Map prompt for generating flashcards from chunks using structured JSON output.
 */
export const getMapPrompt = (params: {
  chunk: string;
  cardCount: number;
  cardsPerChunk: number;
  difficulty: string;
  topic?: string;
}): string => {
  const { chunk, cardCount, cardsPerChunk, difficulty, topic } = params;

  const difficultyGuidance: Record<string, string> = {
    easy: "basic recall and definitions",
    medium: "concepts and relationships",
    hard: "application and analysis",
  };

  return `You are an expert educator creating HIGH-QUALITY & RELEVANT study flashcards from educational content.

${MARKDOWN_MATH_NOTATION_FOR_APP}

HARD LIMIT: Generate ${cardsPerChunk} flashcards maximum from this section. NOT more.
This is part of a larger set targeting ${cardCount} total cards across all chunks.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${topic ? `**Topic Focus:** ${topic}` : ""}

**CARD VARIETY REQUIREMENT:**
You MUST generate a DIVERSE mix of flashcard types. Distribute evenly across these 5 types:
1. **WH-Question** (what, where, when, why, how) - Test factual recall
   Front: "What is the primary function of mitochondria?"
   Back: "Producing most of the cell's ATP."
2. **Fill-in-the-Blank** - Test precise knowledge recall
   Front: "The _____ is the control center of the cell and contains DNA."
   Back: "nucleus"
3. **True/False** - Test understanding of misconceptions
   Front: "True or False: Mitochondria are found only in animal cells."
   Back: "False - plant cells have mitochondria too."
4. **Definition** - Test concept understanding
   Front: "Define: mitochondria"
   Back: "The organelle that generates most of the cell's ATP."
5. **Scenario/Application** - Test knowledge transfer
   Front: "If a cell lacks mitochondria, which cellular process would be most impaired?"
   Back: "ATP production (energy metabolism)."

**Card Type Distribution:** Aim for ~20% of each type. Mix them evenly!

**Guidelines:**
- Questions should be clear, specific, and test understanding
- Answers should be concise but complete
- Focus on key concepts, definitions, and important relationships
- Avoid overly trivial or obvious questions
- For true/false: include explanation in answer to clarify why it's true or false
- For fill-in-the-blank: ensure the blank is the key concept being tested

${ANSWER_NOT_ON_FRONT_RULES}

**SELF-CONTAINED FLASHCARDS REQUIREMENT:**
CRITICAL: Each flashcard question MUST BE COMPLETELY SELF-CONTAINED. The user will ONLY see the question and answer.

RULES FOR CONTEXT INCLUSION:
1. If a question references a diagram, chart, or visual element:
   - Describe it thoroughly within the question
   - Example: "In the ER diagram showing Entities A(id) and B(id) with a one-to-many relationship from A to B, what does the foreign key represent?"

2. If a question references a code snippet:
   - Include the relevant code in the question
   - Example: "Given the code 'function foo() { return 1; }', what does foo() return?"

3. If a question references a scenario/example:
   - Summarize the key details within the question
   - Example: "In a scenario where a user attempts login with invalid credentials, what response should the server return?"

4. NEVER use vague references like "the diagram", "the above", or "the following" without including the actual content
   - REWRITE to include the actual content being referenced

5. If context is too long (>300 chars):
   - Summarize the essential parts needed to answer
   - Example: "Given a database schema with Users(id, email) and Orders(user_id, total)..." instead of full schema

BALANCE: Questions should be complete but concise. Include only what's necessary to answer correctly.

**OUTPUT FORMAT:**
Return a JSON object with a "flashcards" array containing objects with:
- "type": One of: "wh-question", "fill-blank", "true-false", "definition", "scenario"
- "front": The question/prompt
- "back": The answer/explanation
- "topic": A short 1-3 word category for this specific card (e.g., "History", "Definition", "Formula")

Content:
${chunk}

Generate exactly ${cardsPerChunk} flashcards from the content above as JSON:`;
};

/**
 * Reduce prompt for selecting and refining final flashcards.
 * Updated to include deduplication, merging, and topic diversity logic.
 */
export const getReducePrompt = (params: {
  content: string;
  cardCount: number;
  difficulty: string;
  topic?: string;
}): string => {
  const { content, cardCount, difficulty, topic } = params;

  return `You are an expert educator selecting and refining flashcards for a study set.

CRITICAL REQUIREMENTS:
- Select approximately ${cardCount} flashcards (target: ${cardCount}, hard floor: ${Math.ceil(cardCount * 0.8)})
- IDENTIFY AND MERGE similar or duplicate flashcards before selecting
- The dedup rule decides *which* cards you keep; coverage decides *how many distinct items must appear*. Neither rule lowers the target count.
- Your goal is MAXIMUM SEMANTIC DIVERSITY - each card should cover a distinct concept

COVERAGE-FIRST RULE (overrides dedup, never reduces count):
If the source content enumerates a discrete, named list of items (e.g. "20 patterns",
"the 7 principles", "the following frameworks: X, Y, Z"), treat each named item as a
distinct concept. Two cards covering different named items are NOT duplicates even if
the question wording is similar — both must be retained. Before adding any second card
for a named item, ensure every named item has at least one card. If after covering all
named items you have fewer than ${cardCount} cards, add follow-ups on the most central
named items until you reach ${cardCount}. Never return fewer cards than the target.

SIMILARITY DETECTION GUIDELINES:
Flashcards are considered similar if they:
- Test the same definition or concept (e.g., "Define X" on front, "What is X" on front)
- Have the same answer despite different question phrasing
- Cover overlapping content that could be combined into one card

MERGING STRATEGY:
When you find similar flashcards:
- Combine the best elements from each version (clearest question, most complete answer)
- Create a single, clearer flashcard
- Ensure the merged card is self-contained
- Keep the most comprehensive explanation or examples

TOPIC DIVERSITY:
Additionally, select flashcards from DIFFERENT topics. Do NOT select more than 3 cards from any single topic if possible.
If there are 6+ topics available, select 1-3 cards from each topic.
Example: If you need 20 cards and have 5 topics, select 4 from each topic

Difficulty: ${difficulty}
${topic ? `User preference: ${topic} (but still maintain diversity)` : ""}

Available flashcards:
${content}

Return the selected flashcards as a JSON array. 
For each flashcard, include a "topic" field that categorizes the card (e.g., "Definitions", "Processes", "Timeline", "Concepts", etc.). This helps ensure topic diversity.`;
};
