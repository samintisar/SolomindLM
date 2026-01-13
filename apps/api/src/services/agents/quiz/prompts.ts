/**
 * Prompt templates and schemas for QuizGraph.
 *
 * Contains all prompt templates, Zod schemas, and constants
 * related to quiz question generation prompts.
 */

import { z } from 'zod';

// ============================================================
// SCHEMAS
// ============================================================

export const QuizQuestionSchema = z.object({
  question: z.string().describe('The complete question text'),
  options: z.array(z.string()).length(4).describe('Exactly 4 options for the question'),
  answer: z.number().describe('Index of correct option (0-3)'),
  hint: z.string().describe('A helpful hint that guides without revealing the answer'),
  explanation: z.string().describe('Explanation of why the correct answer is right'),
});

export const QuizQuestionArraySchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('Array of quiz questions'),
});

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  hint: string;
  explanation: string;
}

export interface QuizQuestionResponse {
  questions: QuizQuestion[];
}

// ============================================================
// CONFIGURATION
// ============================================================

export const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5000, // ~20K chars ≈ 5K tokens
  REDUCE_CHUNK_SIZE_TOKENS: 10000, // ~40K chars ≈ 10K tokens
  MIN_QUESTIONS_PER_CHUNK: 3,
  MIN_CHUNKS: 3,
  MAP_TIMEOUT_MS: 180000,
  REDUCE_TIMEOUT_MS: 240000,
  MAX_COLLAPSE_DEPTH: 5,
} as const;

// ============================================================
// PROMPT TEMPLATES
// ============================================================

/**
 * Map prompt for generating quiz questions from chunks
 */
export const getMapPrompt = (params: {
  chunk: string;
  questionCount: number;
  questionsPerChunk: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { chunk, questionCount, questionsPerChunk, difficulty, focus } = params;

  const difficultyGuidance: Record<string, string> = {
    easy: 'basic recall and definitions - straightforward facts',
    medium: 'concepts and relationships - requires understanding',
    hard: 'application and analysis - requires deeper thinking',
  };

  return `You are an expert educator creating HIGH-QUALITY multiple-choice quiz questions from educational content.

TARGET: Generate exactly ${questionsPerChunk} questions from this section (part of ${questionCount} total questions).

**Difficulty: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${focus ? `**Focus:** ${focus}` : ''}

REQUIREMENTS:
- Each question MUST have exactly 4 options
- Distractors must be plausible but clearly incorrect
- Avoid obvious patterns like "All of the above"
- Hints must guide without revealing the answer
- Questions MUST be self-contained (include all necessary context)

**ANSWER FORMAT CRITICAL:**
- The "answer" field MUST be a NUMBER representing the 0-based index of the correct option
- Option indices: 0 = first option, 1 = second option, 2 = third option, 3 = fourth option
- Example: If the correct answer is the FIRST option, set answer: 0
- Example: If the correct answer is the SECOND option, set answer: 1
- DO NOT use letters (A, B, C, D) - use ONLY numbers (0, 1, 2, 3)

**SELF-CONTAINED QUESTIONS:**
If a question references diagrams, code, or scenarios:
- Include the relevant content IN the question
- NEVER use vague references like "the diagram" or "the following" without context
- Example: BAD → "In the diagram shown..."  GOOD → "In the ER diagram with Entities A(id) and B(id)..."

**HINT GUIDELINES:**
- Point to relevant concepts without giving the answer
- Use phrases like "Consider...", "Recall that...", "Think about..."
- Examples: "Consider the order of operations" or "Recall the definition of..."

**EXPLANATION GUIDELINES:**
- CRITICAL: Your explanation MUST be grounded in the provided source material
- Reference specific concepts, facts, or quotes from the content above
- DO NOT hallucinate or rely on outside knowledge
- If the source doesn't support an explanation, create a different question
- Example format: "According to the text, [concept]..." or "The material states that..."
- Explain WHY the correct answer is right using evidence from the material

Content to create questions from:
${chunk}`;
};
