// Pure helpers (no "use node"): also imported by the V8 saveQuizResults mutation.
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
 * Fisher–Yates shuffle that carries the correct answer index along with its option.
 * LLMs strongly favour writing the answer they were given as the first option, so the
 * position must never be left to the model.
 */
function shuffleOptions(
  options: string[],
  answer: number,
  rng: () => number
): { options: string[]; answer: number } {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { options: order.map((i) => options[i]!), answer: order.indexOf(answer) };
}

/**
 * Strips list labels, coerces to exactly four options with a valid 0–3 answer index,
 * then shuffles so the correct answer lands in a uniformly random position.
 */
export function normalizeQuizQuestion(
  q: QuizQuestion,
  rng: () => number = Math.random
): QuizQuestion {
  const stripped = q.options.map((o) => stripMultipleChoiceLabel(o));
  const coerced = coerceToFourOptions(stripped, q.answer);
  const { options, answer } = shuffleOptions(coerced.options, coerced.answer, rng);
  return { ...q, options, answer };
}
