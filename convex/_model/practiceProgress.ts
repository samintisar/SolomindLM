/**
 * Practice progress (flashcard review history, quiz and written-question answers and grades, the
 * last card or question viewed) is stored on the shared studio row, so it is the owner's. Viewers
 * of a public notebook and forkers must not see it; the `without*` helpers return a row without
 * it. A viewer's own progress lives in `studioProgress` (see `studioProgress.ts`):
 * `applyViewerProgress` lays it over a stripped row, and the `with*` updaters build it.
 *
 * Pure functions over the stored shapes, so any query or copy path can reuse them.
 */
import type { CardProficiency } from "../_lib/srsScheduling";

type PracticeRow = { metadata?: unknown };

/** The studio tables a user practises on. */
export type PracticeItemType = "flashcards" | "quizzes" | "writtenQuestions";

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

// ---------------------------------------------------------------------------
// A viewer's own progress (stored in `studioProgress.progress`)
// ---------------------------------------------------------------------------

/**
 * A viewer's progress on one item. It mirrors the per-user fields of the shared row:
 * - flashcards: `cards[cardIndex] = { front, proficiency }` (the card's front, so a card the
 *   owner edits or moves starts fresh), `showMastered`, `lastViewedIndex`;
 * - quizzes: `userAnswers[questionIndex] = selectedOption`, `lastViewedIndex`;
 * - written questions: `userAnswers[questionId] = { answer, graded, score, maxScore, feedback,
 *   strengths, improvements, submittedAt, gradedAt }`, `lastViewedIndex`.
 */
type ViewerProgress = {
  cards?: Record<string, { front: string; proficiency: CardProficiency }>;
  showMastered?: boolean;
  userAnswers?: Record<string, unknown>;
  lastViewedIndex?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asProgress(value: unknown): ViewerProgress {
  return isRecord(value) ? (value as ViewerProgress) : {};
}

/** The practice table for a table name or the `_type` tag the notes queries use; else null. */
export function practiceItemType(type: string): PracticeItemType | null {
  switch (type) {
    case "flashcards":
    case "flashcard":
      return "flashcards";
    case "quizzes":
    case "quiz":
      return "quizzes";
    case "writtenQuestions":
      return "writtenQuestions";
    default:
      return null;
  }
}

function withSavedProficiency(
  card: unknown,
  saved: { front: string; proficiency: CardProficiency } | undefined
): unknown {
  if (!saved || !isRecord(card) || card.front !== saved.front) return card;
  return { ...card, proficiency: saved.proficiency };
}

/**
 * Lays a viewer's own progress over a row already stripped of the owner's. Rows of other types,
 * or with no progress, come back unchanged.
 */
export function applyViewerProgress<T extends object>(type: string, row: T, progress: unknown): T {
  const itemType = practiceItemType(type);
  if (itemType === null || !isRecord(progress)) return row;
  const saved = asProgress(progress);
  const practiceRow = row as T & PracticeRow & { cardsData?: unknown[] };

  const metadata: Record<string, unknown> = {};
  if (saved.lastViewedIndex !== undefined) metadata.lastViewedIndex = saved.lastViewedIndex;
  if (itemType === "flashcards") {
    if (saved.showMastered !== undefined) metadata.showMastered = saved.showMastered;
  } else if (saved.userAnswers !== undefined) {
    metadata.userAnswers = saved.userAnswers;
  }

  const overlaid = { ...practiceRow };
  if (Object.keys(metadata).length > 0) {
    overlaid.metadata = {
      ...(isRecord(practiceRow.metadata) ? practiceRow.metadata : {}),
      ...metadata,
    };
  }
  if (itemType === "flashcards" && Array.isArray(practiceRow.cardsData)) {
    const cards = saved.cards ?? {};
    overlaid.cardsData = practiceRow.cardsData.map((card, index) =>
      withSavedProficiency(card, cards[String(index)])
    );
  }
  return overlaid;
}

/** A viewer's view of a practice row: the owner's progress removed, the viewer's own laid over. */
export function forViewer<T extends object>(type: string, row: T, progress: unknown): T {
  return applyViewerProgress(type, withoutPracticeProgress(type, row), progress);
}

/** The viewer's saved review state for a card, unless they never reviewed it or it has changed. */
export function savedCardProficiency(
  progress: unknown,
  cardIndex: number,
  front: string
): CardProficiency | undefined {
  const saved = asProgress(progress).cards?.[String(cardIndex)];
  return saved?.front === front ? saved.proficiency : undefined;
}

export function withCardReview(
  progress: unknown,
  cardIndex: number,
  front: string,
  proficiency: CardProficiency
): ViewerProgress {
  const current = asProgress(progress);
  return { ...current, cards: { ...current.cards, [String(cardIndex)]: { front, proficiency } } };
}

export function withShowMastered(progress: unknown, showMastered: boolean): ViewerProgress {
  return { ...asProgress(progress), showMastered };
}

export function withLastViewedIndex(progress: unknown, lastViewedIndex: number): ViewerProgress {
  return { ...asProgress(progress), lastViewedIndex };
}

export function withQuizAnswer(
  progress: unknown,
  questionIndex: number,
  selectedOption: number
): ViewerProgress {
  const current = asProgress(progress);
  return {
    ...current,
    userAnswers: { ...current.userAnswers, [String(questionIndex)]: selectedOption },
  };
}

/** Records one written answer's grading state (in progress or graded), replacing the entry. */
export function withWrittenAnswer(
  progress: unknown,
  questionId: string,
  answer: Record<string, unknown>
): ViewerProgress {
  const current = asProgress(progress);
  return { ...current, userAnswers: { ...current.userAnswers, [questionId]: answer } };
}

/** Saves draft text only, keeping any grade (as `saveWrittenQuestionUserAnswerDraft` does). */
export function withWrittenDraft(
  progress: unknown,
  questionId: string,
  answer: string
): ViewerProgress {
  const current = asProgress(progress);
  const existing = current.userAnswers?.[questionId];
  return {
    ...current,
    userAnswers: {
      ...current.userAnswers,
      [questionId]: { graded: false, ...(isRecord(existing) ? existing : {}), answer },
    },
  };
}

/** "Try again": no answers, back to the first question. */
export function withoutAnswers(progress: unknown): ViewerProgress {
  return { ...asProgress(progress), userAnswers: {}, lastViewedIndex: 0 };
}
