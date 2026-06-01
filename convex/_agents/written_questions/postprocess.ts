"use node";

import { randomUUID } from "crypto";

import { clearStateKeys, withoutMapOutputs } from "../_shared/index.js";
import type { JobLogger } from "../_shared/logging.js";
import type { WrittenQuestion } from "./prompts.js";
import { extractTopic } from "./questionHeuristics.js";
import type { OverallStateType } from "./state.js";

export function getSelectionPrompt(params: {
  questions: WrittenQuestion[];
  targetCount: number;
  difficulty: string;
  questionType: string;
  focus?: string;
}): string {
  const { questions, targetCount, difficulty, questionType, focus } = params;

  const topicGroups: Record<string, WrittenQuestion[]> = {};
  for (const q of questions) {
    const topic = extractTopic(q);
    if (!topicGroups[topic]) topicGroups[topic] = [];
    topicGroups[topic].push(q);
  }

  const questionsText = Object.entries(topicGroups)
    .map(([topic, qs]) => {
      const qList = qs
        .map(
          (q, i) =>
            `  [${i + 1}] ${q.question}\n      Type: ${q.questionType} | Points: ${q.rubric.maxPoints}`
        )
        .join("\n");
      return `**${topic.toUpperCase()}** (${qs.length} questions):\n${qList}`;
    })
    .join("\n\n");

  const questionTypeGuidance =
    questionType === "short"
      ? `**SHORT-ANSWER QUESTIONS:**
Must be single, direct questions answerable in 1-3 sentences.
Select questions that are complete and self-contained.`
      : `**ESSAY QUESTIONS:**
Must be substantive questions requiring multi-paragraph answers.
Select questions that test analysis and synthesis.`;

  const pointsInstruction = questionType === "short" ? "5 points" : "12 points";

  return `You are an expert educator picking written questions for an assessment.

YOUR TASK: From the candidate pool below, return EXACTLY ${targetCount} questions
chosen as-is (no rewriting, no merging). The count is non-negotiable — if the pool
has fewer than ${targetCount} acceptable items, fill with the strongest remaining
candidates so the output still has ${targetCount} entries.

PICKING ORDER (apply in this order, in one pass):
1. Group the pool by which named source-item each question covers (use the
   topic groups below as a hint, plus your own read of the question text).
2. Pick the strongest one question per named item until every named item has
   one (this is the coverage floor — never drop a named item to avoid a
   surface-level duplicate).
3. Keep filling until you reach ${targetCount}: prefer the strongest second
   question for the most central named items, then anything left in the pool.
4. When two candidates are about the SAME named item and ask the same thing,
   keep the one with the clearer wording / more complete rubric.

${questionTypeGuidance}

IMPORTANT: Output questions of type "${questionType}".
POINT VALUES: ${pointsInstruction}

AVAILABLE QUESTIONS (GROUPED BY TOPIC):
${questionsText}

${focus ? `Focus Area: ${focus}` : ""}
Difficulty: ${difficulty}
Question Type: ${questionType}

Return the complete selected questions as a JSON array.`;
}

export function dedupeQuestions(questions: WrittenQuestion[]): WrittenQuestion[] {
  const normalizeQuestionText = (question: string): string => {
    return question
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "")
      .trim();
  };

  const dedupedQuestions: WrittenQuestion[] = [];
  const seenQuestions = new Set<string>();

  for (const question of questions) {
    const normalizedQuestion = normalizeQuestionText(question.question);
    if (seenQuestions.has(normalizedQuestion)) {
      continue;
    }

    seenQuestions.add(normalizedQuestion);
    dedupedQuestions.push(question);
  }

  return dedupedQuestions;
}

export function getSelectionIdsPrompt(params: {
  questions: WrittenQuestion[];
  targetCount: number;
  difficulty: string;
  questionType: string;
  focus?: string;
}): string {
  const { questions, targetCount, difficulty, questionType, focus } = params;

  const topicGroups: Record<string, WrittenQuestion[]> = {};
  for (const q of questions) {
    const topic = extractTopic(q);
    if (!topicGroups[topic]) topicGroups[topic] = [];
    topicGroups[topic].push(q);
  }

  const questionsText = Object.entries(topicGroups)
    .map(([topic, qs]) => {
      const qList = qs
        .map(
          (q) =>
            `  [ID=${q.id}] ${q.question}\n      Type: ${q.questionType} | Points: ${q.rubric.maxPoints}`
        )
        .join("\n");
      return `**${topic.toUpperCase()}** (${qs.length} questions):\n${qList}`;
    })
    .join("\n\n");

  return `You are an expert educator selecting the best written questions for an assessment.

TASK:
- Select exactly ${targetCount} question IDs from the provided candidates
- Maximize concept diversity and avoid duplicates or near-duplicates
- Prioritize clear, self-contained questions that match the requested format and difficulty
- DO NOT rewrite questions, rubrics, or model answers
- ONLY return IDs that appear in the candidate list

Selection Criteria:
1. Diversity: cover distinct ideas from the source material
2. Quality: prefer precise, unambiguous questions
3. Balance: match the requested difficulty and question type
4. Relevance: prioritize important concepts over trivia

Requested Difficulty: ${difficulty}
Requested Question Type: ${questionType}
${focus ? `Focus Area: ${focus}\n` : ""}
Candidate Questions:
${questionsText}

Return a JSON object with a single property "selectedIds" containing exactly ${targetCount} chosen IDs.`;
}

export function applySelectedQuestionIds(
  questions: WrittenQuestion[],
  selectedIds: string[],
  targetCount: number
): WrittenQuestion[] {
  const questionById = new Map<string, WrittenQuestion>();
  for (const question of questions) {
    if (!questionById.has(question.id)) {
      questionById.set(question.id, question);
    }
  }

  const resolvedQuestions: WrittenQuestion[] = [];
  const seenIds = new Set<string>();

  for (const selectedId of selectedIds) {
    const question = questionById.get(selectedId);
    if (!question || seenIds.has(selectedId)) {
      continue;
    }

    seenIds.add(selectedId);
    resolvedQuestions.push(question);

    if (resolvedQuestions.length >= targetCount) {
      return resolvedQuestions;
    }
  }

  for (const question of questions) {
    if (seenIds.has(question.id)) {
      continue;
    }

    seenIds.add(question.id);
    resolvedQuestions.push(question);

    if (resolvedQuestions.length >= targetCount) {
      break;
    }
  }

  return resolvedQuestions;
}

export function finalizeQuestions(
  questions: WrittenQuestion[],
  state: OverallStateType,
  logger: JobLogger
): Partial<OverallStateType> {
  const questionsWithIds = questions.map((q) => ({
    ...q,
    id: q.id && q.id.trim() ? q.id : randomUUID(),
    questionType: state.questionType as "short" | "essay",
  }));

  logger.info("Written questions reduce final summary", {
    agent: "WrittenQuestionsGraph",
    phase: "reduce_final",
    finalQuestionCount: questionsWithIds.length,
    finalQuestions: questionsWithIds.map((q, idx) => ({
      index: idx + 1,
      id: q.id,
      question: q.question,
      questionType: q.questionType,
      maxPoints: q.rubric.maxPoints,
    })),
  });

  logger.info("GENERATION COMPLETE", {
    agent: "WrittenQuestionsGraph",
    phase: "generation_complete",
    finalQuestionCount: questionsWithIds.length,
    targetQuestionCount: state.questionCount,
    milestone: true,
  });

  const collapsedOutputsSize =
    state.collapsedOutputs?.reduce((sum, s) => sum + s.length * 2, 0) ?? 0;
  const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
  logger.info(
    `Freeing ~${((collapsedOutputsSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`,
    {
      agent: "WrittenQuestionsGraph",
      phase: "reduce_cleanup",
      memoryFreedKB: ((collapsedOutputsSize + chunksSize) / 1024).toFixed(2),
    }
  );

  return {
    ...withoutMapOutputs(state),
    finalOutput: questionsWithIds,
    status: "completed",
    ...clearStateKeys<OverallStateType>(["collapsedOutputs", "chunks"]),
  };
}
