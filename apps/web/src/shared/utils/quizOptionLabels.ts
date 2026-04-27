import type { QuizQuestion } from "@/shared/types";

/**
 * Strips a leading A./A)/1) style prefix from a quiz option for display.
 * Mirror `convex/_agents/quiz/optionLabels.ts` when changing.
 */
export function stripQuizOptionLabel(text: string): string {
  let t = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(/^\s*\([A-Da-d]\)\s+/i, "")
      .replace(/^\s*([A-Da-d]|[1-4])[.):]\s+/i, "")
      .trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

function coerceToFourOptions(
  options: string[],
  answer: number
): { options: string[]; answer: number } {
  const a = options.length > 0 ? Math.max(0, Math.min(answer, options.length - 1)) : 0;

  if (options.length === 0) {
    return { options: ["", "", "", ""], answer: 0 };
  }
  if (options.length === 4) {
    return { options, answer: Math.min(a, 3) };
  }
  if (options.length < 4) {
    return { options, answer: a };
  }
  if (options.length === 5) {
    if (a < 4) {
      return { options: options.slice(0, 4), answer: a };
    }
    return {
      options: [options[0]!, options[1]!, options[2]!, options[4]!],
      answer: 3,
    };
  }
  return {
    options: options.slice(0, 4),
    answer: Math.min(a, 3),
  };
}

/**
 * Strips list labels and coerces to four options; matches server-side `normalizeQuizQuestion`.
 * Use for displaying legacy quizzes in the app.
 */
export function normalizeStoredQuizQuestion(q: QuizQuestion): QuizQuestion {
  const stripped = q.options.map((o) => stripQuizOptionLabel(o));
  const { options, answer } = coerceToFourOptions(stripped, q.answer);
  return { ...q, options, answer };
}
