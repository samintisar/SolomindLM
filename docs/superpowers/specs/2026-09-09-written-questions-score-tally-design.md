# Written Questions score tally — design

**Date:** 2026-09-09
**Branch:** `fix/written-questions-score-tally`
**Scope:** medium

## Problem

A user (Fanny, Caramel.studyy) reported that the Written Questions results screen
shows `0 out of 50` even after answering questions with their key points.

Root cause: an answer only contributes to the final score if it was **graded**,
and grading only runs when the user presses the per-question green **Submit**
button (which calls `submitAndGrade`). Navigating with **Next / Finish** neither
grades nor persists the typed answer.

Contributing factors in
`apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx`:

- `calculateTotalScore` sums `answerObj.score` only for `graded === true` answers,
  but divides by the max points of **all** questions. Partial completion looks
  like total failure.
- The "X of N Answered" header counts typed text, not graded answers, so progress
  looks fine right up to the `0 / 50` screen.
- Typed answers live only in React state; `handleAnswerChange` never persists
  them. Only per-question Submit, the `lastViewedIndex` progress ping, and reset
  write to the server. Unsubmitted answers are lost on reload.
- A genuine grading failure returns `Math.floor(maxPoints / 2)` (half marks), not
  0 — so an exact 0 means "never graded", confirming the diagnosis.
- The per-question graded banner renders `Math.round((score / maxScore) * 100)`,
  which is `NaN%` when `maxScore` is 0 or undefined.

## Goals (medium scope)

1. On **Finish**, grade any answered-but-ungraded questions before showing
   results.
2. Results screen reports coverage honestly ("Graded X of N questions").
3. Persist typed answers as the user navigates, so unsubmitted answers are not
   silently lost.

## Non-goals

- Reworking the per-question Submit UX / auto-submit on Next.
- Server-side batch or parallel grading.
- Re-grading answers edited after grading (the UI replaces the textarea with the
  result view once graded, so this case cannot occur).

## Design

### Part A — Answer persistence

**New public mutation** `saveUserAnswerDraft` in
`convex/studio/writtenQuestions/index.ts`:

- Args: `{ id: v.id("writtenQuestions"), questionId: v.string(), answer: v.string() }`.
- `getAuthUserId` + `assertCanEditNotebook(ctx, writtenQuestion.notebookId, userId)`.
- Read `metadata.userAnswers[questionId]` (may be undefined) and write back
  `{ ...existing, answer }`, so `graded / score / maxScore / feedback / strengths /
  improvements / gradedAt` survive. Implemented by merging in the handler (or a
  `mergeExisting` flag on `WrittenQuestions.patchWrittenQuestionUserAnswer`, which
  today replaces the whole per-question object).

Rationale for a dedicated single-answer mutation over round-tripping the full
`userAnswers` map from the client: the client map can be stale with respect to
server-written grades, so a full-map write risks clobbering a grade. Patching one
key server-side with a read-modify-write avoids that.

**Client**

- `useSaveWrittenAnswerDraft` in
  `apps/web/src/features/studio/services/writtenQuestionsApi.ts` — thin
  `useMutation(api.studio.writtenQuestions.index.saveUserAnswerDraft)` wrapper.
- In `WrittenQuestionsView.tsx`, debounce (~800 ms) a save of the current
  question's answer whenever `currentAnswer` changes **and** the question is
  ungraded. Flush on question change and unmount. Skip when the answer is
  unchanged from the last saved / server value. Modeled on
  `useUpdateWrittenQuestionsProgress`.

Persistence is decoupled from grading: the grade-on-Finish loop passes answers
straight from local state, so it does not depend on a flush completing first.

### Part B — Grade-on-Finish (client loop) + honest results

**Grade-on-Finish** in `WrittenQuestionsView.tsx`:

- New state `gradingAll: { active: boolean; done: number; total: number; failed: number }`.
- `handleNext` on the last question stops calling `setShowResults(true)` directly.
  It computes
  `pending = questions.filter(q => localAnswer(q.id).trim() !== "" && userAnswers[q.id]?.graded !== true)`.
  - `pending.length === 0` → show results immediately (current path).
  - Otherwise → render a "Grading your answers…" screen showing
    `Grading {done} of {total}`, then:

    ```
    for (const q of pending) {
      try {
        await submitAnswerMutation({
          writtenQuestionsId: note.id,
          questionId: q.id,
          answer: localAnswers[q.id],
        });
      } catch {
        failed++;            // question stays ungraded -> scores 0
      }
      done++;
    }
    setShowResults(true);
    ```

- Each iteration persists server-side already; the existing `serverUserAnswersKey`
  effect syncs results back into local `userAnswers`.
- Guards: ignore re-entry while `gradingAll.active`; disable
  Previous / Next / Finish during the loop.

**Honest results screen** (`showResults` block):

- `summarizeWrittenQuestions` keeps score over **all** questions (ungraded = 0).
- Add `gradedCount = count(userAnswers[*].graded === true)`.
- Under "You scored X out of Y points":
  - Always: `Graded {gradedCount} of {questions.length} questions`.
  - When `gradedCount < questions.length`: muted `Ungraded questions count as 0.`
  - When `gradingAll.failed > 0`:
    `{failed} answer(s) couldn't be graded — use Review to resubmit.`
- Guard the percentage math against zero / undefined `maxScore` in both the
  summary and the per-question graded banner (`percentage = maxScore > 0 ?
  Math.round((score / maxScore) * 100) : 0`).

### Part C — Testability extraction

Move the tally logic out of the component into
`apps/web/src/features/studio/utils/writtenQuestionsScore.ts`:

```ts
summarizeWrittenQuestions(questions, userAnswers): {
  score: number;
  maxScore: number;
  gradedCount: number;
  totalCount: number;
  percentage: number;
}
```

The component consumes this for both the results summary and any progress
display that needs graded counts.

## Testing

**Unit — vitest (`test:web`)** — `writtenQuestionsScore.test.ts`:

- No answers graded → `score: 0`, `gradedCount: 0`, `percentage: 0`;
  `maxScore` = sum of every question's `rubric.maxPoints`.
- Some graded → `score` sums only graded answers; `maxScore` still all questions;
  `gradedCount` correct.
- All graded → `score` / `maxScore` consistent; `percentage` rounded.
- `maxScore === 0` (missing rubrics) → `percentage: 0`, never `NaN`.

**Convex — `convex-test` (`test:convex`)** — `saveUserAnswerDraft`:

- Creates a draft entry when none exists for that `questionId`.
- Saving new draft text preserves existing
  `graded / score / feedback / strengths / improvements` on that answer.
- Does not modify other questions' answers.
- Unauthenticated → rejects; user without notebook edit access → rejects.

**E2E — Playwright (`test:e2e`)** — check for an existing written-questions spec
under `apps/web`; add a focused one if absent:

- Seed a set, type answers on several questions, click **Finish** without pressing
  per-question **Submit**.
- Assert the "Grading N of M" screen appears, then results show a **non-zero**
  score and `Graded X of N questions`.
- Reload mid-set and assert typed (unsubmitted) answers survive.

**Verification gates before PR** (CLAUDE.md): `typecheck:web` + `typecheck:convex`
+ `lint` + `test:convex` + `test:web`; `test:e2e` before merge. No RAG / studio
evals — grading prompt copy is untouched.

## Files touched

| File | Change |
| --- | --- |
| `convex/studio/writtenQuestions/index.ts` | + `saveUserAnswerDraft` mutation |
| `convex/_model/writtenQuestions.ts` | merge-preserve path for single-answer patch (if needed) |
| `apps/web/src/features/studio/services/writtenQuestionsApi.ts` | + `useSaveWrittenAnswerDraft` |
| `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx` | debounced autosave, grade-on-Finish loop, honest results, percentage guards |
| `apps/web/src/features/studio/utils/writtenQuestionsScore.ts` | new pure util (extracted) |
| `apps/web/src/features/studio/utils/writtenQuestionsScore.test.ts` | new |
| `convex/studio/writtenQuestions/index.test.ts` | new or extended |
| `apps/web/` e2e spec | new or extended |
