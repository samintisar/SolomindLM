import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { srsSubtextForRating } from "@/features/studio/utils/srsReviewLabels";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import type { Flashcard } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Burst } from "../../motion/Burst";
import { useStreak } from "../../motion/useStreak";
import { FlashcardBack, FlashcardFront } from "../flashcards/FlashcardContent";
import { FlipCard } from "../flashcards/FlipCard";
import { RatingButton } from "../flashcards/RatingButton";
import { RATINGS, type RatingConfig, ratingForKey, type SrsRating } from "../flashcards/ratings";
import { TallyTile } from "../flashcards/TallyTile";
import { StreakChip } from "../practice/StreakChip";

export type DueFlashcard = {
  index: number;
  card: Flashcard;
};

interface StudyModeProps {
  cards: DueFlashcard[];
  onComplete: (stats: {
    reviewed: number;
    correct: number;
    incorrect: number;
    longestStreak: number;
  }) => void;
  onRateCard: (cardIndex: number, rating: SrsRating) => Promise<void>;
  onExit: () => void;
}

interface ThrownCard {
  id: number;
  card: Flashcard;
  rating: SrsRating;
}

const EMPTY_TALLY: Record<SrsRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
const RATING_BY_ID = Object.fromEntries(RATINGS.map((r) => [r.rating, r])) as Record<
  SrsRating,
  RatingConfig
>;
const TALLY_DELAY = ["delay-300", "delay-400", "delay-500", "delay-600"];
/** jsdom and some browsers never fire animationend; this clears the thrown card regardless. */
const THROW_FALLBACK_MS = 700;

/** Keystrokes that belong to a field, a dialog, or (for Space and Enter) a focused control. */
function isIgnoredTarget(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) {
    return true;
  }
  const activatesControls = key === " " || key === "Enter";
  return activatesControls && target.closest("button, a, [role='button']") !== null;
}

/**
 * Study mode for spaced repetition: a deck. The next cards peek out behind the current one, a
 * rating throws the card away in its direction, and progress is stacked by rating colour.
 */
export function StudyMode({ cards, onComplete, onRateCard, onExit }: StudyModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewedCards, setReviewedCards] = useState<number[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [tally, setTally] = useState<Record<SrsRating, number>>(EMPTY_TALLY);
  const [thrown, setThrown] = useState<ThrownCard | null>(null);
  const { streak, record, reset: resetStreak } = useStreak();

  const revealRef = useRef<HTMLButtonElement>(null);
  const goodRef = useRef<HTMLButtonElement>(null);
  const throwId = useRef(0);
  const throwTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusKey = useRef({ currentIndex, showAnswer });

  const total = cards.length;
  const currentCardEntry = cards[currentIndex];
  const currentCard = currentCardEntry?.card;
  const remainingCards = total - reviewedCards.length;
  const isComplete = reviewedCards.length === total;

  const clearThrown = () => {
    if (throwTimer.current) clearTimeout(throwTimer.current);
    throwTimer.current = null;
    setThrown(null);
  };

  useEffect(
    () => () => {
      if (throwTimer.current) clearTimeout(throwTimer.current);
    },
    []
  );

  // Focus follows the flow: Good once the answer shows, "Reveal answer" once the card changes.
  // Never on the first mount, so opening study mode does not steal focus.
  useEffect(() => {
    const last = lastFocusKey.current;
    if (last.currentIndex === currentIndex && last.showAnswer === showAnswer) return;
    lastFocusKey.current = { currentIndex, showAnswer };
    (showAnswer ? goodRef.current : revealRef.current)?.focus({ preventScroll: true });
  }, [currentIndex, showAnswer]);

  const handleRating = async (rating: SrsRating) => {
    if (!currentCardEntry || isSubmittingRating) return;

    setIsSubmittingRating(true);
    try {
      await onRateCard(currentCardEntry.index, rating);

      const isNewCorrect = rating !== "again";
      const isNewIncorrect = rating === "again";
      const nextReviewedCards = [...reviewedCards, currentIndex];

      if (isNewCorrect) {
        const newStreak = currentStreak + 1;
        setCurrentStreak(newStreak);
        setLongestStreak((prev) => Math.max(prev, newStreak));
        setCorrectCount((prev) => prev + 1);
      } else {
        setCurrentStreak(0);
        setIncorrectCount((prev) => prev + 1);
      }
      // The chip counts clean answers only: Hard neither extends nor breaks it.
      if (rating === "again") record(false);
      else if (rating !== "hard") record(true);
      setTally((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));

      throwId.current += 1;
      setThrown({ id: throwId.current, card: currentCardEntry.card, rating });
      if (throwTimer.current) clearTimeout(throwTimer.current);
      throwTimer.current = setTimeout(clearThrown, THROW_FALLBACK_MS);

      setReviewedCards(nextReviewedCards);

      if (nextReviewedCards.length >= total) {
        onComplete({
          reviewed: nextReviewedCards.length,
          correct: correctCount + (isNewCorrect ? 1 : 0),
          incorrect: incorrectCount + (isNewIncorrect ? 1 : 0),
          longestStreak: isNewCorrect ? Math.max(longestStreak, currentStreak + 1) : longestStreak,
        });
      } else {
        const nextIndex = cards.findIndex(
          (_, i) => !nextReviewedCards.includes(i) && i > currentIndex
        );
        const nextUnreviewed =
          nextIndex !== -1 ? nextIndex : cards.findIndex((_, i) => !nextReviewedCards.includes(i));
        setCurrentIndex(nextUnreviewed);
        setShowAnswer(false);
      }
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setShowAnswer(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
    }
  };

  const handleShowAnswer = () => {
    setShowAnswer(true);
  };

  const handleReset = () => {
    clearThrown();
    setCurrentIndex(0);
    setShowAnswer(false);
    setReviewedCards([]);
    setCorrectCount(0);
    setIncorrectCount(0);
    setCurrentStreak(0);
    setLongestStreak(0);
    setTally(EMPTY_TALLY);
    resetStreak();
  };

  // Re-subscribed every render so the handler always sees the latest state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs every render
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isIgnoredTarget(event.target, event.key)) return;
      if (!currentCard || isComplete) return;

      if (event.key === " " || event.key === "Enter") {
        if (showAnswer) return;
        event.preventDefault();
        handleShowAnswer();
        return;
      }
      const config = ratingForKey(event.key);
      if (config && showAnswer && !isSubmittingRating) {
        event.preventDefault();
        void handleRating(config.rating);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (isComplete) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-8 text-center animate-in fade-in duration-500">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-success-muted text-success animate-in zoom-in-50 spin-in-12 fade-in duration-700 ease-out">
          <CheckCircle2 className="size-8" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Session complete</h2>
          <p className="font-sans text-sm text-muted-foreground">
            {reviewedCards.length} cards reviewed · best streak {longestStreak}
          </p>
        </div>
        <div className="grid w-full grid-cols-4 gap-2">
          {RATINGS.map((r, k) => (
            <TallyTile
              key={r.rating}
              config={r}
              value={tally[r.rating]}
              className={cn(
                "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500",
                TALLY_DELAY[k]
              )}
            />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="secondary" onClick={handleReset}>
            Study again
          </Button>
          <Button onClick={onExit}>Back to browse</Button>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpen />
          </EmptyMedia>
          <EmptyTitle>No cards available for study.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  const throwConfig = thrown ? RATING_BY_ID[thrown.rating] : null;

  return (
    <div className="flex w-full min-w-0 max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3 font-sans text-sm text-muted-foreground">
        <span className="whitespace-nowrap">{`${reviewedCards.length} of ${total} reviewed`}</span>
        <StreakChip streak={streak} />
      </div>

      <div
        role="progressbar"
        aria-label="Cards reviewed"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={reviewedCards.length}
        aria-valuetext={`${reviewedCards.length} of ${total} cards reviewed`}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {RATINGS.map((r) => (
          <span
            key={r.rating}
            className={cn("studio-segment h-full duration-500 ease-out", r.toneBar)}
            style={
              { "--studio-segment": `${(tally[r.rating] / total) * 100}%` } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative pb-6">
        {remainingCards >= 3 ? (
          <div
            data-peek
            aria-hidden
            className="absolute inset-x-0 top-0 h-72 translate-y-6 scale-90 rounded-2xl bg-card opacity-40 shadow-md ring-1 ring-hairline sm:h-80"
          />
        ) : null}
        {remainingCards >= 2 ? (
          <div
            data-peek
            aria-hidden
            className="absolute inset-x-0 top-0 h-72 translate-y-3 scale-95 rounded-2xl bg-card opacity-70 shadow-md ring-1 ring-hairline sm:h-80"
          />
        ) : null}

        <div
          key={currentIndex}
          className="relative animate-in fade-in slide-in-from-bottom-3 zoom-in-95 duration-300"
        >
          <FlipCard
            flipped={showAnswer}
            front={<FlashcardFront card={currentCard} />}
            back={<FlashcardBack card={currentCard} />}
          />
        </div>

        {thrown && throwConfig ? (
          <div
            key={thrown.id}
            data-thrown
            data-rating={thrown.rating}
            aria-hidden
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) clearThrown();
            }}
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-72 flex-col items-center justify-center overflow-hidden rounded-2xl bg-muted p-6 text-center shadow-lg ring-1 ring-hairline animate-out fade-out fill-mode-forwards duration-500 ease-out sm:h-80",
              throwConfig.throwClass
            )}
          >
            <FlashcardBack card={thrown.card} />
          </div>
        ) : null}

        {thrown && (thrown.rating === "good" || thrown.rating === "easy") ? (
          <Burst key={thrown.id} />
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous card"
          onClick={handlePrevious}
          disabled={currentIndex === 0 || isSubmittingRating}
        >
          <ChevronLeft />
        </Button>
        <span className="font-sans text-sm tabular-nums text-muted-foreground">
          Card {currentIndex + 1} of {total}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next card"
          onClick={handleNext}
          disabled={currentIndex === total - 1 || isSubmittingRating}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3">
        {!showAnswer ? (
          <Button
            ref={revealRef}
            className="w-full sm:w-auto sm:min-w-50"
            onClick={handleShowAnswer}
          >
            Reveal answer
          </Button>
        ) : (
          <>
            <p className="text-center font-sans text-sm text-muted-foreground">
              How well did you know this?
            </p>
            <div className="grid w-full grid-cols-2 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 sm:grid-cols-4">
              {RATINGS.map((r) => (
                <RatingButton
                  key={r.rating}
                  ref={r.rating === "good" ? goodRef : undefined}
                  config={r}
                  subtext={srsSubtextForRating(currentCard.proficiency, r.rating)}
                  onRate={handleRating}
                  disabled={isSubmittingRating}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
