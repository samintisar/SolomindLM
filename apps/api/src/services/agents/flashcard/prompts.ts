/**
 * Prompt templates and schemas for FlashcardGraph.
 *
 * Contains all prompt template functions, Zod schemas, and constants
 * related to flashcard generation prompts.
 */

import { z } from 'zod';

// ============================================================
// SCHEMAS
// ============================================================

export const FlashcardArraySchema = z.object({
  flashcards: z.array(z.object({
    front: z.string(),
    back: z.string(),
  })),
});

export interface Flashcard {
  front: string;
  back: string;
}

export interface FlashcardResponse {
  flashcards: Flashcard[];
}

// ============================================================
// CONSTANTS
// ============================================================

// Problematic phrases that indicate flashcards aren't self-contained
// Only include phrases that are strong indicators of external content references
// Note: "the following" is intentionally excluded - it's commonly used in questions
export const PROBLEMATIC_PHRASES = [
  'the diagram',
  'the above',
  'as shown',
  'this chart',
  'that example',
  'the table',
  'this figure',
] as const;

// ============================================================
// PROMPT TEMPLATES
// ============================================================

/**
 * Map prompt for generating Q&A pairs from chunks
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
    easy: 'basic recall and definitions',
    medium: 'concepts and relationships',
    hard: 'application and analysis',
  };

  return `You are an expert educator creating HIGH-QUALITY & RELEVANT study flashcards from educational content.

HARD LIMIT: Generate ${cardsPerChunk} question-answer pairs maximum from this section. NOT more.
This is part of a larger set targeting ${cardCount} total cards across all chunks.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${topic ? `**Topic Focus:** ${topic}` : ''}

**Guidelines:**
- Questions should be clear, specific, and test understanding
- Answers should be concise but complete
- Focus on key concepts, definitions, and important relationships
- Avoid overly trivial or obvious questions

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

*** IMPORTANT: THE EXAMPLES BELOW ARE FOR REFERENCE ONLY. DO NOT INCLUDE THEM IN YOUR OUTPUT. ***

EXAMPLES OF SELF-CONTAINED FLASHCARDS (DO NOT COPY):

EXAMPLE 1 - Formula Reference:
Q: Using the formula F = ma, if a force of 100N is applied to a 10kg object, what is the acceleration?
A: 10 m/s² (a = F/m = 100N / 10kg = 10 m/s²)

EXAMPLE 2 - Code Reference:
Q: What does the following JavaScript code output? 'const arr = [1, 2, 3]; arr.push(4); console.log(arr.length);'
A: 4 (The push() method adds an element to the array, resulting in [1, 2, 3, 4], so length is 4)

EXAMPLE 3 - Context-Heavy Reference:
Q: A chemical reaction produces 50g of product from 100g of reactant. If the theoretical maximum yield is 80g, what is the percent yield?
A: 62.5% (Percent yield = (actual / theoretical) × 100 = (50g / 80g) × 100 = 62.5%)

*** END OF EXAMPLES - NOW GENERATE ORIGINAL FLASHCARDS FROM THE CONTENT BELOW ***

**Format each pair as:**
Q: [your question text - COMPLETE AND SELF-CONTAINED with all necessary context]
A: [your answer]

REMEMBER: Generate ORIGINAL questions from the content below. Do NOT copy the examples above.

Content:
${chunk}

FLASHCARDS:`;
};

/**
 * Reduce prompt for selecting and refining final flashcards
 */
export const getReducePrompt = (params: {
  content: string;
  cardCount: number;
  difficulty: string;
  topic?: string;
}): string => {
  const { content, cardCount, difficulty, topic } = params;

  return `You are selecting flashcards for a study set. Your goal is to create a DIVERSE & HIGH-QUALITY set that covers ALL major topics.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST select flashcards from DIFFERENT topics. Do NOT select more than 3 cards from any single topic.
If there are 6+ topics available, select 1-3 cards from each topic.
Your goal is MAXIMUM TOPIC DIVERSITY, not maximum cards on one topic.

TASK:
1. First, mentally identify 5-7 distinct topics in the content below
2. Then select ${cardCount} cards distributed EVENLY across those topics
3. Example: If you need 20 cards and have 5 topics, select 4 from each topic

Difficulty: ${difficulty}
${topic ? `User preference: ${topic} (but still maintain diversity)` : ''}

QUESTION-ANSWER PAIRS:
${content}

Select exactly ${cardCount} diverse flashcards:`;
};
