"use node"
/**
 * Prompt templates and schemas for WrittenQuestionsGraph.
 *
 * Contains all prompt templates, Zod schemas, and constants
 * related to written question generation prompts.
 */

import { z } from 'zod';
import { env } from '../../../helpers/env';

// ============================================================
// SCHEMAS
// ============================================================

export const WrittenQuestionSchema = z.object({
  id: z.string().describe("Unique identifier for the question"),
  question: z.string().describe("The formulated question text"),
  questionType: z.enum(['short', 'essay']),
  rubric: z.object({
    maxPoints: z.number(),
    criteria: z.array(z.string()).describe("Specific grading criteria or keywords required for full points"),
  }),
  modelAnswer: z.string().describe("A comprehensive, correct answer derived exclusively from the text"),
});

export const WrittenQuestionsArraySchema = z.object({
  questions: z.array(WrittenQuestionSchema),
});

export interface WrittenQuestion {
  id: string;
  question: string;
  questionType: 'short' | 'essay';
  rubric: {
    maxPoints: number;
    criteria: string[];
  };
  modelAnswer: string | null; // Kept nullable in interface for UI safety, though Schema enforces string
}

export interface WrittenQuestionsResponse {
  questions: WrittenQuestion[];
}

// ============================================================
// CONSTANTS
// ============================================================

// Problematic phrases that indicate questions aren't self-contained
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
// CONFIGURATION
// ============================================================

const WRITTEN_QUESTIONS_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.WRITTEN_QUESTIONS_MAP_CHUNK_TOKENS || '20000', 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.WRITTEN_QUESTIONS_REDUCE_CHUNK_TOKENS || '40000', 10),
  MIN_QUESTIONS_PER_CHUNK: parseInt(env.WRITTEN_QUESTIONS_MIN_QUESTIONS_PER_CHUNK || '2', 10),
  MAX_QUESTIONS_PER_CHUNK: parseInt(env.WRITTEN_QUESTIONS_MAX_QUESTIONS_PER_CHUNK || '30', 10),
  MIN_CHUNKS: parseInt(env.WRITTEN_QUESTIONS_MIN_CHUNKS || '2', 10),
  MAP_TIMEOUT_MS: parseInt(env.WRITTEN_QUESTIONS_MAP_TIMEOUT_MS || '180000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.WRITTEN_QUESTIONS_REDUCE_TIMEOUT_MS || '240000', 10),
  REDUCE_MAX_TOKENS: parseInt(env.WRITTEN_QUESTIONS_REDUCE_MAX_TOKENS || '32000', 10),
  MAX_COLLAPSE_DEPTH: parseInt(env.WRITTEN_QUESTIONS_MAX_COLLAPSE_DEPTH || '3', 10),
  DYNAMIC_BUFFER_MULTIPLIER: parseFloat(env.WRITTEN_QUESTIONS_DYNAMIC_BUFFER_MULTIPLIER || '1.5'),
  CHUNK_COVERAGE_THRESHOLD: parseFloat(env.WRITTEN_QUESTIONS_CHUNK_COVERAGE_THRESHOLD || '0.7'),
} as const;

export const GRAPH_CONFIG = {
  ...WRITTEN_QUESTIONS_CONFIG,
} as const;

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase written question generation */
export const MAP_SYSTEM_PROMPT = 'You are a professional educator creating written assessment questions.';

/** System prompt for reduce phase question selection and refinement */
export const REDUCE_SELECT_SYSTEM_PROMPT = 'You are an expert educator selecting diverse, high-quality written questions for assessments.';

// ============================================================
// PROMPT TEMPLATES
// ============================================================

/**
 * Map prompt for generating questions from chunks
 */
export const getMapPrompt = (params: {
  chunk: string;
  questionCount: number;
  questionsPerChunk: number;
  difficulty: string;
  questionType: string;
  focus?: string;
}): string => {
  const { chunk, questionsPerChunk, difficulty, questionType, focus } = params;

  const difficultyGuidance: Record<string, string> = {
    easy: 'basic recall and definitions - straightforward facts',
    medium: 'concepts and relationships - requires understanding',
    hard: 'application and analysis - requires deeper thinking',
  };

  const isEssay = questionType === 'essay';

  const typeSpecificInstructions = isEssay
    ? `**ESSAY QUESTIONS (12 Points):**
- Requires multi-paragraph synthesis
- Tests deep understanding and critical analysis
- RUBRIC: Generate 3-4 distinct evaluation criteria (e.g., Argument Strength, Evidence Use, Clarity)`
    : `**SHORT-ANSWER QUESTIONS (5 Points):**
- Direct, factual questions (1-3 sentences)
- Tests specific knowledge or definitions
- RUBRIC: Generate 2-3 specific keywords or facts required for full points`;

  return `You are an expert educator creating a HIGH-QUALITY assessment.

Generate exactly ${questionsPerChunk} questions based **exclusively** on the text provided below.

**Configuration:**
- Difficulty: ${difficulty.toUpperCase()} (${difficultyGuidance[difficulty] || difficulty})
- Type: ${questionType.toUpperCase()}
${focus ? `- Focus Topic: ${focus}` : ''}

${typeSpecificInstructions}

**CRITICAL GENERATION RULES:**
1. **Model Answer:** You MUST generate a comprehensive model answer for every question. The answer must be found directly in the text.
2. **Rubric:** Create specific grading criteria based on the model answer.
3. **Self-Contained:** Questions must make sense in isolation. NEVER use phrases like "according to the text," "as shown above," or "in this chapter." If the text refers to a specific scenario, you must describe that scenario in the question itself.
4. **Distribution:** Scan the **ENTIRE** provided text below. Do not cluster questions at the beginning. Ensure questions represent the full range of the content provided.

**Input Text:**
${chunk}`;
};
