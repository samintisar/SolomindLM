/**
 * Deterministic structural invariants for studio outputs.
 *
 * These catch defects that per-item LLM judging cannot see — e.g. the correct
 * quiz answer sitting in the same position across a whole quiz, which looks
 * fine one question at a time. They need no API calls, so they run on every
 * studio eval. `studio.ts` wraps each check into a `MetricResult`.
 */
import type { MetricStatus } from "../types";

export interface InvariantCheck {
  metric: string;
  status: MetricStatus;
  score: number;
  detail: string;
  breakdown?: Record<string, unknown>;
}

interface QuizQuestionLike {
  options?: unknown;
  answer?: unknown;
  hint?: unknown;
  explanation?: unknown;
}

interface FlashcardLike {
  front?: unknown;
  back?: unknown;
  question?: unknown;
  answer?: unknown;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

/** pass when every item is valid, warn at ≥90%, fail below. */
function validityStatus(score: number): MetricStatus {
  if (score === 1) return "pass";
  return score >= 0.9 ? "warn" : "fail";
}

// ─── Quiz: answer position balance ───────────────────────────

const OPTION_COUNT = 4;
/** Below this many questions a skew is not distinguishable from chance. */
const MIN_QUESTIONS_FOR_BALANCE = 8;
const BALANCE_FAIL_P = 0.01;
const BALANCE_WARN_P = 0.05;

function binomialUpperTail(n: number, k: number, p: number): number {
  let coeff = 1; // C(n, 0)
  let total = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) coeff = (coeff * (n - i + 1)) / i;
    if (i >= k) total += coeff * p ** i * (1 - p) ** (n - i);
  }
  return Math.min(1, total);
}

/**
 * Tests whether the most common correct-answer position is over-represented
 * compared with a uniform spread (one-sided binomial tail, Bonferroni-corrected
 * across the four positions).
 */
export function quizAnswerPositionBalance(questions: QuizQuestionLike[]): InvariantCheck {
  const metric = "quiz_answer_position_balance";
  const counts = new Array<number>(OPTION_COUNT).fill(0);
  for (const q of questions) {
    if (Number.isInteger(q.answer) && (q.answer as number) >= 0 && (q.answer as number) < 4) {
      counts[q.answer as number]++;
    }
  }
  const n = counts.reduce((a, b) => a + b, 0);
  if (n < MIN_QUESTIONS_FOR_BALANCE) {
    return {
      metric,
      status: "info",
      score: 1,
      detail: `Only ${n} scorable questions; need ${MIN_QUESTIONS_FOR_BALANCE} to judge answer-position balance.`,
      breakdown: { counts, n },
    };
  }

  const maxCount = Math.max(...counts);
  const maxPosition = counts.indexOf(maxCount);
  const pValue = Math.min(1, OPTION_COUNT * binomialUpperTail(n, maxCount, 1 / OPTION_COUNT));
  const maxShare = maxCount / n;
  const uniformShare = 1 / OPTION_COUNT;
  const score = Math.max(0, 1 - (maxShare - uniformShare) / (1 - uniformShare));
  const status: MetricStatus =
    pValue < BALANCE_FAIL_P ? "fail" : pValue < BALANCE_WARN_P ? "warn" : "pass";
  const letter = String.fromCharCode(65 + maxPosition);

  return {
    metric,
    status,
    score,
    detail: `Correct answers by position A–D: ${counts.join("/")} (n=${n}); position ${letter} holds ${(maxShare * 100).toFixed(0)}% (p=${pValue.toPrecision(2)} vs uniform).`,
    breakdown: { counts, n, maxPosition, maxShare, pValue },
  };
}

// ─── Quiz: option validity ───────────────────────────────────

export function quizOptionValidity(questions: QuizQuestionLike[]): InvariantCheck {
  const metric = "quiz_option_validity";
  const invalid: Array<{ index: number; reasons: string[] }> = [];

  questions.forEach((q, index) => {
    const reasons: string[] = [];
    const options = Array.isArray(q.options) ? q.options : [];
    if (options.length !== OPTION_COUNT) reasons.push(`has ${options.length} options`);
    if (options.some(isBlank)) reasons.push("blank option");
    const normalized = options.filter((o): o is string => typeof o === "string").map(norm);
    if (new Set(normalized).size !== normalized.length) reasons.push("duplicate options");
    const answer = q.answer;
    if (
      !Number.isInteger(answer) ||
      (answer as number) < 0 ||
      (answer as number) >= options.length
    ) {
      reasons.push(`answer index ${String(answer)} out of range`);
    }
    if (reasons.length > 0) invalid.push({ index, reasons });
  });

  const total = questions.length;
  const score = total === 0 ? 1 : (total - invalid.length) / total;
  return {
    metric,
    status: total === 0 ? "info" : validityStatus(score),
    score,
    detail:
      invalid.length === 0
        ? `All ${total} questions have ${OPTION_COUNT} distinct options and a valid answer index.`
        : `${invalid.length}/${total} questions malformed: ${invalid
            .slice(0, 5)
            .map((i) => `Q${i.index + 1} (${i.reasons.join(", ")})`)
            .join("; ")}`,
    breakdown: { invalid, total },
  };
}

// ─── Quiz: positional references in hint/explanation ─────────

/**
 * Options are shuffled after generation, so a hint or explanation that points
 * at "option B" or "the first choice" can name the wrong option.
 */
const POSITIONAL_REF_PATTERNS: RegExp[] = [
  // "Option B", "answer 2", "choice (C)". Letters are matched case-sensitively
  // so ordinary prose ("answer a question") is not flagged.
  /\b(?:[Oo]ptions?|[Cc]hoices?|[Aa]nswers?|[Aa]lternatives?)\s*\(?(?:[A-D]|[1-4])\)?(?![\w'-]|\.\d)/,
  // "(C)" used as a label
  /\([A-D]\)/,
  // "the first choice", "last option"
  /\b(?:first|second|third|fourth|last)\s+(?:option|choice|alternative)s?\b/i,
];

export function quizPositionalReferences(questions: QuizQuestionLike[]): InvariantCheck {
  const metric = "quiz_explanation_positional_refs";
  const flagged: number[] = [];
  questions.forEach((q, index) => {
    const text = [q.hint, q.explanation].filter((t) => typeof t === "string").join("\n");
    if (POSITIONAL_REF_PATTERNS.some((re) => re.test(text))) flagged.push(index);
  });

  const total = questions.length;
  const score = total === 0 ? 1 : (total - flagged.length) / total;
  return {
    metric,
    status: total === 0 ? "info" : flagged.length === 0 ? "pass" : "warn",
    score,
    detail:
      flagged.length === 0
        ? "No hint or explanation refers to options by letter or position."
        : `${flagged.length}/${total} hints/explanations refer to options by letter or position (options are shuffled, so these can point at the wrong choice): ${flagged
            .map((i) => `Q${i + 1}`)
            .join(", ")}`,
    breakdown: { flagged, total },
  };
}

// ─── Flashcards: card validity ───────────────────────────────

export function flashcardCardValidity(cards: FlashcardLike[]): InvariantCheck {
  const metric = "flashcard_card_validity";
  const invalid: Array<{ index: number; reasons: string[] }> = [];
  const seenFronts = new Set<string>();

  cards.forEach((card, index) => {
    const front = card.front ?? card.question;
    const back = card.back ?? card.answer;
    const reasons: string[] = [];
    if (isBlank(front)) reasons.push("blank front");
    if (isBlank(back)) reasons.push("blank back");
    if (!isBlank(front)) {
      const key = norm(front as string);
      if (seenFronts.has(key)) reasons.push("duplicate front");
      seenFronts.add(key);
    }
    if (reasons.length > 0) invalid.push({ index, reasons });
  });

  const total = cards.length;
  const score = total === 0 ? 1 : (total - invalid.length) / total;
  return {
    metric,
    status: total === 0 ? "info" : validityStatus(score),
    score,
    detail:
      invalid.length === 0
        ? `All ${total} cards have a distinct front and a non-empty back.`
        : `${invalid.length}/${total} cards malformed: ${invalid
            .slice(0, 5)
            .map((i) => `#${i.index + 1} (${i.reasons.join(", ")})`)
            .join("; ")}`,
    breakdown: { invalid, total },
  };
}

export function quizInvariantChecks(questions: QuizQuestionLike[]): InvariantCheck[] {
  return [
    quizAnswerPositionBalance(questions),
    quizOptionValidity(questions),
    quizPositionalReferences(questions),
  ];
}
