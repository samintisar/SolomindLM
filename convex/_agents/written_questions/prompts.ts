"use node";
/**
 * Prompt templates and schemas for WrittenQuestionsGraph.
 *
 * Contains all prompt templates, Zod schemas, and constants
 * related to written question generation prompts.
 */

import { z } from "zod";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

// ============================================================
// SCHEMAS
// ============================================================

export const WrittenQuestionSchema = z.object({
  id: z.string().describe("Unique identifier for the question"),
  question: z.string().describe("The formulated question text"),
  questionType: z.enum(["short", "essay"]),
  rubric: z.object({
    maxPoints: z.number(),
    criteria: z
      .array(z.string())
      .describe("Specific grading criteria or keywords required for full points"),
  }),
  modelAnswer: z
    .string()
    .describe("A comprehensive, correct answer derived exclusively from the text"),
});

export const WrittenQuestionsArraySchema = z.object({
  questions: z.array(WrittenQuestionSchema),
});

export interface WrittenQuestion {
  id: string;
  question: string;
  questionType: "short" | "essay";
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
  "the diagram",
  "the above",
  "as shown",
  "this chart",
  "that example",
  "the table",
  "this figure",
] as const;

export { GRAPH_CONFIG } from "./config.js";

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase written question generation */
export const MAP_SYSTEM_PROMPT =
  "You are a professional educator creating written assessment questions.";

/** System prompt for reduce phase question selection and refinement */
export const REDUCE_SELECT_SYSTEM_PROMPT =
  "You are an expert educator selecting diverse, high-quality written questions for assessments.";

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
    easy: "basic recall and definitions - straightforward facts",
    medium: "concepts and relationships - requires understanding",
    hard: "application and analysis - requires deeper thinking",
  };

  const isEssay = questionType === "essay";

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

${MARKDOWN_MATH_NOTATION_FOR_APP}

Generate exactly ${questionsPerChunk} questions based **exclusively** on the text provided below.

**Configuration:**
- Difficulty: ${difficulty.toUpperCase()} (${difficultyGuidance[difficulty] || difficulty})
- Type: ${questionType.toUpperCase()}
${focus ? `- Focus Topic: ${focus}` : ""}

${typeSpecificInstructions}

**CRITICAL GENERATION RULES:**
1. **Model Answer:** You MUST generate a comprehensive model answer for every question. The answer must be found directly in the text.
2. **Rubric:** Create specific grading criteria based on the model answer.
3. **Self-Contained:** Questions must make sense in isolation. NEVER use phrases like "according to the text," "as shown above," or "in this chapter." If the text refers to a specific scenario, you must describe that scenario in the question itself.
4. **Distribution:** Scan the **ENTIRE** provided text below. Do not cluster questions at the beginning. Ensure questions represent the full range of the content provided.

**Input Text:**
${chunk}`;
};

/** Follow-up when the model returned zero questions */
export const getMapRecoveryPrompt = (params: {
  chunk: string;
  questionCount: number;
  need: number;
  difficulty: string;
  questionType: string;
  focus?: string;
}): string => {
  const { chunk, need, difficulty, questionType, focus } = params;
  const isEssay = questionType === "essay";
  const points = isEssay ? 12 : 5;

  return `The previous attempt incorrectly returned zero written questions. You must fix this.

Generate exactly ${need} distinct ${questionType.toUpperCase()} questions (difficulty: ${difficulty.toUpperCase()}${focus ? `, focus: ${focus}` : ""}). The "questions" array MUST contain ${need} objects, each with questionType "${questionType}", rubric.maxPoints ${points}, a modelAnswer, and rubric.criteria.

**HOW TO FIND MATERIAL:**
• Definitions, theorems, assumptions, notation, and key terms in the excerpt.
• Procedures, comparisons, cause-and-effect, and examples described in the text.
• Slides or sparse pages: ask about any equation, bullet, or caption present.

${MARKDOWN_MATH_NOTATION_FOR_APP}

**Input Text:**
${chunk}`;
};

/** Additional questions when the first pass returned too few */
export const getMapTopUpPrompt = (params: {
  chunk: string;
  questionCount: number;
  need: number;
  difficulty: string;
  questionType: string;
  focus?: string;
  existingQuestions: WrittenQuestion[];
}): string => {
  const { chunk, need, difficulty, questionType, focus, existingQuestions } = params;
  const avoidList = existingQuestions
    .map((q, i) => `${i + 1}. ${q.question.replace(/\s+/g, " ").trim().slice(0, 160)}`)
    .join("\n");

  return `You already drafted ${existingQuestions.length} written questions from this excerpt. Produce exactly ${need} **additional** distinct questions (type: ${questionType.toUpperCase()}, difficulty: ${difficulty.toUpperCase()}${focus ? `, focus: ${focus}` : ""}).

**DO NOT** repeat or lightly rephrase these (cover different subtopics, concepts, or procedures):
${avoidList}

Return ONLY the ${need} new items in "questions" (same JSON shape as before).

${MARKDOWN_MATH_NOTATION_FOR_APP}

**Input Text (same excerpt):**
${chunk}`;
};
