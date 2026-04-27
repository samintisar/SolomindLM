"use node";

import type { QuizQuestion } from "./prompts.js";

/**
 * Strips a single leading list label from a multiple-choice option (A., A), 1), (A), etc.).
 * Repeats up to a few times in case the model double-prefixes.
 */
export function stripMultipleChoiceLabel(text: string): string {
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

/**
 * If more than four options, keep four while preserving the correct index when possible.
 */
function coerceToFourOptions(
  options: string[],
  answer: number
): { options: string[]; answer: number } {
  const a = Math.max(0, Math.min(answer, options.length - 1));

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
 * Strips list labels, then coerces to exactly four options and a valid 0–3 answer index.
 */
export function normalizeQuizQuestion(q: QuizQuestion): QuizQuestion {
  const stripped = q.options.map((o) => stripMultipleChoiceLabel(o));
  const { options, answer } = coerceToFourOptions(stripped, q.answer);
  return { ...q, options, answer };
}
