import { AlertCircle, ArrowLeft, Award, CheckCircle2, Eye, MessageSquareText } from "lucide-react";
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useResetWrittenAnswers,
  useSaveWrittenAnswerDraft,
  useSubmitWrittenAnswer,
  useUpdateWrittenQuestionsProgress,
  useWrittenQuestionSet,
} from "@/features/studio/services/writtenQuestionsApi";
import {
  selectPendingGradeIds,
  summarizeWrittenQuestions,
} from "@/features/studio/utils/writtenQuestionsScore";
import { WrittenQuestionAnswer, WrittenQuestionsNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

export interface WrittenQuestionsViewProps {
  note: WrittenQuestionsNote;
  onNoteUpdate?: (note: WrittenQuestionsNote) => void;
  onBack?: () => void;
}

// Idle value for the grade-on-Finish progress state. Must be reset between runs
// so a stale `failed` count can't leak the failure banner onto a later clean finish.
const GRADING_ALL_IDLE = { active: false, done: 0, total: 0, failed: 0, stopping: false };

export const WrittenQuestionsView: React.FC<WrittenQuestionsViewProps> = ({
  note,
  onNoteUpdate,
  onBack,
}) => {
  // Initialize currentIndex from note.metadata.lastViewedIndex if available
  const questions = note.questions || [];
  const initialIndex = (note.metadata as any)?.lastViewedIndex ?? 0;
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(initialIndex, Math.max(0, questions.length - 1))
  );
  const [userAnswers, setUserAnswers] = useState<Record<string, WrittenQuestionAnswer>>(
    note.userAnswers || {}
  );
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [gradingAll, setGradingAll] = useState<{
    active: boolean;
    done: number;
    total: number;
    failed: number;
    stopping: boolean;
  }>(GRADING_ALL_IDLE);

  // Hooks for mutations
  const submitAnswerMutation = useSubmitWrittenAnswer();
  const resetAnswersMutation = useResetWrittenAnswers();
  const saveDraftMutation = useSaveWrittenAnswerDraft();
  const latestNote = useWrittenQuestionSet(note.id);

  // Track if we've initialized the index from saved progress
  const hasInitializedIndex = useRef(false);
  // Set by the "Stop grading" button to end the grade-on-Finish loop early.
  const gradingCancelledRef = useRef(false);
  // Real re-entrancy guard for runGradeAllThenShowResults. A ref (not the
  // `gradingAll` state read from a stale render closure) so a double Finish
  // click fired before React re-renders can't launch two overlapping loops.
  const gradingRunRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedDraftRef = useRef<Record<string, string>>({});
  // Latest draft that has been scheduled but not yet persisted, so it can be
  // flushed (not just cancelled) on question change / unmount.
  const pendingDraftRef = useRef<{ questionId: string; answer: string } | null>(null);
  // Latest resolved question id, readable from effects without adding `questions`
  // / `currentIndex` to their dependency arrays.
  const currentQuestionIdRef = useRef<string | undefined>(questions[currentIndex]?.id);
  currentQuestionIdRef.current = questions[currentIndex]?.id;

  // Restore saved index on mount (from latestNote which has the latest data from server)
  useEffect(() => {
    if (!hasInitializedIndex.current && latestNote) {
      const savedIndex = (latestNote.metadata as any)?.lastViewedIndex ?? 0;
      const boundedIndex = Math.min(savedIndex, Math.max(0, questions.length - 1));
      if (savedIndex > 0) {
        setCurrentIndex(boundedIndex);
      }
      hasInitializedIndex.current = true;
    }
  }, [latestNote, questions.length]);

  // Persist progress - track last viewed index
  // Use useMemo to prevent re-initializing when other state changes
  const stableCurrentIndex = useMemo(() => currentIndex, [currentIndex]);
  useUpdateWrittenQuestionsProgress(note.id, stableCurrentIndex);

  // Sync userAnswers from server only when server data actually changes (e.g. after submit/reset).
  // Using a serialized key prevents the effect from running on every render (latestNote?.userAnswers
  // can get a new reference each time), which would overwrite local typing with server state.
  const serverUserAnswersKey = JSON.stringify(latestNote?.userAnswers ?? {});
  useEffect(() => {
    if (latestNote?.userAnswers) {
      const serverAnswers = latestNote.userAnswers;
      // Apply server state, but keep the local answer text for the question the
      // user is currently on, so the autosave's own server echo can't revert the
      // textarea / jump the cursor mid-typing. Grade fields still come from the
      // server for every question, including the current one.
      setUserAnswers((prev) => {
        const merged: Record<string, WrittenQuestionAnswer> = { ...serverAnswers };
        const curId = currentQuestionIdRef.current;
        if (curId && prev[curId] && merged[curId]) {
          merged[curId] = { ...merged[curId], answer: prev[curId].answer };
        }
        return merged;
      });
      // Seed the "already persisted" map so the autosave effect below does not
      // re-save answers that the server already has on the first render.
      const saved: Record<string, string> = {};
      for (const [qid, entry] of Object.entries(serverAnswers)) {
        saved[qid] = entry?.answer ?? "";
      }
      lastSavedDraftRef.current = saved;
    }
  }, [serverUserAnswersKey]);

  // Debounced autosave of the current question's typed answer (ungraded only),
  // so unsubmitted answers survive a reload. Mirrors useUpdateWrittenQuestionsProgress.
  const currentQuestionId = questions[currentIndex]?.id;
  const currentDraft = currentQuestionId ? (userAnswers[currentQuestionId]?.answer ?? "") : "";
  const currentDraftGraded = currentQuestionId
    ? userAnswers[currentQuestionId]?.graded === true
    : false;
  // Persist whatever draft is currently pending immediately. Used on question
  // change and unmount instead of only cancelling the debounce timer.
  const flushDraft = useCallback(() => {
    const pending = pendingDraftRef.current;
    if (!pending) return;
    if (lastSavedDraftRef.current[pending.questionId] === pending.answer) {
      pendingDraftRef.current = null;
      return;
    }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    lastSavedDraftRef.current[pending.questionId] = pending.answer;
    pendingDraftRef.current = null;
    void saveDraftMutation({
      writtenQuestionsId: note.id,
      questionId: pending.questionId,
      answer: pending.answer,
    }).catch((err) => console.error("Failed to flush answer draft:", err));
  }, [saveDraftMutation, note.id]);

  useEffect(() => {
    // Keep the pending-flush snapshot in sync with the latest state so a flush
    // (on nav / unmount) can never persist text the user has since retracted or
    // a question that has since been graded. A question with no saved draft and
    // an empty textarea has nothing worth persisting, so a missing entry is
    // treated as an empty string here and in the early-return guard below.
    if (currentQuestionId) {
      const alreadySaved = (lastSavedDraftRef.current[currentQuestionId] ?? "") === currentDraft;
      if (currentDraftGraded || alreadySaved) {
        if (pendingDraftRef.current?.questionId === currentQuestionId) {
          pendingDraftRef.current = null;
        }
      } else {
        pendingDraftRef.current = { questionId: currentQuestionId, answer: currentDraft };
      }
    }

    if (!currentQuestionId || currentDraftGraded) return;
    if ((lastSavedDraftRef.current[currentQuestionId] ?? "") === currentDraft) return;

    draftTimerRef.current = setTimeout(() => {
      lastSavedDraftRef.current[currentQuestionId] = currentDraft;
      pendingDraftRef.current = null;
      void saveDraftMutation({
        writtenQuestionsId: note.id,
        questionId: currentQuestionId,
        answer: currentDraft,
      }).catch((err) => console.error("Failed to autosave answer draft:", err));
    }, 800);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [currentQuestionId, currentDraft, currentDraftGraded, note.id, saveDraftMutation]);

  // Flush (not just cancel) the pending draft when the user navigates to another
  // question or the view unmounts within the debounce window. The cleanup fires
  // whenever currentQuestionId changes, i.e. right before the new question is
  // handled, or on unmount.
  useEffect(() => {
    const leavingQuestionId = currentQuestionId;
    return () => {
      if (leavingQuestionId) flushDraft();
    };
  }, [currentQuestionId, flushDraft]);

  const currentQuestion = questions[currentIndex];

  // If no questions, show empty state
  if (questions.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No questions available</p>
        </div>
      </div>
    );
  }

  const currentAnswer = userAnswers[currentQuestion.id]?.answer || "";
  const currentGradedResult = userAnswers[currentQuestion.id]?.graded
    ? {
        score: userAnswers[currentQuestion.id].score || 0,
        maxScore: userAnswers[currentQuestion.id].maxScore || 0,
        feedback: userAnswers[currentQuestion.id].feedback || "",
        strengths: userAnswers[currentQuestion.id].strengths || [],
        improvements: userAnswers[currentQuestion.id].improvements || [],
      }
    : undefined;

  // Check if current question is answered
  const isAnswered = currentAnswer.trim().length > 0;
  const isGraded = !!currentGradedResult;

  // Calculate total progress
  const answeredCount = Object.keys(userAnswers).filter(
    (qid) => userAnswers[qid]?.answer?.trim().length > 0
  ).length;
  const totalCount = questions.length;

  const handleSubmitAnswer = async () => {
    if (!isAnswered || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Submit answer for grading - now synchronous, returns graded result
      const result = await submitAnswerMutation({
        writtenQuestionsId: note.id,
        questionId: currentQuestion.id,
        answer: currentAnswer,
      });

      console.log("Grading complete:", result);

      // The useEffect will sync userAnswers from latestNote when the database updates
      // Just notify parent of the update
      if (latestNote && onNoteUpdate) {
        onNoteUpdate(latestNote);
      }
    } catch (error) {
      console.error("Failed to submit answer:", error);
      alert(error instanceof Error ? error.message : "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const runGradeAllThenShowResults = async () => {
    // Re-entrancy guard: a fast double Finish (double-click / double-tap /
    // Enter+click) must not launch two overlapping grade loops. The ref is
    // authoritative because it updates synchronously, unlike `gradingAll` read
    // from this render's closure.
    if (gradingRunRef.current) return;
    gradingRunRef.current = true;
    try {
      gradingCancelledRef.current = false;

      const pending = selectPendingGradeIds(questions, userAnswers);
      if (pending.length === 0) {
        setGradingAll(GRADING_ALL_IDLE);
        setShowResults(true);
        return;
      }

      setGradingAll({ active: true, done: 0, total: pending.length, failed: 0, stopping: false });
      let failed = 0;
      for (let i = 0; i < pending.length; i++) {
        // "Stop grading" was pressed — bail out and show partial results. Each
        // submitAnswerMutation call persists server-side, so a stopped or
        // reloaded run loses no completed grading: pressing Finish again resumes
        // the remainder because selectPendingGradeIds recomputes what is still
        // pending.
        if (gradingCancelledRef.current) break;
        const qid = pending[i];
        const answer = userAnswers[qid]?.answer ?? "";
        try {
          const res = await submitAnswerMutation({
            writtenQuestionsId: note.id,
            questionId: qid,
            answer,
          });
          setUserAnswers((prev) => ({
            ...prev,
            [qid]: {
              ...(prev[qid] || { answer: "" }),
              answer,
              graded: true,
              score: res.score,
              maxScore: res.maxScore,
            },
          }));
        } catch (err) {
          console.error("Failed to grade answer on finish:", err);
          failed += 1;
        }
        setGradingAll((s) => ({ ...s, done: i + 1, failed }));
      }

      // No onNoteUpdate call here: the reactive useWrittenQuestionSet query
      // already propagates the freshly-persisted grades to this view and to any
      // parent that subscribes. Passing `latestNote` would ship a stale
      // pre-grading snapshot captured when Finish was pressed.
      setShowResults(true);
    } finally {
      // Always clear the spinner and release the run guard, even if something
      // between iterations throws — otherwise the early-return grading screen
      // renders forever and a further Finish stays blocked by the run ref.
      setGradingAll((s) => ({ ...s, active: false, stopping: false }));
      gradingRunRef.current = false;
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      void runGradeAllThenShowResults();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleAnswerChange = (answer: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...(prev[currentQuestion.id] || { answer: "", graded: false }),
        answer,
      },
    }));
  };

  const resetQuestions = async () => {
    setIsResetting(true);
    try {
      // Call API to reset all answers on the server
      await resetAnswersMutation(note.id);
      // Reset local state
      setCurrentIndex(0);
      setShowResults(false);
      setReviewMode(false);
      setUserAnswers({});
      setGradingAll(GRADING_ALL_IDLE);
      // Notify parent to refresh note
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

  const reviewAnswers = () => {
    setCurrentIndex(0);
    setShowResults(false);
    setReviewMode(true);
  };

  if (gradingAll.active) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-center space-y-4" role="status" aria-live="polite">
          <div
            className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">
            Grading your answers… {gradingAll.done} of {gradingAll.total}
          </p>
          <button
            type="button"
            onClick={() => {
              gradingCancelledRef.current = true;
              // Reflect the stop in render state right away; the loop only
              // notices at the top of its next iteration, which can be tens of
              // seconds out with real grading in flight.
              setGradingAll((s) => ({ ...s, stopping: true }));
            }}
            disabled={gradingAll.stopping}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {gradingAll.stopping ? "Stopping…" : "Stop grading"}
          </button>
        </div>
      </div>
    );
  }

  if (showResults) {
    // `totalCount` is the outer `questions.length` — same value the summary reports.
    const { score, maxScore, gradedCount, percentage } = summarizeWrittenQuestions(
      questions,
      userAnswers
    );

    return (
      <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center space-y-6 max-w-md w-full bg-card p-10 rounded-2xl border border-border shadow-lg">
          <div className="w-20 h-20 bg-primary/10 rounded-xl flex items-center justify-center mx-auto text-primary">
            <Award className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-serif mb-2">Assessment Complete!</h3>
            <p className="text-muted-foreground">
              You scored {score} out of {maxScore} points
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Graded {gradedCount} of {totalCount} questions
            </p>
            {gradedCount < totalCount && (
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                Ungraded questions count as 0.
              </p>
            )}
            {gradingAll.failed > 0 && (
              <p className="text-xs text-vintage-orange-700 dark:text-vintage-orange-300 mt-0.5">
                {gradingAll.failed} answer(s) couldn't be graded — press Finish again to retry.
              </p>
            )}
          </div>
          <div className="w-full bg-secondary rounded-xl h-3 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-1000 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="text-sm text-muted-foreground">{percentage}%</div>
          <div className="flex gap-3">
            <button
              onClick={reviewAnswers}
              className="flex-1 py-3 bg-secondary text-secondary-foreground font-bold rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Review
            </button>
            <button
              onClick={resetQuestions}
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
      <div className="flex-1 bg-card border-t border-border min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full min-h-full p-8 md:p-12 flex flex-col">
          {/* Review Mode Banner */}
          {reviewMode && (
            <div className="mb-6 p-4 bg-vintage-amber-50 dark:bg-vintage-amber-900/20 border border-vintage-amber-200 dark:border-vintage-amber-800 rounded-xl flex items-center gap-3">
              <Eye className="w-5 h-5 text-vintage-amber-700 dark:text-vintage-amber-300 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-vintage-amber-800 dark:text-vintage-amber-200">
                  Review Mode
                </span>
                <p className="text-xs text-vintage-amber-700 dark:text-vintage-amber-300">
                  You are viewing your previous answers. Editing is disabled.
                </p>
              </div>
            </div>
          )}

          {/* Progress Header */}
          <div className="mb-8">
            <div className="flex justify-between text-xs md:text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 font-sans">
              <span>Question {currentIndex + 1}</span>
              <span>
                {answeredCount} of {totalCount} Answered
              </span>
            </div>
            <div className="w-full bg-secondary/50 rounded-xl h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question Type Badge */}
          <div className="mb-4">
            {currentQuestion.questionType === "short" ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary text-foreground border border-border">
                <MessageSquareText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide">SHORT ANSWER</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary text-foreground border border-border">
                <MessageSquareText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide">ESSAY</span>
                <span className="text-xs font-semibold text-muted-foreground ml-1">
                  {currentQuestion.rubric.maxPoints} pts
                </span>
              </div>
            )}
          </div>

          {/* Question */}
          <div className="w-full prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed text-foreground mb-6 text-lg md:text-xl">
            <Suspense
              fallback={<div className="animate-pulse h-5 bg-secondary/30 rounded w-full" />}
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

          {/* Answer Input or Graded Result */}
          {!isGraded ? (
            <div className="flex-1 flex flex-col min-h-0">
              <textarea
                value={currentAnswer}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder={
                  currentQuestion.questionType === "short"
                    ? "Type your short answer here (1-3 sentences)..."
                    : "Type your detailed answer here..."
                }
                disabled={reviewMode}
                className={`flex-1 w-full bg-background border-2 rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/40 ${
                  isAnswered ? "border-primary" : "border-border"
                } ${reviewMode ? "opacity-70 cursor-not-allowed bg-muted/30" : ""}`}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 font-mono shrink-0">
                <span>{currentAnswer.length} characters</span>
                <span>{currentAnswer.split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
          ) : (
            /* Graded Result Display */
            <div className="flex-1 space-y-4">
              {/* Score Banner */}
              <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                    <div>
                      <span className="text-sm font-semibold text-primary">Answer Graded</span>
                      <div className="text-2xl font-bold text-primary mt-0.5">
                        {currentGradedResult.score} / {currentGradedResult.maxScore}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Score</div>
                    <div className="text-lg font-bold text-foreground">
                      {currentGradedResult.maxScore > 0
                        ? Math.round(
                            (currentGradedResult.score / currentGradedResult.maxScore) * 100
                          )
                        : 0}
                      %
                    </div>
                  </div>
                </div>
              </div>

              {/* Your Answer */}
              <div className="p-4 bg-secondary/30 rounded-xl border border-border">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Your Answer
                </span>
                <div className="mt-2 text-base leading-relaxed text-foreground whitespace-pre-wrap font-serif">
                  {userAnswers[currentQuestion.id]?.answer || ""}
                </div>
              </div>

              {/* Feedback */}
              <div className="p-4 bg-vintage-blue-50 dark:bg-vintage-blue-50 rounded-xl border border-vintage-blue-200 dark:border-vintage-blue-200">
                <span className="text-sm font-bold uppercase tracking-wide text-vintage-blue-700 dark:text-vintage-blue-700">
                  Feedback
                </span>
                <div className="mt-2 text-base leading-relaxed text-vintage-blue-700 dark:text-vintage-blue-700">
                  {currentGradedResult.feedback}
                </div>
              </div>

              {/* Strengths */}
              {currentGradedResult.strengths && currentGradedResult.strengths.length > 0 && (
                <div className="p-4 bg-vintage-green-50 dark:bg-vintage-green-50 rounded-xl border border-vintage-green-200 dark:border-vintage-green-200">
                  <span className="text-sm font-bold uppercase tracking-wide text-vintage-green-700 dark:text-vintage-green-700">
                    Strengths
                  </span>
                  <ul className="mt-2 space-y-2">
                    {currentGradedResult.strengths.map((strength, idx) => (
                      <li
                        key={idx}
                        className="text-base text-vintage-green-700 dark:text-vintage-green-700 flex items-start gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-1" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvements */}
              {currentGradedResult.improvements && currentGradedResult.improvements.length > 0 && (
                <div className="p-4 bg-vintage-orange-50 dark:bg-vintage-orange-50 rounded-xl border border-vintage-orange-200 dark:border-vintage-orange-200">
                  <span className="text-sm font-bold uppercase tracking-wide text-vintage-orange-700 dark:text-vintage-orange-700">
                    Areas for Improvement
                  </span>
                  <ul className="mt-2 space-y-2">
                    {currentGradedResult.improvements.map((improvement, idx) => (
                      <li
                        key={idx}
                        className="text-base text-vintage-orange-700 dark:text-vintage-orange-700 flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0 mt-1" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="shrink-0 p-4 md:px-12 md:py-6 border-t border-border bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0 || gradingAll.active}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={gradingAll.active}
              className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-md active:translate-y-0.5 min-w-[100px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentIndex === questions.length - 1 ? "Finish" : "Next"}
            </button>
          </div>

          {!isGraded && !reviewMode && (
            <button
              onClick={handleSubmitAnswer}
              disabled={!isAnswered || isSubmitting || gradingAll.active}
              className="px-6 py-2 bg-vintage-green-600 hover:bg-vintage-green-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:translate-y-0.5 min-w-[100px] disabled:opacity-50 disabled:hover:bg-vintage-green-600 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Grading...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Submit
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
