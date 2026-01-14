/**
 * Prompt templates and schemas for QuizGraph.
 *
 * Contains all prompt templates, Zod schemas, and constants
 * related to quiz question generation prompts.
 */

import { z } from 'zod';
import { env } from '../../../config/env.js';

// ============================================================
// SCHEMAS
// ============================================================

export const QuizQuestionSchema = z.object({
  question: z.string().describe('The complete question text'),
  options: z.array(z.string())
    .min(2)
    .max(5)
    .describe('List of options (usually 4, but 2 for True/False)'),
  answer: z.number()
    .int()
    .min(0)
    .max(4)
    .describe('Zero-based index of the correct option (0 = First Option). MUST match the index in the options array.'),
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

/**
 * Safely parse integer env vars with fallback.
 */
const safeParseInt = (val: string | undefined, fallback: number): number => {
  const parsed = parseInt(val || '', 10);
  return isNaN(parsed) ? fallback : parsed;
};

const QUIZ_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: safeParseInt(env.QUIZ_MAP_CHUNK_TOKENS, 5000),
  REDUCE_CHUNK_SIZE_TOKENS: safeParseInt(env.QUIZ_REDUCE_CHUNK_TOKENS, 10000),
  MIN_QUESTIONS_PER_CHUNK: safeParseInt(env.QUIZ_MIN_QUESTIONS_PER_CHUNK, 3),
  MAX_QUESTIONS_PER_CHUNK: safeParseInt(env.QUIZ_MAX_QUESTIONS_PER_CHUNK, 25),
  MIN_CHUNKS: safeParseInt(env.QUIZ_MIN_CHUNKS, 2),
  MAP_TIMEOUT_MS: safeParseInt(env.QUIZ_MAP_TIMEOUT_MS, 180000),
  REDUCE_TIMEOUT_MS: safeParseInt(env.QUIZ_REDUCE_TIMEOUT_MS, 240000),
  REDUCE_MAX_TOKENS: safeParseInt(env.QUIZ_REDUCE_MAX_TOKENS, 24000),
  MAX_COLLAPSE_DEPTH: 5,
} as const;

export const GRAPH_CONFIG = {
  ...QUIZ_CONFIG,
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

TARGET: Generate approximately ${questionsPerChunk} questions from this section (part of ${questionCount} total questions).

**Difficulty: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${focus ? `**Focus:** ${focus}` : ''}

REQUIREMENTS:
- Provide 4 options for standard questions (use 2 for True/False).
- Distractors must be plausible but clearly incorrect.
- Avoid obvious patterns like "All of the above".
- Hints must guide without revealing the answer.
- Questions MUST be self-contained (include all necessary context).

**ANSWER FORMAT CRITICAL:**
- The "answer" field MUST be a NUMBER representing the 0-based index of the correct option.
- Option indices: 0 = first option, 1 = second option, etc.
- Example: If the correct answer is the FIRST option, set answer: 0.
- DO NOT use letters (A, B, C, D) - use ONLY numbers (0, 1, 2, 3).

**SELF-CONTAINED QUESTIONS:**
If a question references diagrams, code, or scenarios:
- Include the relevant content IN the question.
- NEVER use vague references like "the diagram" or "the following" without context.
- Example: BAD → "In the diagram shown..."  GOOD → "In the ER diagram with Entities A(id) and B(id)..."

**HINT GUIDELINES:**
- Point to relevant concepts without giving the answer.
- Use phrases like "Consider...", "Recall that...", "Think about...".

**EXPLANATION GUIDELINES:**
- CRITICAL: Your explanation MUST be grounded in the provided source material.
- Reference specific concepts, facts, or quotes from the content above.
- Explain WHY the correct answer is right using evidence from the material.

Content to create questions from:
${chunk}`;
};

/**
 * Collapse prompt for deduplicating and filtering quiz questions during recursive collapse.
 * Uses a "Strict Editor" persona to merge concepts rather than just deleting them.
 */
export const getCollapsePrompt = (params: {
  questions: string;
  targetCount: number;
}): string => {
  const { questions, targetCount } = params;

  return `You are a strict editor refining a quiz database.
  
INPUT: A raw list of questions generated from text chunks.
TASK: Compress this list into a smaller, higher-quality set.

TARGET COUNT: ~${targetCount} questions.

STRATEGY:
1. MERGE DUPLICATES: If multiple questions test the same concept, combine them into ONE superior question with better distractors.
2. DISCARD TRIVIA: Remove questions that ask about minor dates or irrelevant details. Keep conceptual questions.
3. FIX DISTRACTORS: If a question has weak options (e.g., "All of the above"), rewrite them to be plausible.

**ANSWER FORMAT CRITICAL:**
- Keep the exact JSON structure.
- "answer" must be a number (0-based index).
- "options" should usually be 4 items (2 for True/False).

INPUT QUESTIONS:
${questions}

Return the optimized JSON array.`;
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Format quiz questions as text for LLM prompts.
 * Used in selection prompts to provide full question context.
 */
export function formatQuestionsAsText(questions: QuizQuestion[]): string {
  return questions
    .map((q, index) => {
      const optionsText = q.options.map((opt, i) => `  [${i}] ${opt}`).join('\n');
      return `${index + 1}. Question: ${q.question}
Options:
${optionsText}
Answer: [${q.answer}]
Hint: ${q.hint}
Explanation: ${q.explanation}`;
    })
    .join('\n\n---\n\n');
}

// ============================================================
// REDUCE PHASE PROMPTS
// ============================================================

/**
 * Selection prompt for refining and selecting quiz questions in the reduce phase.
 * Handles deduplication, quality selection, and topic diversity.
 */
export const getSelectionPrompt = (params: {
  questions: QuizQuestion[];
  targetCount: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { questions, targetCount, difficulty, focus } = params;

  // Use full question format for better deduplication and quality selection
  const questionsList = formatQuestionsAsText(questions);

  return `You are an expert educator selecting and refining quiz questions for an assessment.

CRITICAL REQUIREMENTS:
- ${questions.length < targetCount 
    ? `You have ${questions.length} questions available (target is ${targetCount}). Use ALL available questions after deduplication and quality checks.` 
    : `Select approximately ${targetCount} questions (flexible: ±${Math.ceil(targetCount * 0.2)} is acceptable)`}
- IDENTIFY AND MERGE similar or duplicate questions before selecting
- Quality over quantity: Better to have ${Math.ceil(targetCount * 0.8)} unique questions than ${targetCount} with duplicates
- Your goal is MAXIMUM SEMANTIC DIVERSITY - each question should test a distinct concept

**ANSWER FORMAT CRITICAL:**
- The "answer" field MUST be a NUMBER representing the 0-based index of the correct option
- Option indices: 0 = first option, 1 = second option, 2 = third option, 3 = fourth option
- Example: If the correct answer is the FIRST option, set answer: 0
- Example: If the correct answer is the SECOND option, set answer: 1
- DO NOT use letters (A, B, C, D) - use ONLY numbers (0, 1, 2, 3)

SIMILARITY DETECTION GUIDELINES:
Questions are considered similar if they:
- Ask about the same concept using different wording (e.g., "What is X?" vs "Define X")
- Test the same comparison/contrast (e.g., "Difference between A and B" vs "Compare A and B")
- Have the same core answer despite surface-level differences
- Cover overlapping content that could be combined

MERGING STRATEGY:
When you find similar questions:
- Combine the best elements from each version (best question text, options, explanations)
- Create a single, clearer question with proper distractors
- Ensure the merged question is self-contained
- Keep the most comprehensive explanation

TOPIC DIVERSITY:
Additionally, select questions from DIFFERENT topics. Do NOT select more than 3 questions from any single topic if possible.
If there are 6+ topics available, select 1-3 questions from each topic.
Example: If you need 20 questions and have 5 topics, select 4 from each topic

**EXPLANATION GUIDELINES:**
- CRITICAL: Your explanation MUST be grounded in the provided source material
- Reference specific concepts, facts, or quotes from the content above
- DO NOT hallucinate or rely on outside knowledge
- If the source doesn't support an explanation, create a different question
- Example format: "According to the text, [concept]..." or "The material states that..."

Return the FULL, COMPLETE question objects for your selections.

Difficulty: ${difficulty}
${focus ? `Focus: ${focus} (but maintain diversity)` : ''}

AVAILABLE QUESTIONS (${questions.length} total):
${questionsList}

Return the complete selected questions as a JSON array.`;
};