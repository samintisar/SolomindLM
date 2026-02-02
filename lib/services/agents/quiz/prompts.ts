"use node"
/**
 * Prompt templates and schemas for QuizGraph.
 * * OPTIMIZED VERSION:
 * - Map Phase: Focuses on "Concept Extraction" vs "Data Lookup"
 * - Expand Phase: Enforces "Scenario Generation" and "Visuals"
 */

import { z } from 'zod';
import { env } from '../../../helpers/env';

// ============================================================
// SCHEMAS
// ============================================================

// 1. Final Output Schema (The Polish)
export const QuizQuestionSchema = z.object({
  question: z.string().describe('The complete question text (scenario-based preferred)'),
  options: z.array(z.string())
    .min(2)
    .max(5)
    .describe('List of options (usually 4, but 2 for True/False)'),
  answer: z.number()
    .int()
    .min(0)
    .max(4)
    .describe('Zero-based index of the correct option (0 = First Option). MUST match the index in the options array.'),
  hint: z.string().describe('A helpful hint that guides logic without giving the answer'),
  explanation: z.string().describe('Concise explanation citing the context. Explain why the correct answer is right and why each distractor is wrong. Be precise and on-point.'),
});

// 2. Intermediate Candidate Schema (The Draft)
export const QuizCandidateSchema = z.object({
  topic: z.string().describe('Short topic identifier (e.g. "Seasonality", "Error Metrics")'),
  question: z.string().describe('The draft question text (focus on concepts, not specific data values)'),
  correctAnswer: z.string().describe('The verified correct answer'),
  // CHANGED: "contextSnippet" requires a larger chunk of text to support distractor generation
  contextSnippet: z.string().describe('A verbatim paragraph or 3-5 sentences from the text that fully explain this concept and mention related concepts (for generating distractors).'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

export const QuizCandidateArraySchema = z.object({
  questions: z.array(QuizCandidateSchema).describe('Array of quiz question candidates'),
});

export const QuizQuestionArraySchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('Array of quiz questions'),
});

// Types inferred from Zod
export type QuizCandidate = z.infer<typeof QuizCandidateSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export interface QuizCandidateResponse { questions: QuizCandidate[]; }
export interface QuizQuestionResponse { questions: QuizQuestion[]; }

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
  // OPTIMIZED: Smaller chunks (2500 tokens) to prevent timeouts
  MAP_CHUNK_SIZE_TOKENS: safeParseInt(env.QUIZ_MAP_CHUNK_TOKENS, 2500),
  REDUCE_CHUNK_SIZE_TOKENS: safeParseInt(env.QUIZ_REDUCE_CHUNK_TOKENS, 10000),
  MIN_QUESTIONS_PER_CHUNK: safeParseInt(env.QUIZ_MIN_QUESTIONS_PER_CHUNK, 2),
  MAX_QUESTIONS_PER_CHUNK: safeParseInt(env.QUIZ_MAX_QUESTIONS_PER_CHUNK, 20),
  MIN_CHUNKS: safeParseInt(env.QUIZ_MIN_CHUNKS, 2),
  MAP_MAX_TOKENS: safeParseInt(env.QUIZ_MAX_TOKENS, 8000),
  MAP_TIMEOUT_MS: safeParseInt(env.QUIZ_MAP_TIMEOUT_MS, 180000),
  REDUCE_TIMEOUT_MS: safeParseInt(env.QUIZ_REDUCE_TIMEOUT_MS, 240000),
  REDUCE_MAX_TOKENS: safeParseInt(env.QUIZ_REDUCE_MAX_TOKENS, 24000),
  EXPAND_MAX_TOKENS: safeParseInt(env.QUIZ_EXPAND_MAX_TOKENS, 4096),
  EXPAND_CONCURRENCY: safeParseInt(env.QUIZ_EXPAND_CONCURRENCY, 5),
  MAX_COLLAPSE_DEPTH: 5,
} as const;

export const GRAPH_CONFIG = {
  ...QUIZ_CONFIG,
} as const;

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase candidate generation */
export const MAP_CANDIDATES_SYSTEM_PROMPT = 'You are a professional educator drafting quiz question candidates.';

/** System prompt for reduce phase candidate selection */
export const REDUCE_SELECT_SYSTEM_PROMPT = 'You are a quiz curator selecting diverse, high-quality candidate questions for study sets.';

/** System prompt for expand phase distractor generation */
export const EXPAND_QUESTION_SYSTEM_PROMPT = `You are a professional educator creating rigorous multiple-choice questions.

**Math Notation:** Use $...$ for inline math and $$...$$ for display math.`;

// ============================================================
// MAP PROMPT (THE DRAFT)
// ============================================================

export const getCandidateMapPrompt = (params: {
  chunk: string;
  questionCount: number;
  questionsPerChunk: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { chunk, questionsPerChunk, difficulty, focus } = params;

  // Difficulty-specific guidance
  const difficultyGuidance: Record<string, string> = {
    easy: `**EASY MODE:**
- Focus: Basic recall, definitions, and direct facts
- Question style: Direct questions with clear, unambiguous answers
- Distractor strategy: Use obviously incorrect options (opposites, unrelated concepts)
- Example: "What is the primary function of X?" or "Which term means Y?"`,
    medium: `**MEDIUM MODE:**
- Focus: Concepts, relationships, and understanding
- Question style: Understanding-based questions requiring some thought
- Distractor strategy: Use plausible but incorrect options (common misconceptions)
- Example: "How does X affect Y?" or "Which relationship best describes..."`,
    hard: `**HARD MODE:**
- Focus: Application, analysis, synthesis, and complex scenarios
- Question style: Complex scenarios requiring multi-step reasoning
- Distractor strategy: Use subtle, nuanced options that require careful analysis
- Example: "In a scenario where X occurs, what is the most likely outcome when..."`,
  };

  return `You are an expert analyst extracting "Testable Concepts" from a document.

TARGET: Identify approximately ${questionsPerChunk} key concepts.

**Difficulty: ${difficulty.toUpperCase()}**

${difficultyGuidance[difficulty] || difficultyGuidance.medium}

${focus ? `**Focus:** ${focus}` : ''}

CRITICAL RULES (DO NOT IGNORE):
1. **NO DATA RETRIEVAL:** Do NOT create questions that ask for specific numbers, dates, or table values found in the text (e.g., "What was the RMSE in 2008?").
2. **NO ASCII TABLES:** If the text contains data tables, ignore the specific rows. Instead, extract the *principle* the table illustrates (e.g., "Why does Model A outperform Model B?").
3. **CONCEPTUAL FOCUS:** Extract the *logic*, *syntax*, or *relationship* behind the facts.

OUTPUT FORMAT:
For each concept, provide:
- **Topic:** Short category name.
- **Question:** A draft question testing the concept (hypothetical scenarios are best).
- **Context Snippet:** Extract a RICH text segment (3-5 sentences) that explains the concept AND mentions related concepts (this is crucial for generating wrong answers later).
- **Difficulty:** Must match target difficulty ("easy", "medium", or "hard").

Content to analyze:
${chunk}`;
};

// ============================================================
// EXPAND PROMPT (THE POLISH) - NEW!
// ============================================================

/**
 * Difficulty-specific settings for expand phase
 */
interface ExpandSettings {
  scenarioComplexity: string;
  distractorQuality: string;
  explanationLength: string;
  questionStyle: string;
}

const EXPAND_SETTINGS: Record<string, ExpandSettings> = {
  easy: {
    scenarioComplexity: 'Simple, direct scenarios. One clear step to the answer.',
    distractorQuality: 'Obviously incorrect distractors (opposites, clearly unrelated concepts).',
    explanationLength: '1-2 sentences total. State the correct answer and briefly mention one key reason why distractors are wrong.',
    questionStyle: 'Direct questions: "What is X?" or "Which term describes Y?"',
  },
  medium: {
    scenarioComplexity: 'Moderate scenarios. May require connecting 2-3 concepts.',
    distractorQuality: 'Plausible distractors (common misconceptions, related but wrong concepts).',
    explanationLength: '1-2 sentences total. Focus on the key distinction between correct and incorrect options.',
    questionStyle: 'Understanding-based: "How does X affect Y?" or "Which relationship describes..."',
  },
  hard: {
    scenarioComplexity: 'Complex scenarios requiring analysis. May involve multi-step reasoning or synthesis.',
    distractorQuality: 'Subtle distractors (nuanced differences, partially correct but incomplete answers).',
    explanationLength: '1-2 sentences total. Cut to the core conceptual distinction - be precise.',
    questionStyle: 'Application-based: "In scenario X, what is the most likely outcome?" or complex analysis.',
  },
};

export const getExpandPrompt = (candidate: QuizCandidate): string => {
  const settings = EXPAND_SETTINGS[candidate.difficulty] || EXPAND_SETTINGS.medium;

  return `You are a Professor creating a high-quality exam question.

CONTEXT:
"${candidate.contextSnippet}"

TASK: Refine this draft into a ${candidate.difficulty.toUpperCase()}, scenario-based multiple-choice question.

**DIFFICULTY: ${candidate.difficulty.toUpperCase()}**

**Scenario Complexity:** ${settings.scenarioComplexity}
**Distractor Quality:** ${settings.distractorQuality}
**Explanation Length:** ${settings.explanationLength}
**Question Style:** ${settings.questionStyle}

Draft Question: "${candidate.question}"
Correct Answer: "${candidate.correctAnswer}"

INSTRUCTIONS:
1. **SCENARIO-BASED:** ${settings.questionStyle} Create a hypothetical scenario that fits the ${candidate.difficulty} difficulty level.
2. **DISTRACTORS:** Use the CONTEXT to find ${candidate.difficulty === 'easy' ? 'obviously incorrect' : candidate.difficulty === 'medium' ? 'plausible but wrong' : 'subtle and nuanced'} options. ${settings.distractorQuality}
3. **VISUALS:** If the concept is visual (e.g., anatomy, charts, graphs, code structures), insert a tag like
[Image of linear regression plot]
 or
[Image of mitosis stages]
 in the explanation. Only do this if it aids understanding.
4. **EXPLANATION:** ${settings.explanationLength} Explain *why* the answer is correct and *why* the distractors are wrong, citing the context. BE CONCISE - 1-2 sentences maximum.

Output full JSON.`;
};

// ============================================================
// SELECTION PROMPT (REDUCE PHASE)
// ============================================================

export const getCandidateSelectionPrompt = (params: {
  candidates: QuizCandidate[];
  targetCount: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { candidates, targetCount, difficulty, focus } = params;
  const candidatesList = formatCandidatesAsText(candidates);

  return `You are a strict Quiz Curator.

TASK: Select exactly ${targetCount} unique, high-quality candidates from the list below.

FILTERS (DISCARD THESE IMMEDIATELY):
- Questions that ask for specific data values (e.g., "What is the value of X in row 5?").
- Questions that rely on "the table below" or "the following list" if that context is missing.
- Duplicate concepts (keep only the strongest version).

DIFFICULTY FILTERING (CRITICAL):
- Target Difficulty: ${difficulty.toUpperCase()}
- PRIORITIZE candidates where difficulty matches "${difficulty}" - aim for at least 70% of your selections to match the target difficulty
- If insufficient candidates match the target difficulty, you may select from adjacent difficulty levels (easy↔medium↔hard)
- DO NOT select candidates whose difficulty is completely inappropriate (e.g., selecting "easy" candidates when "hard" is requested)

DIVERSITY:
- Select questions across different topics.
- Do not pick more than 3 questions for the same narrow concept.

${focus ? `Focus: ${focus}` : ''}

CANDIDATES POOL:
${candidatesList}

Return the selected candidates as a JSON array.`;
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function formatCandidatesAsText(candidates: QuizCandidate[]): string {
  return candidates
    .map((c, index) => {
      return `ID ${index + 1}
Topic: ${c.topic}
Question: ${c.question}
Correct Answer: ${c.correctAnswer}
Context Snippet: ${c.contextSnippet}
Difficulty: ${c.difficulty}`;
    })
    .join('\n\n---\n\n');
}