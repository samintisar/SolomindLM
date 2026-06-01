import {
  ArrowLeft,
  CheckCircle2,
  ChevronUp,
  Eye,
  Info,
  Lightbulb,
  Sparkles,
  XCircle,
} from "lucide-react";
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useQuiz,
  useResetQuizAnswers,
  useSubmitQuizAnswer,
  useUpdateQuizProgress,
} from "@/features/studio/services/quizzesApi";
import { QuizNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";
import { normalizeStoredQuizQuestion, stripQuizOptionLabel } from "@/shared/utils/quizOptionLabels";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

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

  const handleSelect = async (index: number) => {
    if (isAnswered || reviewMode) return;

    // Update local state immediately for responsiveness
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: index }));

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
    }
  };

  const handleNext = () => {
    setShowHint(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrev = () => {
    setShowHint(false);
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

  const reviewQuiz = () => {
    setCurrentIndex(0);
    setShowResults(false);
    setReviewMode(true);
    setShowHint(false);
  };

  if (questions.length === 0)
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <p className="text-muted-foreground font-serif italic">No questions available</p>
      </div>
    );

  if (showResults) {
    const score = Object.entries(userAnswers).reduce((acc, [qIdx, aIdx]) => {
      return acc + (questions[parseInt(qIdx)].answer === aIdx ? 1 : 0);
    }, 0);

    return (
      <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center space-y-6 max-w-md w-full bg-card p-10 rounded-2xl border border-border shadow-lg">
          <div className="w-20 h-20 bg-primary/10 rounded-xl flex items-center justify-center mx-auto text-primary">
            <Sparkles className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-serif mb-2">Quiz Complete!</h3>
            <p className="text-muted-foreground">
              You scored {score} out of {questions.length}
            </p>
          </div>
          <div className="w-full bg-secondary rounded-xl h-3 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-1000 ease-out"
              style={{ width: `${(score / questions.length) * 100}%` }}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={reviewQuiz}
              className="flex-1 py-3 bg-secondary text-secondary-foreground font-bold rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Review
            </button>
            <button
              onClick={resetQuiz}
              disabled={isResetting}
              className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isResetting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Resetting...
                </>
              ) : (
                "Try Again"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300 relative">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{note.title}</span>
        </div>
      )}
      <div className="flex-1 bg-card border-t border-border">
        <div className="max-w-2xl mx-auto w-full p-8 md:p-12 flex flex-col">
          {/* Review Mode Banner */}
          {reviewMode && (
            <div className="mb-6 p-4 bg-vintage-amber-50 dark:bg-vintage-amber-900/20 border border-vintage-amber-200 dark:border-vintage-amber-800 rounded-xl flex items-center gap-3">
              <Eye className="w-5 h-5 text-vintage-amber-700 dark:text-vintage-amber-300 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-vintage-amber-800 dark:text-vintage-amber-200">
                  Review Mode
                </span>
                <p className="text-xs text-vintage-amber-700 dark:text-vintage-amber-300">
                  You are viewing your previous answers. Selection is disabled.
                </p>
              </div>
            </div>
          )}

          <div className="mb-8">
            <div className="flex justify-between text-xs md:text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 font-sans">
              <span>Question {currentIndex + 1}</span>
              <span>{questions.length} Total</span>
            </div>
            <div className="w-full bg-secondary/50 rounded-xl h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="w-full prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed text-foreground mb-10 text-lg md:text-2xl">
            <Suspense
              fallback={<div className="animate-pulse h-6 bg-secondary/30 rounded w-full" />}
            >
              <MarkdownRenderer
                components={{
                  img: () => null,
                  a: ({ children }) => <span className="text-foreground">{children}</span>,
                  video: () => null,
                  audio: () => null,
                  iframe: () => null,
                  table: ({ children }) => (
                    <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
                      {children}
                    </table>
                  ),
                  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                  th: ({ children }) => (
                    <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">
                      {children}
                    </td>
                  ),
                }}
              >
                {sanitizeMarkdown(currentQuestion.question)}
              </MarkdownRenderer>
            </Suspense>
          </div>

          <div className="space-y-4 flex-1 pb-10">
            {displayQuestion.options.map((option, idx) => {
              let stateStyles = "border-border hover:bg-secondary/50 hover:border-primary/50";
              const isCorrect = idx === displayQuestion.answer;
              const isIncorrectSelection =
                idx === selectedForDisplay && idx !== displayQuestion.answer;

              if (reviewMode || isAnswered) {
                if (isCorrect) {
                  stateStyles =
                    "bg-vintage-green-50 dark:bg-vintage-green-50 border-vintage-green-600 dark:border-vintage-green-200 text-vintage-green-700 dark:text-vintage-green-700";
                } else if (isIncorrectSelection) {
                  stateStyles =
                    "bg-vintage-red-50 dark:bg-vintage-red-50 border-vintage-red-600 dark:border-vintage-red-200 text-vintage-red-700 dark:text-vintage-red-700";
                } else {
                  stateStyles = "opacity-50 border-border";
                }
              } else if (selectedForDisplay === idx) {
                stateStyles = "border-primary bg-primary/5";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={isAnswered || reviewMode}
                  className={`w-full text-left p-5 md:p-6 rounded-xl border-2 transition-all flex items-center justify-between group ${stateStyles} ${reviewMode ? "cursor-not-allowed" : ""}`}
                >
                  <div className="flex-1 prose prose-stone dark:prose-invert max-w-none font-serif text-base md:text-lg">
                    <Suspense
                      fallback={
                        <div className="animate-pulse h-5 bg-secondary/30 rounded w-full" />
                      }
                    >
                      <MarkdownRenderer
                        components={{
                          img: () => null,
                          a: ({ children }) => <span className="text-foreground">{children}</span>,
                          video: () => null,
                          audio: () => null,
                          iframe: () => null,
                          table: ({ children }) => (
                            <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
                              {children}
                            </table>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-secondary/50">{children}</thead>
                          ),
                          tbody: ({ children }) => <tbody>{children}</tbody>,
                          tr: ({ children }) => (
                            <tr className="border-b border-border">{children}</tr>
                          ),
                          th: ({ children }) => (
                            <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">
                              {children}
                            </td>
                          ),
                          p: ({ children }) => <span className="font-medium">{children}</span>,
                        }}
                      >
                        {sanitizeMarkdown(stripQuizOptionLabel(option))}
                      </MarkdownRenderer>
                    </Suspense>
                  </div>
                  {isAnswered && idx === displayQuestion.answer && (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  )}
                  {isAnswered && idx === selectedForDisplay && idx !== displayQuestion.answer && (
                    <XCircle className="w-5 h-5 text-destructive" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation shown after answering */}
          {isAnswered && (
            <div className="mt-6 p-5 bg-vintage-blue-50 dark:bg-vintage-blue-50 rounded-xl border border-vintage-blue-200 dark:border-vintage-blue-200 animate-in fade-in slide-in-from-bottom-2 overflow-hidden">
              <div className="flex items-start gap-3 min-w-0">
                <Info className="w-6 h-6 shrink-0 mt-1 text-vintage-blue-700 dark:text-vintage-blue-700" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-base text-vintage-blue-700 dark:text-vintage-blue-700">
                    Explanation
                  </span>
                  <div className="text-base mt-2 leading-relaxed prose prose-base prose-stone dark:prose-invert max-w-none wrap-break-word text-vintage-blue-700 dark:text-vintage-blue-700">
                    <Suspense
                      fallback={
                        <div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />
                      }
                    >
                      <MarkdownRenderer
                        components={{
                          img: () => null,
                          a: ({ children }) => (
                            <span className="text-vintage-blue-700 dark:text-vintage-blue-700">
                              {children}
                            </span>
                          ),
                          video: () => null,
                          audio: () => null,
                          iframe: () => null,
                          table: ({ children }) => (
                            <table className="w-full border-collapse border border-vintage-blue-300 dark:border-vintage-blue-300 rounded-lg overflow-hidden">
                              {children}
                            </table>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-vintage-blue-200/50 dark:bg-vintage-blue-200/50">
                              {children}
                            </thead>
                          ),
                          tbody: ({ children }) => <tbody>{children}</tbody>,
                          tr: ({ children }) => (
                            <tr className="border-b border-vintage-blue-300 dark:border-vintage-blue-300">
                              {children}
                            </tr>
                          ),
                          th: ({ children }) => (
                            <th className="px-4 py-2 text-left font-semibold border-r border-vintage-blue-300 dark:border-vintage-blue-300 last:border-r-0 text-vintage-blue-700 dark:text-vintage-blue-700">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-4 py-2 border-r border-vintage-blue-300 dark:border-vintage-blue-300 last:border-r-0 text-vintage-blue-700 dark:text-vintage-blue-700">
                              {children}
                            </td>
                          ),
                          p: ({ children }) => (
                            <p className="text-base wrap-break-word text-vintage-blue-700 dark:text-vintage-blue-700">
                              {children}
                            </p>
                          ),
                        }}
                      >
                        {sanitizeMarkdown(currentQuestion.explanation)}
                      </MarkdownRenderer>
                    </Suspense>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 p-4 md:px-12 md:py-6 border-t border-border bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
          {!reviewMode && (
            <div className="relative">
              <button
                onClick={() => setShowHint(!showHint)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/50 hover:bg-secondary text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
              >
                <Lightbulb className="w-4 h-4" />
                <span>Hint</span>
                <ChevronUp
                  className={`w-3 h-3 transition-transform ${showHint ? "rotate-180" : ""}`}
                />
              </button>
              {showHint && (
                <div className="absolute bottom-full left-0 mb-3 w-72 p-4 bg-popover border border-border rounded-xl shadow-xl text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 z-20">
                  <span className="font-bold block mb-1 text-xs uppercase tracking-wide text-primary">
                    Hint
                  </span>
                  {currentQuestion.hint || "Try to recall the definition from your notes."}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-md active:translate-y-0.5 min-w-[100px]"
            >
              {currentIndex === questions.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
