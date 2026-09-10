import type { WrittenQuestion, WrittenQuestionAnswer } from "@/shared/types/index";

export interface WrittenQuestionsSummary {
  /** Sum of `score` across graded answers only. */
  score: number;
  /** Sum of `rubric.maxPoints` across every question in the set. */
  maxScore: number;
  /** Number of questions whose answer has `graded === true`. */
  gradedCount: number;
  /** Total number of questions in the set. */
  totalCount: number;
  /** `score / maxScore` as a rounded percentage; 0 when `maxScore` is 0. */
  percentage: number;
}

type AnswerLike = Pick<WrittenQuestionAnswer, "graded" | "score"> & { answer?: string };

export function summarizeWrittenQuestions(
  questions: WrittenQuestion[],
  userAnswers: Record<string, AnswerLike> = {}
): WrittenQuestionsSummary {
  const totalCount = questions.length;

  let score = 0;
  let gradedCount = 0;
  for (const question of questions) {
    const answer = userAnswers[question.id];
    if (answer?.graded) {
      gradedCount += 1;
      score += answer.score ?? 0;
    }
  }

  const maxScore = questions.reduce((sum, question) => sum + (question.rubric?.maxPoints ?? 0), 0);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return { score, maxScore, gradedCount, totalCount, percentage };
}

/**
 * Question ids that have a non-empty answer but have not been graded yet —
 * i.e. the set to grade when the user presses Finish.
 */
export function selectPendingGradeIds(
  questions: WrittenQuestion[],
  answers: Record<string, AnswerLike>
): string[] {
  const pending: string[] = [];
  for (const question of questions) {
    const entry = answers[question.id];
    if (entry && (entry.answer ?? "").trim().length > 0 && entry.graded !== true) {
      pending.push(question.id);
    }
  }
  return pending;
}
