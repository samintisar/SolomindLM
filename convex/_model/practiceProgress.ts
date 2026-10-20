/**
 * Practice progress (flashcard review history, quiz and written-question answers and grades, the
 * last card or question viewed) is stored on the shared studio row, so it is the owner's. Viewers
 * of a public notebook and forkers must not see it; these helpers return a row without it.
 *
 * Pure functions over the stored shapes, so any query or copy path can reuse them.
 */

type PracticeRow = { metadata?: unknown };

/** Per-user keys shared by every practice type's `metadata`. */
const SHARED_PROGRESS_KEYS = ["lastViewedIndex"] as const;
const FLASHCARD_PROGRESS_KEYS = [...SHARED_PROGRESS_KEYS, "showMastered"] as const;
const ANSWER_PROGRESS_KEYS = [...SHARED_PROGRESS_KEYS, "userAnswers"] as const;

function withoutKeys(metadata: unknown, keys: readonly string[]): unknown {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }
  const stored = metadata as Record<string, unknown>;
  if (!keys.some((key) => key in stored)) return metadata;
  return Object.fromEntries(Object.entries(stored).filter(([key]) => !keys.includes(key)));
}

/** A card without its review history reads as never reviewed, like a freshly generated one. */
function withoutCardProficiency(card: unknown): unknown {
  if (card === null || typeof card !== "object" || !("proficiency" in card)) return card;
  const { proficiency: _proficiency, ...rest } = card as Record<string, unknown>;
  return rest;
}

/** Flashcards: each card's spaced-repetition `proficiency`, the Due/All choice and the last card viewed. */
export function withoutFlashcardProgress<T extends PracticeRow & { cardsData?: unknown[] }>(
  row: T
): T {
  const stripped = withoutMetadataKeys(row, FLASHCARD_PROGRESS_KEYS);
  if (Array.isArray(row.cardsData)) {
    stripped.cardsData = row.cardsData.map(withoutCardProficiency);
  }
  return stripped;
}

/** Quizzes: the chosen answers and the last question viewed. */
export function withoutQuizProgress<T extends PracticeRow>(row: T): T {
  return withoutMetadataKeys(row, ANSWER_PROGRESS_KEYS);
}

/** Written questions: drafts, submitted answers with their grades and feedback, and the last question viewed. */
export function withoutWrittenQuestionProgress<T extends PracticeRow>(row: T): T {
  return withoutMetadataKeys(row, ANSWER_PROGRESS_KEYS);
}

function withoutMetadataKeys<T extends PracticeRow>(row: T, keys: readonly string[]): T {
  if (row.metadata === undefined) return { ...row };
  return { ...row, metadata: withoutKeys(row.metadata, keys) };
}

/**
 * Strips practice progress from a row of any studio table, by table name (or the `_type` tag the
 * unified notes queries use). Rows of other types come back unchanged.
 */
export function withoutPracticeProgress<T extends object>(type: string, row: T): T {
  const practiceRow = row as T & PracticeRow & { cardsData?: unknown[] };
  switch (type) {
    case "flashcards":
    case "flashcard":
      return withoutFlashcardProgress(practiceRow);
    case "quizzes":
    case "quiz":
      return withoutQuizProgress(practiceRow);
    case "writtenQuestions":
      return withoutWrittenQuestionProgress(practiceRow);
    default:
      return row;
  }
}
