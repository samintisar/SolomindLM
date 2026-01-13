/**
 * Prompt templates and schemas for WrittenQuestionsGraph.
 *
 * Contains all prompt templates, Zod schemas, and constants
 * related to written question generation prompts.
 */

import { z } from 'zod';

// ============================================================
// SCHEMAS
// ============================================================

export const WrittenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  questionType: z.enum(['short', 'essay']),
  rubric: z.object({
    maxPoints: z.number(),
    criteria: z.array(z.string()),
  }),
  modelAnswer: z.string().nullable(),
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
  modelAnswer: string | null;
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

export const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 20000, // ~80K chars ≈ 20K tokens
  REDUCE_CHUNK_SIZE_TOKENS: 40000, // ~160K chars ≈ 40K tokens
  MIN_QUESTIONS_PER_CHUNK: 2,
  MIN_CHUNKS: 2,
  MAP_TIMEOUT_MS: 180000,
  REDUCE_TIMEOUT_MS: 240000,
  MAX_COLLAPSE_DEPTH: 3,
  DYNAMIC_BUFFER_MULTIPLIER: 1.5,
  MAX_QUESTIONS_PER_CHUNK: 30,
  CHUNK_COVERAGE_THRESHOLD: 0.7,
} as const;

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

  const questionTypeSection = `**Question Type: ${questionType.toUpperCase()}**
**Point Value: ${questionType === 'short' ? '5' : '12'}**

${questionType === 'short'
  ? `**SHORT-ANSWER QUESTIONS:**
- A SINGLE, DIRECT QUESTION (not a list of tasks)
- Answerable in 1-3 sentences
- Worth EXACTLY 5 points`
  : `**ESSAY QUESTIONS:**
- Answerable in multiple paragraphs
- Worth 12 points
- Tests analysis, synthesis, and critical thinking`
}`;

  return `You are an expert educator creating HIGH-QUALITY written questions for assessment.

Generate exactly ${questionsPerChunk} questions from this section.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${questionTypeSection}
${focus ? `**Topic Focus:** ${focus}` : ''}

CRITICAL REQUIREMENTS:
- You MUST generate exactly ${questionsPerChunk} questions
- ALL questions MUST be based EXCLUSIVELY on the provided content
- DO NOT use outside knowledge or generate questions about unrelated topics
- Questions MUST BE COMPLETELY SELF-CONTAINED
- Include all necessary context within the question itself

**SELF-CONTAINED QUESTIONS:**
Each question MUST include all necessary context. If referencing a formula, diagram, code snippet, or scenario, include or describe it thoroughly within the question.

Content to base questions on (READ THIS CAREFULLY - ONLY create questions about this content):
${chunk}`;
};
