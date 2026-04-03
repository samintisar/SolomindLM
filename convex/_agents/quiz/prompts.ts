"use node"
/**
 * Prompt templates and schemas for QuizGraph.
 * * OPTIMIZED VERSION:
 * - Map Phase: Focuses on "Concept Extraction" vs "Data Lookup"
 * - Expand Phase: Enforces "Scenario Generation" and "Visuals"
 */

import { z } from 'zod';
import { MARKDOWN_MATH_NOTATION_FOR_APP } from '../_shared/markdownMathPrompt.js';

export { GRAPH_CONFIG } from './config.js';

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
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase candidate generation */
export const MAP_CANDIDATES_SYSTEM_PROMPT = 'You are a professional educator drafting quiz question candidates.';

/** System prompt for reduce phase candidate selection */
export const REDUCE_SELECT_SYSTEM_PROMPT = 'You are a quiz curator selecting diverse, high-quality candidate questions for study sets.';

/** System prompt for expand phase distractor generation */
export const EXPAND_QUESTION_SYSTEM_PROMPT = `You are a professional educator creating rigorous multiple-choice questions.

${MARKDOWN_MATH_NOTATION_FOR_APP}`;

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

  // Difficulty-specific examples to guide LLM behavior
  const examples: Record<string, string> = {
    easy: `• "What is the primary function of X?" 
• "Which term refers to Y?"`,
    medium: `• "How does X affect Y?"
• "When should you use approach A vs approach B?"`,
    hard: `• "In a scenario where X occurs, what is the most likely outcome when Y?"
• "Why does method A outperform method B in this context?"`,
  };

  return `Extract ${questionsPerChunk} testable concepts from this document (difficulty: ${difficulty.toUpperCase()}${focus ? `, focus: ${focus}` : ''}).

**QUESTION TYPES (in priority order):**
1. **Conceptual:** Why something works, principles, relationships
2. **Comparative:** Compare methods/approaches (e.g., "A vs B?")
3. **Process:** How something works, steps, cause-and-effect
4. **Application:** Given a scenario, what works best?

**GOOD EXAMPLES (${difficulty.toUpperCase()}):**
${examples[difficulty] || examples.medium}

**AVOID:**
•❌ Specific fact lookup: "What was the RMSE in 2008?"
•❌ Single data points without context
•✅ INSTEAD ask about: patterns, trends, comparisons

**TABLES:** Extract concepts, ignore specific rows. Example: "Why does Model A outperform Model B?" ✓

**OUTPUT FORMAT (JSON array):**
For each concept:
{
  "topic": "Short category",
  "question": "Draft question (use hypothetical scenarios)",
  "correctAnswer": "Verified answer",
  "contextSnippet": "3-5 sentences explaining concept + related concepts (crucial for generating distractors later)",
  "difficulty": "${difficulty}"
}

${MARKDOWN_MATH_NOTATION_FOR_APP}

**CONTENT:**
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

  return `Select ${targetCount} high-quality candidates from ${candidates.length} options.

**QUALITY THRESHOLD:**
•✅ Good: Conceptual questions, comparisons, process questions
•❌ Bad: Fact lookup ("What value is in row 5?"), missing context references
•❌ Duplicates: Keep strongest version of similar concepts

**DIFFICULTY BALANCE:**
• Target: ${difficulty.toUpperCase()} (aim for 70%+)
• Can use adjacent levels if needed (${difficulty} ↔ ${difficulty === 'easy' ? 'medium' : difficulty === 'hard' ? 'medium' : 'easy/hard'})

**DIVERSITY:**
• Spread across different topics
• Max 3 questions per narrow concept

${focus ? `**FOCUS:** ${focus}\n` : ''}**CANDIDATES:**
${candidatesList}

**OUTPUT:** Return selected ${targetCount} candidates as JSON array.
If fewer than ${targetCount} meet quality standards, return all good candidates (minimum 1).`;
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