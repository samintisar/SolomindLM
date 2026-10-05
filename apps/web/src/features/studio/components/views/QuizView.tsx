import { ArrowLeft, Eye, Info, Lightbulb, RotateCcw } from "lucide-react";
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useQuiz,
  useResetQuizAnswers,
  useSubmitQuizAnswer,
  useUpdateQuizProgress,
} from "@/features/studio/services/quizzesApi";
import type { MarkdownRendererProps } from "@/shared/components/MarkdownRenderer.utils";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Spinner } from "@/shared/components/ui/spinner";
import { QuizNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";
import { cn } from "@/shared/utils/cn";
import {
  normalizeStoredQuizQuestion,
  stripQuizOptionLabel,
  toDisplayPick,
} from "@/shared/utils/quizOptionLabels";
import { useStreak } from "../../motion/useStreak";
import { QuestionProgress } from "../practice/QuestionProgress";
import { type OptionState, QuizOption } from "../practice/QuizOption";
import { ResultsSummary } from "../practice/ResultsSummary";
import { StreakChip } from "../practice/StreakChip";
import type { QuestionState } from "../practice/types";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

// Generated content may carry tables; links, media and embeds are dropped.
const contentComponents: MarkdownRendererProps["components"] = {
  img: () => null,
  a: ({ children }) => <span>{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }) => (
    <table className="w-full border-collapse overflow-hidden rounded-lg border border-border">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border px-4 py-2 text-left font-semibold last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border px-4 py-2 last:border-r-0">{children}</td>
  ),
};

// Options read inline: paragraphs collapse to spans.
const optionComponents: MarkdownRendererProps["components"] = {
  ...contentComponents,
  p: ({ children }) => <span className="font-medium">{children}</span>,
};

export interface QuizViewProps {
  note: QuizNote;
  onNoteUpdate?: (note: QuizNote) => void;
  onBack?: () => void;
}

export const QuizView: React.FC<QuizViewProps> = ({ note, onNoteUpdate, onBack }) => {
  // Initialize currentIndex from note.metadata.lastViewedIndex if available
  const initialIndex = (note.metadata as any)?.lastViewedIndex ?? 0;
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(initialIndex, Math.max(0, note.questions.length - 1))
  );
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>(note.userAnswers || {});
  const [showResults, setShowResults] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const submitAnswer = useSubmitQuizAnswer();
  const resetAnswers = useResetQuizAnswers();
  const latestNote = useQuiz(note.id);

  // Track if we've initialized the index from saved progress
  const hasInitializedIndex = useRef(false);

  // Restore saved index on mount (from latestNote which has the latest data from server)
  useEffect(() => {
    if (!hasInitializedIndex.current && latestNote) {
      const savedIndex = (latestNote.metadata as any)?.lastViewedIndex ?? 0;
      const boundedIndex = Math.min(savedIndex, Math.max(0, note.questions.length - 1));
      if (savedIndex > 0) {
        setCurrentIndex(boundedIndex);
      }
      hasInitializedIndex.current = true;
    }
  }, [latestNote, note.questions.length]);

  // Persist progress - track last viewed index
  // Use useMemo to prevent re-initializing when other state changes
  const stableCurrentIndex = useMemo(() => currentIndex, [currentIndex]);
  useUpdateQuizProgress(note.id, stableCurrentIndex);

  // Sync userAnswers with note.userAnswers
  // Using a serialized key prevents the effect from running on every render
  const serverUserAnswersKey = JSON.stringify(latestNote?.userAnswers ?? {});
  useEffect(() => {
    if (latestNote?.userAnswers) {
      setUserAnswers(latestNote.userAnswers);
    }
  }, [serverUserAnswersKey]);

  const questions = note.questions;
  const currentQuestion = questions[currentIndex];
  const displayQuestion = useMemo(
    () => normalizeStoredQuizQuestion(currentQuestion),
    [currentQuestion]
  );
  const selectedForDisplay = useMemo(() => {
    const u = userAnswers[currentIndex];
    if (u === undefined) return null;
    if (currentQuestion.options.length === 5 && u === 4) return 3;
    if (u >= displayQuestion.options.length) return displayQuestion.options.length - 1;
    return u;
  }, [userAnswers, currentIndex, currentQuestion, displayQuestion.options.length]);

  // Derived state
  const isAnswered = userAnswers[currentIndex] !== undefined;

  const { streak, record, reset: resetStreak, restore: restoreStreak } = useStreak();
  // The option just answered correctly on this question: plays its pop and burst once.
  const [celebrated, setCelebrated] = useState<{ question: number; option: number } | null>(null);
  // Spoken after the learner answers (never on a restored or review view).
  const [announcement, setAnnouncement] = useState("");
  // Set when the learner answers; the effect below moves focus to Next once it has remounted.
  const focusNextPending = useRef(false);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusNextPending.current && isAnswered) {
      focusNextPending.current = false;
      nextButtonRef.current?.focus({ preventScroll: true });
    }
  }, [isAnswered, currentIndex]);

  const questionStates = useMemo<Array<QuestionState | undefined>>(
    () =>
      questions.map((question, position) => {
        const picked = userAnswers[position];
        if (picked === undefined) return undefined;
        const correct =
          toDisplayPick(question, picked) === normalizeStoredQuizQuestion(question).answer;
        return correct ? "correct" : "incorrect";
      }),
    [questions, userAnswers]
  );
  const score = questionStates.filter((state) => state === "correct").length;

  const handleSelect = async (index: number) => {
    if (isAnswered || reviewMode) return;

    // Update local state immediately for responsiveness
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: index }));
    const correct = index === displayQuestion.answer;
    const streakBefore = streak;
    record(correct);
    if (correct) setCelebrated({ question: currentIndex, option: index });
    setAnnouncement(correct ? "Correct." : "Incorrect. The correct answer is marked.");
    focusNextPending.current = true;

    // Submit to server in the background
    try {
      await submitAnswer(note.id, currentIndex, index);
      // Notify parent of the update (syncs with notes list)
      if (latestNote && onNoteUpdate) {
        onNoteUpdate(latestNote);
      }
    } catch (error) {
      console.error("Failed to submit answer:", error);
      // Revert the local state on error
      setUserAnswers((prev) => {
        const newState = { ...prev };
        delete newState[currentIndex];
        return newState;
      });
      setAnnouncement("");
      setCelebrated(null);
      // The answer never counted: put the streak back to what it was before it.
      restoreStreak(streakBefore);
    }
  };

  const handleNext = () => {
    setShowHint(false);
    setAnnouncement("");
    setCelebrated(null);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrev = () => {
    setShowHint(false);
    setAnnouncement("");
    setCelebrated(null);
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const resetQuiz = async () => {
    setIsResetting(true);
    try {
      // Call API to reset all answers on the server (also resets lastViewedIndex)
      await resetAnswers(note.id);
      // Reset local state
      setCurrentIndex(0);
      setUserAnswers({});
      setShowResults(false);
      setShowHint(false);
      setReviewMode(false);
      setCelebrated(null);
      setAnnouncement("");
      resetStreak();
      // Notify parent of the update
      if (latestNote && onNoteUpdate) {
        onNoteUpdate(latestNote);
      }
    } catch (error) {
      console.error("Failed to reset answers:", error);
      alert(error instanceof Error ? error.message : "Failed to reset answers");
    } finally {
      setIsResetting(false);
    }
  };

  const reviewQuestion = (position: number) => {
    setCurrentIndex(position);
    setShowResults(false);
    setReviewMode(true);
    setShowHint(false);
    setAnnouncement("");
    setCelebrated(null);
  };

  const optionState = (position: number): OptionState => {
    if (!isAnswered && !reviewMode) return "idle";
    if (position === displayQuestion.answer) return "correct";
    if (position === selectedForDisplay) return "incorrect";
    return "dimmed";
  };

  if (questions.length === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center">
        <p className="font-serif italic text-muted-foreground">No questions available</p>
      </div>
    );

  if (showResults) {
    return (
      <ResultsSummary
        title="Quiz Complete!"
        fraction={score / questions.length}
        value={score}
        caption={`of ${questions.length}`}
        questions={questionStates.map((state, position) => ({
          state,
          onReview: () => reviewQuestion(position),
        }))}
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => reviewQuestion(0)}>
              <Eye />
              Review
            </Button>
            <Button className="flex-1" onClick={resetQuiz} disabled={isResetting}>
              {isResetting ? <Spinner /> : <RotateCcw />}
              {isResetting ? "Resetting…" : "Try Again"}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">
          You scored {score} out of {questions.length}
        </p>
      </ResultsSummary>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {onBack && (
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/80 p-4 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold text-foreground">{note.title}</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto bg-card">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 md:p-12">
          {reviewMode && (
            <Alert variant="warning" role="note">
              <Eye />
              <AlertTitle>Review Mode</AlertTitle>
              <AlertDescription>
                You are viewing your previous answers. Selection is disabled.
              </AlertDescription>
            </Alert>
          )}

          <QuestionProgress
            currentIndex={currentIndex}
            states={questionStates}
            trailing={<StreakChip streak={streak} />}
          />

          <div
            key={currentIndex}
            className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <div className="prose max-w-none font-serif text-lg leading-relaxed text-foreground md:text-2xl">
              <Suspense
                fallback={<div className="h-6 w-full animate-pulse rounded bg-secondary/30" />}
              >
                <MarkdownRenderer components={contentComponents}>
                  {sanitizeMarkdown(currentQuestion.question)}
                </MarkdownRenderer>
              </Suspense>
            </div>

            <div className="space-y-3">
              {displayQuestion.options.map((option, idx) => (
                <QuizOption
                  key={idx}
                  position={idx}
                  state={optionState(idx)}
                  disabled={isAnswered || reviewMode}
                  celebrate={celebrated?.question === currentIndex && celebrated.option === idx}
                  onSelect={() => handleSelect(idx)}
                >
                  <span className="prose block max-w-none font-serif text-base md:text-lg">
                    <Suspense
                      fallback={
                        <span className="block h-5 w-full animate-pulse rounded bg-secondary/30" />
                      }
                    >
                      <MarkdownRenderer components={optionComponents}>
                        {sanitizeMarkdown(stripQuizOptionLabel(option))}
                      </MarkdownRenderer>
                    </Suspense>
                  </span>
                </QuizOption>
              ))}
            </div>

            {isAnswered && (
              <div className="flex items-start gap-3 rounded-xl bg-info-muted p-5 text-info-muted-foreground animate-in fade-in slide-in-from-top-2 duration-300">
                <Info aria-hidden className="mt-1 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-xs font-bold uppercase tracking-wide">Explanation</p>
                  <div className="prose mt-2 max-w-none wrap-break-word text-base leading-relaxed">
                    <Suspense
                      fallback={
                        <div className="h-4 w-full animate-pulse rounded bg-secondary/30" />
                      }
                    >
                      <MarkdownRenderer components={contentComponents}>
                        {sanitizeMarkdown(currentQuestion.explanation)}
                      </MarkdownRenderer>
                    </Suspense>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="z-10 shrink-0 border-t border-border bg-background/80 p-4 backdrop-blur-md md:px-12 md:py-6">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          {reviewMode ? (
            <span />
          ) : (
            <Popover open={showHint} onOpenChange={setShowHint}>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Lightbulb />
                  Hint
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start">
                <p className="mb-1 font-sans text-xs font-bold uppercase tracking-wide text-primary">
                  Hint
                </p>
                <p className="text-sm leading-relaxed">
                  {currentQuestion.hint || "Try to recall the definition from your notes."}
                </p>
              </PopoverContent>
            </Popover>
          )}
          <span
            key={score}
            className="font-sans text-xs font-semibold tabular-nums text-muted-foreground animate-studio-pop"
          >
            Score {score}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentIndex === 0}>
              Previous
            </Button>
            <span
              className={cn("inline-flex", isAnswered && !reviewMode && "animate-studio-nudge")}
            >
              <Button ref={nextButtonRef} size="sm" className="min-w-25" onClick={handleNext}>
                {currentIndex === questions.length - 1 ? "Finish" : "Next"}
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
