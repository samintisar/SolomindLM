import { useState, lazy, Suspense } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, BookOpen } from 'lucide-react';
import { Flashcard } from '@/shared/types';
import { sanitizeMarkdown } from '@/shared/utils';
import { srsSubtextForRating } from '@/features/studio/utils/srsReviewLabels';

const MarkdownRenderer = lazy(() =>
  import('@/shared/components/MarkdownRenderer').then((m) => ({ default: m.default }))
);

interface StudyModeProps {
  cards: Flashcard[];
  onComplete: (stats: { reviewed: number; correct: number; incorrect: number; longestStreak: number }) => void;
  onExit: () => void;
}

/** Neutral cards + saturated left stripe only — readable sans text, no tinted mud fills. */
const RATING_BUTTONS = [
  { label: 'Again', rating: 'again' as const, stripeClass: 'border-l-rose-600 dark:border-l-rose-400' },
  { label: 'Hard', rating: 'hard' as const, stripeClass: 'border-l-amber-600 dark:border-l-amber-400' },
  { label: 'Good', rating: 'good' as const, stripeClass: 'border-l-blue-600 dark:border-l-blue-400' },
  { label: 'Easy', rating: 'easy' as const, stripeClass: 'border-l-emerald-600 dark:border-l-emerald-400' },
] as const;

const RATING_BUTTON_BASE =
  'font-sans rounded-xl border border-border bg-card px-3 py-3 pl-3.5 text-left text-sm text-foreground shadow-sm transition-colors hover:bg-muted/60 hover:border-foreground/12 active:scale-[0.99] sm:py-3.5 border-l-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const answerMarkdownComponents = {
  img: () => null,
  a: ({ children }: { children?: React.ReactNode }) => <span className="text-foreground">{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }: { children?: React.ReactNode }) => (
    <table className="w-full border-collapse overflow-hidden rounded-lg border border-border">{children}</table>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-r border-border px-4 py-2 text-left font-semibold text-foreground last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-r border-border px-4 py-2 text-foreground last:border-r-0">{children}</td>
  ),
};

/**
 * Study mode for spaced repetition — layout aligned with FlashcardView browse styling.
 */
export function StudyMode({ cards, onComplete, onExit }: StudyModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewedCards, setReviewedCards] = useState<number[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);

  const currentCard = cards[currentIndex];
  const remainingCards = cards.length - reviewedCards.length;
  const isComplete = reviewedCards.length === cards.length;

  const sessionProgressPercent = cards.length > 0 ? (reviewedCards.length / cards.length) * 100 : 0;
  const deckPositionPercent = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  const handleRating = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    const isNewCorrect = rating !== 'again';
    const isNewIncorrect = rating === 'again';

    if (isNewCorrect) {
      const newStreak = currentStreak + 1;
      setCurrentStreak(newStreak);
      setLongestStreak((prev) => Math.max(prev, newStreak));
      setCorrectCount((prev) => prev + 1);
    } else {
      setCurrentStreak(0);
      setIncorrectCount((prev) => prev + 1);
    }

    setReviewedCards((prev) => [...prev, currentIndex]);

    if (reviewedCards.length + 1 >= cards.length) {
      onComplete({
        reviewed: reviewedCards.length + 1,
        correct: correctCount + (isNewCorrect ? 1 : 0),
        incorrect: incorrectCount + (isNewIncorrect ? 1 : 0),
        longestStreak: isNewCorrect ? Math.max(longestStreak, currentStreak + 1) : longestStreak,
      });
    } else {
      const nextIndex = cards.findIndex((_, i) => !reviewedCards.includes(i) && i > currentIndex);
      const nextUnreviewed = nextIndex !== -1 ? nextIndex : cards.findIndex((_, i) => !reviewedCards.includes(i));
      setCurrentIndex(nextUnreviewed);
      setShowAnswer(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setShowAnswer(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
    }
  };

  const handleShowAnswer = () => {
    setShowAnswer(true);
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setShowAnswer(false);
    setReviewedCards([]);
    setCorrectCount(0);
    setIncorrectCount(0);
    setCurrentStreak(0);
    setLongestStreak(0);
  };

  const renderCardFront = (card: Flashcard) => {
    switch (card.type) {
      case 'true-false':
        return (
          <div className="w-full space-y-6 text-center">
            <div className="prose prose-base sm:prose-lg max-w-none text-center">
              <Suspense fallback={<div className="mx-auto h-6 w-3/4 animate-pulse rounded bg-muted" />}>
                <MarkdownRenderer>{sanitizeMarkdown(card.front)}</MarkdownRenderer>
              </Suspense>
            </div>
            <div className="flex justify-center gap-12 sm:gap-16">
              <span className="text-lg font-semibold text-emerald-700 sm:text-xl dark:text-emerald-400">✓ True</span>
              <span className="text-lg font-semibold text-rose-700 sm:text-xl dark:text-rose-400">✗ False</span>
            </div>
          </div>
        );

      case 'fill-blank':
        return (
          <div className="prose prose-base sm:prose-lg max-w-none text-center">
            <Suspense fallback={<div className="mx-auto h-6 w-3/4 animate-pulse rounded bg-muted" />}>
              <MarkdownRenderer>{sanitizeMarkdown(card.front.replace(/_+/g, '______'))}</MarkdownRenderer>
            </Suspense>
          </div>
        );

      default:
        return (
          <div className="prose prose-base sm:prose-lg max-w-none text-center">
            <Suspense fallback={<div className="mx-auto h-6 w-3/4 animate-pulse rounded bg-muted" />}>
              <MarkdownRenderer>{sanitizeMarkdown(card.front)}</MarkdownRenderer>
            </Suspense>
          </div>
        );
    }
  };

  if (isComplete) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-1 py-8 text-center sm:py-12">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-100 shadow-md dark:bg-emerald-900/20">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        </div>

        <h2 className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">Session complete</h2>
        <p className="mb-8 max-w-sm text-sm text-muted-foreground">You have reviewed all due cards in this set.</p>

        <div className="mb-8 grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-2xl font-bold tabular-nums sm:text-3xl">{reviewedCards.length}</div>
            <div className="mt-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">Reviewed</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-2xl font-bold tabular-nums text-emerald-600 sm:text-3xl dark:text-emerald-400">
              {correctCount}
            </div>
            <div className="mt-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">Correct</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-2xl font-bold tabular-nums text-rose-600 sm:text-3xl dark:text-rose-400">
              {incorrectCount}
            </div>
            <div className="mt-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">Again</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-2xl font-bold tabular-nums text-amber-600 sm:text-3xl dark:text-amber-400">
              {longestStreak}
            </div>
            <div className="mt-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">Best streak</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted/50"
          >
            Study again
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
          >
            Back to browse
          </button>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <BookOpen className="mx-auto mb-4 h-14 w-14 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No cards available for study.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-xl flex-col gap-6">
      {/* Session progress (reviewed) — single bar + one line of copy */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm leading-snug text-muted-foreground">
          <span>
            <span className="font-semibold tabular-nums text-foreground">{reviewedCards.length}</span>
            <span className="font-normal"> of </span>
            <span className="font-semibold tabular-nums text-foreground">{cards.length}</span>
            <span className="font-normal"> reviewed</span>
          </span>
          <span className="tabular-nums">
            <span className="font-semibold text-foreground/90">{remainingCards}</span>
            <span className="font-normal"> left</span>
          </span>
        </div>
        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(sessionProgressPercent)}
          aria-label={`${reviewedCards.length} of ${cards.length} cards reviewed`}
        >
          <div
            className="h-full rounded-full bg-foreground/25 transition-[width] duration-300 ease-out dark:bg-foreground/35"
            style={{ width: `${sessionProgressPercent}%` }}
          />
        </div>
      </div>

      {/* Card — match browse dimensions; avoid items-center so content stays full width (prose/KaTeX won’t shrink) */}
      <div className="flex h-[min(40vh,22rem)] min-h-56 max-h-96 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        {!showAnswer ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5 text-center sm:p-6">
            <span className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Question
            </span>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
              <div className="flex min-h-full w-full min-w-0 flex-col justify-center py-1 text-base font-medium text-foreground sm:text-lg">
                {renderCardFront(currentCard)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5 text-center sm:p-6">
            <span className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Answer
            </span>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
              <div className="flex min-h-full w-full min-w-0 flex-col justify-center py-1">
                <div
                  className="prose prose-base sm:prose-lg w-full min-w-0 max-w-none text-center leading-relaxed text-foreground [&_p]:leading-relaxed [&_code]:rounded-md [&_code]:border [&_code]:border-border/60 [&_code]:bg-muted/70 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:font-normal [&_code]:text-foreground [&_pre]:text-left [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_.katex]:max-w-full [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto"
                >
                  <Suspense fallback={<div className="mx-auto h-6 w-3/4 max-w-full animate-pulse rounded bg-muted" />}>
                    <MarkdownRenderer components={answerMarkdownComponents}>
                      {sanitizeMarkdown(currentCard.back)}
                    </MarkdownRenderer>
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deck position — same pattern as browse (circular arrows + track) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35 touch-manipulation"
            aria-label="Previous card"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div
            className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={cards.length}
            aria-valuenow={currentIndex + 1}
            aria-label={`Viewing card ${currentIndex + 1} of ${cards.length}`}
          >
            <div
              className="h-full rounded-full bg-foreground/25 transition-[width] duration-300 ease-out dark:bg-foreground/35"
              style={{ width: `${deckPositionPercent}%` }}
            />
          </div>
          <button
            type="button"
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35 touch-manipulation"
            aria-label="Next card"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <p className="text-center text-sm tabular-nums leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">{currentIndex + 1}</span>
          <span className="mx-2 text-base font-light text-foreground/35" aria-hidden>
            ·
          </span>
          <span className="font-medium text-foreground/85">{cards.length}</span>
          <span className="ml-2 text-sm font-normal text-muted-foreground">in deck</span>
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-stretch gap-3 sm:items-center">
        {!showAnswer ? (
          <button
            type="button"
            onClick={handleShowAnswer}
            className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] sm:w-auto sm:min-w-[200px]"
          >
            Reveal answer
          </button>
        ) : (
          <div className="w-full space-y-3">
            <p className="text-center font-sans text-sm font-medium leading-snug text-foreground/85">
              How well did you know this?
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
              {RATING_BUTTONS.map(({ label, rating, stripeClass }) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => handleRating(rating)}
                  className={`${RATING_BUTTON_BASE} ${stripeClass}`}
                >
                  <div className="font-semibold tracking-tight">{label}</div>
                  <div className="mt-1.5 font-sans text-xs font-medium tabular-nums leading-snug text-muted-foreground">
                    {srsSubtextForRating(currentCard.proficiency, rating)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
