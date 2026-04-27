"use node";
/**
 * Prompt templates and schemas for QuizGraph.
 * * OPTIMIZED VERSION:
 * - Map Phase: Focuses on "Concept Extraction" vs "Data Lookup"
 * - Expand Phase: Enforces "Scenario Generation" and "Visuals"
 */

import { z } from "zod";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

export { GRAPH_CONFIG } from "./config.js";

// ============================================================
// SCHEMAS
// ============================================================

// 1. Final Output Schema (The Polish)
export const QuizQuestionSchema = z.object({
  question: z.string().describe("The complete question text (scenario-based preferred)"),
  options: z
    .array(z.string())
    .length(4)
    .describe(
      "Exactly four answer choices. Option text only — no A./B. or A)/1) prefixes; the app renders choices without letter labels."
    ),
  answer: z
    .number()
    .int()
    .min(0)
    .max(3)
    .describe("Zero-based index of the correct option (0–3). Must match the options array after normalization."),
  hint: z.string().describe("A helpful hint that guides logic without giving the answer"),
  explanation: z
    .string()
    .describe(
      "Concise explanation citing the context. Explain why the correct answer is right and why each distractor is wrong. Be precise and on-point."
    ),
});

// 2. Intermediate Candidate Schema (The Draft)
export const QuizCandidateSchema = z.object({
  topic: z.string().describe('Short topic identifier (e.g. "Seasonality", "Error Metrics")'),
  question: z
    .string()
    .describe("The draft question text (focus on concepts, not specific data values)"),
  correctAnswer: z.string().describe("The verified correct answer"),
  // CHANGED: "contextSnippet" requires a larger chunk of text to support distractor generation
  contextSnippet: z
    .string()
    .describe(
      "A verbatim paragraph or 3-5 sentences from the text that fully explain this concept and mention related concepts (for generating distractors)."
    ),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export const QuizCandidateArraySchema = z.object({
  questions: z.array(QuizCandidateSchema).describe("Array of quiz question candidates"),
});

export const QuizQuestionArraySchema = z.object({
  questions: z.array(QuizQuestionSchema).describe("Array of quiz questions"),
});

// Types inferred from Zod
export type QuizCandidate = z.infer<typeof QuizCandidateSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export interface QuizCandidateResponse {
  questions: QuizCandidate[];
}
export interface QuizQuestionResponse {
  questions: QuizQuestion[];
}

/** Reduce phase: model returns 1-based indices into the candidate list (avoids echoing full objects / position bias). */
export const QuizCandidateIndexSelectionSchema = z.object({
  selectedIndices: z
    .array(z.number().int())
    .describe("1-based indices matching the ID labels in the selection prompt (e.g. ID 3 → 3)."),
});

export type QuizCandidateIndexSelection = z.infer<typeof QuizCandidateIndexSelectionSchema>;

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase candidate generation */
export const MAP_CANDIDATES_SYSTEM_PROMPT =
  "You are a professional educator drafting quiz question candidates. You MUST return the requested number of items in the questions array whenever the passage contains any technical, statistical, or instructional content. Empty arrays are not acceptable for non-trivial excerpts—you must derive conceptual questions from definitions, code output, notation, procedures, comparisons, and assumptions stated or implied in the text.";

/** System prompt for reduce phase candidate selection */
export const REDUCE_SELECT_SYSTEM_PROMPT =
  "You are a quiz curator selecting diverse, high-quality candidate questions for study sets. You choose by the numeric candidate ID (1-based index) from the list—do not favor early IDs unless they are genuinely strongest. Return only the selectedIndices array.";

/** System prompt for expand phase distractor generation */
export const EXPAND_QUESTION_SYSTEM_PROMPT = `You are a professional educator creating rigorous multiple-choice questions.

**OPTIONS FORMAT (REQUIRED):**
- Output exactly four options in the options array. Not two, not five—four.
- Each option string must be the choice text only. Do not prefix with letters (A. B. C. D. or A) B) …) or numbers (1. 2. …) — the app shows choices in order without those labels.
- Inline code and math in options are fine; use backticks and $…$ as needed.

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

  return `Extract exactly ${questionsPerChunk} testable concepts from this document (difficulty: ${difficulty.toUpperCase()}${focus ? `, focus: ${focus}` : ""}).

**CRITICAL — OUTPUT COUNT:**
• The JSON field "questions" MUST be an array of exactly ${questionsPerChunk} objects (not fewer, not zero).
• If the excerpt has code, R output, LaTeX, slide titles, or figure captions, ask what they *mean* (interpretation, assumptions, when to use, notation, model order, comparison of methods)—do not skip the section as "non-quizzable."
• Placeholder text like "Examples forthcoming" still has surrounding context: quiz that context.

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

/** Follow-up when the model returned zero candidates — stronger obligation to produce items */
export const getCandidateMapRecoveryPrompt = (params: {
  chunk: string;
  questionCount: number;
  need: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { chunk, need, difficulty, focus } = params;
  return `The previous attempt incorrectly returned zero quiz candidates. You must fix this.

Generate exactly ${need} distinct candidates (difficulty: ${difficulty.toUpperCase()}${focus ? `, focus: ${focus}` : ""}). The "questions" array MUST contain ${need} objects.

**HOW TO FIND MATERIAL:**
• Definitions, theorems, assumptions, notation (e.g. ARMA, ACF, conditional expectation, ML vs OLS).
• Code or software output: ask about interpretation (coefficients, orders, residuals, forecasts), not row numbers.
• Slides or sparse pages: quiz the narrative around any equation, bullet, or caption present.

**OUTPUT:** Same JSON shape as before (topic, question, correctAnswer, contextSnippet, difficulty).

${MARKDOWN_MATH_NOTATION_FOR_APP}

**CONTENT:**
${chunk}`;
};

/** Additional candidates when the first pass returned too few */
export const getCandidateMapTopUpPrompt = (params: {
  chunk: string;
  questionCount: number;
  need: number;
  difficulty: string;
  focus?: string;
  existingCandidates: QuizCandidate[];
}): string => {
  const { chunk, need, difficulty, focus, existingCandidates } = params;
  const avoidList = existingCandidates
    .map((c, i) => `${i + 1}. [${c.topic}] ${c.question.replace(/\s+/g, " ").trim().slice(0, 160)}`)
    .join("\n");

  return `You already drafted ${existingCandidates.length} quiz candidates from this excerpt. Produce exactly ${need} **additional** distinct candidates (difficulty: ${difficulty.toUpperCase()}${focus ? `, focus: ${focus}` : ""}).

**DO NOT** repeat or lightly rephrase these (cover different subtopics, formulas, or procedures):
${avoidList}

**OUTPUT:** Return ONLY the ${need} new items in "questions" (same JSON shape: topic, question, correctAnswer, contextSnippet, difficulty).

${MARKDOWN_MATH_NOTATION_FOR_APP}

**CONTENT (same excerpt):**
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
    scenarioComplexity: "Simple, direct scenarios. One clear step to the answer.",
    distractorQuality: "Obviously incorrect distractors (opposites, clearly unrelated concepts).",
    explanationLength:
      "1-2 sentences total. State the correct answer and briefly mention one key reason why distractors are wrong.",
    questionStyle: 'Direct questions: "What is X?" or "Which term describes Y?"',
  },
  medium: {
    scenarioComplexity: "Moderate scenarios. May require connecting 2-3 concepts.",
    distractorQuality: "Plausible distractors (common misconceptions, related but wrong concepts).",
    explanationLength:
      "1-2 sentences total. Focus on the key distinction between correct and incorrect options.",
    questionStyle:
      'Understanding-based: "How does X affect Y?" or "Which relationship describes..."',
  },
  hard: {
    scenarioComplexity:
      "Complex scenarios requiring analysis. May involve multi-step reasoning or synthesis.",
    distractorQuality:
      "Subtle distractors (nuanced differences, partially correct but incomplete answers).",
    explanationLength: "1-2 sentences total. Cut to the core conceptual distinction - be precise.",
    questionStyle:
      'Application-based: "In scenario X, what is the most likely outcome?" or complex analysis.',
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
2. **DISTRACTORS:** Use the CONTEXT to find ${candidate.difficulty === "easy" ? "obviously incorrect" : candidate.difficulty === "medium" ? "plausible but wrong" : "subtle and nuanced"} options. ${settings.distractorQuality}
3. **EXACTLY FOUR OPTIONS:** The options array must have length 4. Each option is plain text (or code in backticks) with no A./B./C./D. or 1) 2) prefixes.
4. **VISUALS:** If the concept is visual (e.g., anatomy, charts, graphs, code structures), insert a tag like
[Image of linear regression plot]
 or
[Image of mitosis stages]
 in the explanation. Only do this if it aids understanding.
5. **EXPLANATION:** ${settings.explanationLength} Explain *why* the answer is correct and *why* the distractors are wrong, citing the context. BE CONCISE - 1-2 sentences maximum.

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
• Can use adjacent levels if needed (${difficulty} ↔ ${difficulty === "easy" ? "medium" : difficulty === "hard" ? "medium" : "easy/hard"})

**DIVERSITY:**
• Spread across different topics
• Max 3 questions per narrow concept

${focus ? `**FOCUS:** ${focus}\n` : ""}**CANDIDATES:**
${candidatesList}

**OUTPUT (STRICT):**
Return a JSON object with a single property "selectedIndices": an array of exactly ${targetCount} distinct integers.
Each integer must be a candidate ID from above (1 through ${candidates.length}). Pick the best set for conceptual depth, diversity across topics, and match to difficulty—not the first IDs in the list unless those are truly the strongest.
If you cannot find ${targetCount} that meet minimum quality, still return ${targetCount} IDs using the best available (prefer conceptual questions over trivial lookups).`;
};

/**
 * Map 1-based indices from the selection LLM onto the original candidate array, with backfill if indices are invalid or duplicate.
 */
export function applySelectedCandidateIndices(
  candidates: QuizCandidate[],
  selectedIndices: number[],
  targetCount: number
): QuizCandidate[] {
  const n = candidates.length;
  if (n === 0 || targetCount <= 0) return [];

  const resolved: QuizCandidate[] = [];
  const seenIdx = new Set<number>();

  for (const raw of selectedIndices) {
    if (resolved.length >= targetCount) break;
    const oneBased = Math.round(raw);
    if (!Number.isFinite(oneBased) || oneBased < 1 || oneBased > n) continue;
    const idx = oneBased - 1;
    if (seenIdx.has(idx)) continue;
    seenIdx.add(idx);
    resolved.push(candidates[idx]);
  }

  for (let i = 0; i < n && resolved.length < targetCount; i++) {
    if (seenIdx.has(i)) continue;
    seenIdx.add(i);
    resolved.push(candidates[i]);
  }

  return resolved.slice(0, targetCount);
}

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
    .join("\n\n---\n\n");
}
