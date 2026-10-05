import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { Spinner } from "@/shared/components/ui/spinner";
import { WrittenQuestionAnswer, WrittenQuestionsNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";
import { cn } from "@/shared/utils/cn";
import { Burst } from "../../motion/Burst";
import { useCountUp } from "../../motion/useCountUp";
import { useStreak } from "../../motion/useStreak";
import { QuestionProgress } from "../practice/QuestionProgress";
import { ResultsSummary } from "../practice/ResultsSummary";
import { StreakChip } from "../practice/StreakChip";
import type { QuestionState } from "../practice/types";

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

/** "7 / 10", counting up when a grade has just arrived (duration 0 shows it at once). */
function GradedScore({
  score,
  maxScore,
  duration,
}: {
  score: number;
  maxScore: number;
  duration: number;
}) {
  const shown = useCountUp(score, duration);
  return (
    <>
      {shown} / {maxScore}
    </>
  );
}

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
  const { streak, record, reset: resetStreak } = useStreak();
  // The question whose grade just arrived: its score counts up, and bursts on full marks.
  const [justGraded, setJustGraded] = useState<{ id: string; fullMarks: boolean } | null>(null);
  // Spoken after a grade arrives (never on a restored or review view).
  const [announcement, setAnnouncement] = useState("");
  const nextButtonRef = useRef<HTMLButtonElement>(null);

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
  // Latest server note, readable from the async grade-on-Finish loop (whose
  // closure captured a pre-grading `latestNote`) so freshly-graded feedback can
  // be merged instead of leaving empty feedback panels until the reactive echo.
  const latestNoteRef = useRef(latestNote);
  latestNoteRef.current = latestNote;

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
      // Re-check against the persisted map: the server-sync effect can seed
      // lastSavedDraftRef after this timer was scheduled (deps unchanged, so the
      // effect never re-runs to clear it), and we must not re-save identical text.
      if ((lastSavedDraftRef.current[currentQuestionId] ?? "") === currentDraft) return;
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
  const questionStates: Array<QuestionState | undefined> = questions.map((question) => {
    const entry = userAnswers[question.id];
    if (!entry?.answer?.trim()) return undefined;
    if (!entry.graded) return "answered";
    const max = entry.maxScore ?? 0;
    const got = entry.score ?? 0;
    if (max > 0 && got >= max) return "correct";
    return got > 0 ? "partial" : "incorrect";
  });

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

      const fullMarks = result.maxScore > 0 && result.score >= result.maxScore;
      record(fullMarks);
      setJustGraded({ id: currentQuestion.id, fullMarks });
      setAnnouncement(`Graded: ${result.score} of ${result.maxScore} points.`);
      // Submit is about to disappear; keep keyboard focus on the way forward.
      nextButtonRef.current?.focus({ preventScroll: true });

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
          setUserAnswers((prev) => {
            // submitAndGrade persists the full graded result (feedback, strengths,
            // improvements) server-side before returning, so prefer the server
            // echo for this question when it has already landed; fall back to any
            // prior grade fields, then apply the fresh score.
            const serverEntry = latestNoteRef.current?.userAnswers?.[qid];
            return {
              ...prev,
              [qid]: {
                ...(prev[qid] || { answer: "" }),
                ...(serverEntry ?? {}),
                answer,
                graded: true,
                score: res.score,
                maxScore: res.maxScore,
              },
            };
          });
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
    setJustGraded(null);
    setAnnouncement("");
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      void runGradeAllThenShowResults();
    }
  };

  const handlePrev = () => {
    setJustGraded(null);
    setAnnouncement("");
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
      resetStreak();
      setJustGraded(null);
      setAnnouncement("");
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
    setJustGraded(null);
    setAnnouncement("");
    setCurrentIndex(0);
    setShowResults(false);
    setReviewMode(true);
  };

  const reviewQuestion = (position: number) => {
    setJustGraded(null);
    setAnnouncement("");
    setCurrentIndex(position);
    setShowResults(false);
    setReviewMode(true);
  };

  if (gradingAll.active) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div
          className="flex flex-col items-center gap-4 text-center"
          role="status"
          aria-live="polite"
        >
          <span className="text-primary" aria-hidden="true">
            <Spinner className="size-8" />
          </span>
          <p className="text-muted-foreground">
            Grading your answers… {gradingAll.done} of {gradingAll.total}
          </p>
          <Progress
            value={gradingAll.total > 0 ? (gradingAll.done / gradingAll.total) * 100 : null}
            size="sm"
            glint
            aria-label="Grading progress"
            className="w-48"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              gradingCancelledRef.current = true;
              // Reflect the stop in render state right away; the loop only
              // notices at the top of its next iteration, which can be tens of
              // seconds out with real grading in flight.
              setGradingAll((s) => ({ ...s, stopping: true }));
            }}
            disabled={gradingAll.stopping}
          >
            {gradingAll.stopping ? "Stopping…" : "Stop grading"}
          </Button>
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
      <ResultsSummary
        title="Assessment Complete!"
        fraction={percentage / 100}
        value={percentage}
        valueSuffix="%"
        questions={questionStates.map((state, position) => ({
          state,
          onReview: () => reviewQuestion(position),
        }))}
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={reviewAnswers}>
              <Eye />
              Review
            </Button>
            <Button className="flex-1" onClick={resetQuestions} disabled={isResetting}>
              {isResetting ? <Spinner /> : <RotateCcw />}
              {isResetting ? "Resetting…" : "Try Again"}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">
          You scored {score} out of {maxScore} points
        </p>
        <p className="text-xs text-muted-foreground">
          Graded {gradedCount} of {totalCount} questions
        </p>
        {gradedCount < totalCount && (
          <p className="text-xs text-muted-foreground">Ungraded questions count as 0.</p>
        )}
        {gradingAll.failed > 0 && (
          <p className="text-xs text-warning-muted-foreground">
            {gradingAll.failed} answer(s) couldn't be graded — press Finish again to retry.
          </p>
        )}
      </ResultsSummary>
    );
  }

  const isFreshGrade = justGraded?.id === currentQuestion.id;

  return (
    <div className="relative flex h-full flex-col bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/80 p-4 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold text-foreground">{note.title}</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto bg-card">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col p-8 md:p-12">
          {/* Review Mode Banner */}
          {reviewMode && (
            <Alert variant="warning" role="note" className="mb-6">
              <Eye />
              <AlertTitle>Review Mode</AlertTitle>
              <AlertDescription>
                You are viewing your previous answers. Editing is disabled.
              </AlertDescription>
            </Alert>
          )}

          {/* Progress Header */}
          <div className="mb-8">
            <QuestionProgress
              currentIndex={currentIndex}
              states={questionStates}
              trailing={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="whitespace-nowrap">
                    {answeredCount} of {totalCount} answered
                  </span>
                  <StreakChip streak={streak} />
                </span>
              }
            />
          </div>

          {/* Question Type Badge */}
          <div className="mb-4">
            <Badge variant="secondary">
              <MessageSquareText />
              {currentQuestion.questionType === "short" ? "Short answer" : "Essay"}
              {currentQuestion.questionType === "short" ? null : (
                <span className="text-muted-foreground">
                  · {currentQuestion.rubric.maxPoints} pts
                </span>
              )}
            </Badge>
          </div>

          <div
            key={currentIndex}
            className="flex flex-1 flex-col animate-in fade-in slide-in-from-right-4 duration-300"
          >
            {/* Question */}
            <div className="prose mb-6 w-full max-w-none font-serif text-lg leading-relaxed text-foreground md:text-xl">
              <Suspense
                fallback={<div className="h-5 w-full animate-pulse rounded bg-secondary/30" />}
              >
                <MarkdownRenderer
                  components={{
                    img: () => null,
                    a: ({ children }) => <span className="text-foreground">{children}</span>,
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
                      <th className="border-r border-border px-4 py-2 text-left font-semibold text-foreground last:border-r-0">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border-r border-border px-4 py-2 text-foreground last:border-r-0">
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
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative flex min-h-50 flex-1">
                  <textarea
                    value={currentAnswer}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    placeholder={
                      currentQuestion.questionType === "short"
                        ? "Type your short answer here (1-3 sentences)..."
                        : "Type your detailed answer here..."
                    }
                    disabled={reviewMode}
                    data-answered={isAnswered ? "true" : undefined}
                    className="w-full flex-1 resize-none rounded-xl bg-background p-6 font-serif text-base leading-relaxed shadow-xs ring-1 ring-hairline outline-hidden transition-shadow placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-70 data-[answered=true]:ring-primary/40"
                  />
                  {isSubmitting ? (
                    <span
                      aria-hidden
                      className="studio-sheen pointer-events-none absolute inset-0 rounded-xl"
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex shrink-0 items-center justify-between font-mono text-xs text-muted-foreground">
                  <span>{currentAnswer.length} characters</span>
                  <span>{currentAnswer.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              </div>
            ) : (
              /* Graded Result Display */
              <div className="flex-1 space-y-4">
                {/* Score Banner */}
                <div className="relative rounded-xl bg-primary/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-6 text-primary" />
                      <div>
                        <span className="text-sm font-semibold text-primary">Answer Graded</span>
                        <div className="mt-0.5 text-2xl font-bold tabular-nums text-primary">
                          <GradedScore
                            score={currentGradedResult.score}
                            maxScore={currentGradedResult.maxScore}
                            duration={isFreshGrade ? 900 : 0}
                          />
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
                  {isFreshGrade && justGraded.fullMarks ? <Burst /> : null}
                </div>

                {/* Your Answer */}
                <div className="rounded-xl bg-secondary/30 p-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards delay-100 duration-300">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Your Answer
                  </span>
                  <div className="mt-2 whitespace-pre-wrap font-serif text-base leading-relaxed text-foreground">
                    {userAnswers[currentQuestion.id]?.answer || ""}
                  </div>
                </div>

                {/* Feedback */}
                <div className="rounded-xl border border-info-border bg-info-muted p-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards delay-150 duration-300">
                  <span className="text-sm font-bold uppercase tracking-wide text-info-muted-foreground">
                    Feedback
                  </span>
                  <div className="mt-2 text-base leading-relaxed text-info-muted-foreground">
                    {currentGradedResult.feedback}
                  </div>
                </div>

                {/* Strengths */}
                {currentGradedResult.strengths && currentGradedResult.strengths.length > 0 && (
                  <div className="rounded-xl border border-success-border bg-success-muted p-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards delay-200 duration-300">
                    <span className="text-sm font-bold uppercase tracking-wide text-success-muted-foreground">
                      Strengths
                    </span>
                    <ul className="mt-2 space-y-2">
                      {currentGradedResult.strengths.map((strength, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-base text-success-muted-foreground"
                        >
                          <CheckCircle2 className="mt-1 size-4 shrink-0" />
                          <span>{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {currentGradedResult.improvements &&
                  currentGradedResult.improvements.length > 0 && (
                    <div className="rounded-xl border border-warning-border bg-warning-muted p-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards delay-300 duration-300">
                      <span className="text-sm font-bold uppercase tracking-wide text-warning-muted-foreground">
                        Areas for Improvement
                      </span>
                      <ul className="mt-2 space-y-2">
                        {currentGradedResult.improvements.map((improvement, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-base text-warning-muted-foreground"
                          >
                            <AlertCircle className="mt-1 size-4 shrink-0" />
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
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Bottom Controls */}
      <div className="z-10 shrink-0 border-t border-border bg-background/80 p-4 backdrop-blur-md md:px-12 md:py-6">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentIndex === 0}>
              Previous
            </Button>
            <span className={cn("inline-flex", isGraded && !reviewMode && "animate-studio-nudge")}>
              <Button ref={nextButtonRef} size="sm" className="min-w-25" onClick={handleNext}>
                {currentIndex === questions.length - 1 ? "Finish" : "Next"}
              </Button>
            </span>
          </div>

          {!isGraded && !reviewMode && (
            <Button
              size="sm"
              className="min-w-25"
              onClick={handleSubmitAnswer}
              disabled={!isAnswered || isSubmitting}
            >
              {isSubmitting ? <Spinner /> : <CheckCircle2 />}
              {isSubmitting ? "Grading…" : "Submit"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
