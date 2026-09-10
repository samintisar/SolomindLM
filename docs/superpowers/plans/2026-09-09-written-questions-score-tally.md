# Written Questions Score Tally Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Written Questions results screen from showing `0 out of N` when a user answered questions but did not press the per-question Submit button — by grading answered-but-ungraded questions on Finish, reporting graded coverage honestly, and persisting typed answers as the user navigates.

**Architecture:** A new pure util (`writtenQuestionsScore.ts`) owns the score/coverage math and the "which answers still need grading" selection, unit-tested with vitest. A new Convex mutation (`saveUserAnswerDraft`) persists a single question's draft text server-side with a read-modify-write that preserves any existing grade fields, tested with convex-test. `WrittenQuestionsView.tsx` is changed in three focused passes: consume the util on the results screen, add debounced draft autosave, and run a client-side grading loop on Finish. Component behavior is covered by `@testing-library/react` tests with the `writtenQuestionsApi` hooks mocked (matching the existing `SaveAsPromptModal.test.tsx` pattern). End-to-end coverage lives in `e2e/studio/written-questions-grading.spec.ts` — the repo DOES have Playwright (`playwright.config.ts` at root, `e2e/`, `bun run test:e2e`); the Finish→graded-score flow is `E2E_AI_ENABLED`-gated because live grading calls the AI grading service, and reload-persistence of unsubmitted answers is an always-on non-AI test.

**Tech Stack:** React 19 + Vite + TypeScript (`apps/web`), Convex (`convex/`), vitest + jsdom + @testing-library/react (web), convex-test + vitest (backend), Biome (lint/format). Package manager: bun.

**Spec:** `docs/superpowers/specs/2026-09-09-written-questions-score-tally-design.md`

**Branch:** `fix/written-questions-score-tally` (already checked out; design doc already committed as `69ba44a`)

---

## File Structure

**Create:**

- `apps/web/src/features/studio/utils/writtenQuestionsScore.ts` — pure functions: `summarizeWrittenQuestions(questions, userAnswers)` → `{ score, maxScore, gradedCount, totalCount, percentage }`, and `selectPendingGradeIds(questions, answers)` → `string[]`. No React, no Convex.
- `apps/web/src/features/studio/utils/writtenQuestionsScore.test.ts` — vitest unit tests for the above.
- `convex/studio/writtenQuestions/index.test.ts` — convex-test tests for `saveUserAnswerDraft`.
- `apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx` — component tests for results coverage, autosave, and grade-on-Finish.
- `convex/e2e/seedWrittenQuestions.ts` — e2e seed mutation: a `completed` written-questions set with two known short questions.
- `e2e/helpers/written-questions-seed.ts` — `seedWrittenQuestionSetForNotebook(page, title)` helper (shells out to `bunx convex run`).
- `e2e/studio/written-questions-grading.spec.ts` — Playwright: always-on reload-persistence test + `E2E_AI_ENABLED`-gated Finish→graded-score test.

**Modify:**

- `convex/_model/writtenQuestions.ts` — add `saveUserAnswerDraft(ctx, id, questionId, answer)` DB helper (merge-preserving).
- `convex/studio/writtenQuestions/index.ts` — add `saveUserAnswerDraft` public mutation.
- `apps/web/src/features/studio/services/writtenQuestionsApi.ts` — add `useSaveWrittenAnswerDraft` hook.
- `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx` — consume `summarizeWrittenQuestions` on the results screen, add honest coverage lines + percentage guard, add debounced draft autosave, add grade-on-Finish loop.

**Task order (sequential — Tasks 4, 5, 6 all edit `WrittenQuestionsView.tsx`):**
1. Score util + unit tests
2. Backend `saveUserAnswerDraft` (model helper + mutation + convex-test)
3. `useSaveWrittenAnswerDraft` hook
4. Results screen: consume util + honest coverage + percentage guard (+ component test scaffold)
5. Debounced draft autosave in the view (+ component test)
6. Grade-on-Finish loop in the view (+ component test)
7. Full verification

---

## Task 1: Score/coverage util

**Files:**
- Create: `apps/web/src/features/studio/utils/writtenQuestionsScore.ts`
- Test: `apps/web/src/features/studio/utils/writtenQuestionsScore.test.ts`

Reference for existing util+test style: `apps/web/src/features/studio/utils/mergePendingStudioNotes.ts` / `.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/studio/utils/writtenQuestionsScore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WrittenQuestion, WrittenQuestionAnswer } from "@/shared/types/index";
import {
  selectPendingGradeIds,
  summarizeWrittenQuestions,
} from "./writtenQuestionsScore";

function q(id: string, maxPoints = 5): WrittenQuestion {
  return {
    id,
    question: `Question ${id}`,
    questionType: "short",
    rubric: { maxPoints, criteria: [] },
  };
}

function graded(score: number): WrittenQuestionAnswer {
  return { answer: "an answer", graded: true, score, maxScore: 5 };
}

describe("summarizeWrittenQuestions", () => {
  it("returns zero score but full maxScore when nothing is graded", () => {
    const questions = [q("q1"), q("q2"), q("q3")];
    const result = summarizeWrittenQuestions(questions, {});
    expect(result).toEqual({
      score: 0,
      maxScore: 15,
      gradedCount: 0,
      totalCount: 3,
      percentage: 0,
    });
  });

  it("sums only graded answers while maxScore covers every question", () => {
    const questions = [q("q1"), q("q2"), q("q3")];
    const userAnswers: Record<string, WrittenQuestionAnswer> = {
      q1: graded(4),
      q2: { answer: "typed but not submitted", graded: false },
    };
    const result = summarizeWrittenQuestions(questions, userAnswers);
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(15);
    expect(result.gradedCount).toBe(1);
    expect(result.totalCount).toBe(3);
    expect(result.percentage).toBe(27); // round(4 / 15 * 100)
  });

  it("treats a missing score on a graded answer as 0", () => {
    const questions = [q("q1")];
    const result = summarizeWrittenQuestions(questions, {
      q1: { answer: "x", graded: true },
    });
    expect(result.score).toBe(0);
    expect(result.gradedCount).toBe(1);
  });

  it("returns percentage 0 (not NaN) when maxScore is 0", () => {
    const questions: WrittenQuestion[] = [
      { id: "q1", question: "Q1", questionType: "short", rubric: { maxPoints: 0, criteria: [] } },
    ];
    const result = summarizeWrittenQuestions(questions, { q1: graded(0) });
    expect(result.maxScore).toBe(0);
    expect(result.percentage).toBe(0);
    expect(Number.isNaN(result.percentage)).toBe(false);
  });

  it("tolerates a question with no rubric", () => {
    const questions = [{ id: "q1", question: "Q1", questionType: "short" } as unknown as WrittenQuestion];
    const result = summarizeWrittenQuestions(questions, {});
    expect(result.maxScore).toBe(0);
    expect(result.percentage).toBe(0);
  });
});

describe("selectPendingGradeIds", () => {
  it("returns ids with a non-empty answer that are not graded", () => {
    const questions = [q("q1"), q("q2"), q("q3"), q("q4")];
    const answers = {
      q1: { answer: "real answer", graded: false },
      q2: { answer: "   ", graded: false },
      q3: { answer: "graded already", graded: true },
      q4: { answer: "another", graded: false },
    };
    expect(selectPendingGradeIds(questions, answers)).toEqual(["q1", "q4"]);
  });

  it("returns an empty array when every answered question is graded", () => {
    const questions = [q("q1"), q("q2")];
    const answers = {
      q1: { answer: "a", graded: true },
      q2: { answer: "b", graded: true },
    };
    expect(selectPendingGradeIds(questions, answers)).toEqual([]);
  });

  it("ignores questions with no answer entry", () => {
    const questions = [q("q1"), q("q2")];
    expect(selectPendingGradeIds(questions, { q1: { answer: "", graded: false } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bun run --cwd apps/web test -- writtenQuestionsScore`
Expected: FAIL — `Failed to resolve import "./writtenQuestionsScore"` / module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/features/studio/utils/writtenQuestionsScore.ts`:

```ts
import type { WrittenQuestion, WrittenQuestionAnswer } from "@/shared/types/index";

export interface WrittenQuestionsSummary {
  /** Sum of `score` across graded answers only. */
  score: number;
  /** Sum of `rubric.maxPoints` across every question in the set. */
  maxScore: number;
  /** Number of questions whose answer has `graded === true`. */
  gradedCount: number;
  /** Total number of questions in the set. */
  totalCount: number;
  /** `score / maxScore` as a rounded percentage; 0 when `maxScore` is 0. */
  percentage: number;
}

type AnswerLike = Pick<WrittenQuestionAnswer, "graded" | "score"> & { answer?: string };

export function summarizeWrittenQuestions(
  questions: WrittenQuestion[],
  userAnswers: Record<string, AnswerLike> = {}
): WrittenQuestionsSummary {
  const totalCount = questions.length;

  let score = 0;
  let gradedCount = 0;
  for (const question of questions) {
    const answer = userAnswers[question.id];
    if (answer?.graded) {
      gradedCount += 1;
      score += answer.score ?? 0;
    }
  }

  const maxScore = questions.reduce(
    (sum, question) => sum + (question.rubric?.maxPoints ?? 0),
    0
  );
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return { score, maxScore, gradedCount, totalCount, percentage };
}

/**
 * Question ids that have a non-empty answer but have not been graded yet —
 * i.e. the set to grade when the user presses Finish.
 */
export function selectPendingGradeIds(
  questions: WrittenQuestion[],
  answers: Record<string, AnswerLike>
): string[] {
  const pending: string[] = [];
  for (const question of questions) {
    const entry = answers[question.id];
    if (entry && (entry.answer ?? "").trim().length > 0 && entry.graded !== true) {
      pending.push(question.id);
    }
  }
  return pending;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd apps/web test -- writtenQuestionsScore`
Expected: PASS — 9 tests green.

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck:web`
Expected: no errors.
Run: `bun run lint`
Expected: no new findings for the two new files (Biome). If format complaints, run `bun run format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/studio/utils/writtenQuestionsScore.ts apps/web/src/features/studio/utils/writtenQuestionsScore.test.ts
git commit -m "feat(studio): add written-questions score/coverage util

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `saveUserAnswerDraft` backend (model helper + mutation)

**Files:**
- Modify: `convex/_model/writtenQuestions.ts` (add helper after `patchWrittenQuestionUserAnswer`, ~line 177)
- Modify: `convex/studio/writtenQuestions/index.ts` (add mutation after `update`, ~line 157)
- Test: `convex/studio/writtenQuestions/index.test.ts` (new)

Reference for convex-test style: `convex/notebooks/index.test.ts` (module glob + `withAuth`), `convex/studio/literature_tables/index.test.ts` (seed helpers).

- [ ] **Step 1: Write the failing tests**

Create `convex/studio/writtenQuestions/index.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>, name = "Test"): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedWrittenQuestions(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  notebookId: Id<"notebooks">,
  metadata: Record<string, unknown> = {}
): Promise<Id<"writtenQuestions">> {
  return t.run(async (ctx) =>
    ctx.db.insert("writtenQuestions", {
      userId,
      notebookId,
      title: "WQ",
      status: "completed",
      questionType: "short",
      questionsData: [
        { id: "q1", question: "Q1?", questionType: "short", rubric: { maxPoints: 5, criteria: [] } },
        { id: "q2", question: "Q2?", questionType: "short", rubric: { maxPoints: 5, criteria: [] } },
      ],
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function readUserAnswers(
  t: ReturnType<typeof convexTest>,
  id: Id<"writtenQuestions">
): Promise<Record<string, Record<string, unknown>>> {
  return t.run(async (ctx) => {
    const doc = await ctx.db.get(id);
    return ((doc?.metadata as { userAnswers?: Record<string, Record<string, unknown>> }) ?? {})
      .userAnswers ?? {};
  });
}

describe("studio.writtenQuestions.index.saveUserAnswerDraft", () => {
  test("creates a draft answer entry when none exists", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const wqId = await seedWrittenQuestions(t, userId, notebookId);

    await withAuth(t, userId).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: wqId,
      questionId: "q1",
      answer: "my draft answer",
    });

    const answers = await readUserAnswers(t, wqId);
    expect(answers.q1).toEqual({ graded: false, answer: "my draft answer" });
  });

  test("overwrites draft text but preserves existing grade fields", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const wqId = await seedWrittenQuestions(t, userId, notebookId, {
      userAnswers: {
        q1: {
          answer: "old text",
          graded: true,
          score: 4,
          maxScore: 5,
          feedback: "solid",
          strengths: ["clear"],
          improvements: ["cite sources"],
          gradedAt: "2026-09-09T00:00:00.000Z",
        },
      },
    });

    await withAuth(t, userId).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: wqId,
      questionId: "q1",
      answer: "new text",
    });

    const answers = await readUserAnswers(t, wqId);
    expect(answers.q1).toEqual({
      answer: "new text",
      graded: true,
      score: 4,
      maxScore: 5,
      feedback: "solid",
      strengths: ["clear"],
      improvements: ["cite sources"],
      gradedAt: "2026-09-09T00:00:00.000Z",
    });
  });

  test("does not modify other questions' answers", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const wqId = await seedWrittenQuestions(t, userId, notebookId, {
      userAnswers: { q2: { answer: "q2 answer", graded: false } },
    });

    await withAuth(t, userId).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: wqId,
      questionId: "q1",
      answer: "q1 answer",
    });

    const answers = await readUserAnswers(t, wqId);
    expect(answers.q1).toEqual({ graded: false, answer: "q1 answer" });
    expect(answers.q2).toEqual({ answer: "q2 answer", graded: false });
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const wqId = await seedWrittenQuestions(t, userId, notebookId);

    await expect(
      t.mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
        id: wqId,
        questionId: "q1",
        answer: "x",
      })
    ).rejects.toThrow();
  });

  test("rejects a user who cannot edit the notebook", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "Owner");
    const stranger = await seedUser(t, "Stranger");
    const notebookId = await seedNotebook(t, owner);
    const wqId = await seedWrittenQuestions(t, owner, notebookId);

    await expect(
      withAuth(t, stranger).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
        id: wqId,
        questionId: "q1",
        answer: "x",
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bun run test:convex -- writtenQuestions/index`
Expected: FAIL — `api.studio.writtenQuestions.index.saveUserAnswerDraft` is `undefined` (mutation not defined yet), tests throw on the call.

- [ ] **Step 3: Add the model helper**

In `convex/_model/writtenQuestions.ts`, insert this function immediately after `patchWrittenQuestionUserAnswer` (after its closing brace, ~line 177):

```ts
/**
 * Persist ONLY the draft answer text for one question. Read-modify-write that
 * merges over the existing per-question object so grade fields written by
 * grading (`graded`, `score`, `feedback`, ...) are never clobbered. Ensures a
 * `graded` key exists (defaulting to `false`) for brand-new drafts.
 */
export async function saveUserAnswerDraft(
  ctx: MutationCtx,
  writtenQuestionId: Id<"writtenQuestions">,
  questionId: string,
  answer: string
): Promise<void> {
  const writtenQuestion = await getWrittenQuestion(ctx, writtenQuestionId);
  if (!writtenQuestion) throw new Error("Written question set not found");

  const existingUserAnswers =
    (writtenQuestion.metadata as { userAnswers?: Record<string, Record<string, unknown>> })
      ?.userAnswers ?? {};
  const existingAnswer = existingUserAnswers[questionId] ?? {};

  await ctx.db.patch("writtenQuestions", writtenQuestionId, {
    metadata: {
      ...writtenQuestion.metadata,
      userAnswers: {
        ...existingUserAnswers,
        [questionId]: { graded: false, ...existingAnswer, answer },
      },
    },
    updatedAt: Date.now(),
  });
}
```

- [ ] **Step 4: Add the public mutation**

In `convex/studio/writtenQuestions/index.ts`, insert after the `update` mutation's closing `});` (~line 157, before `updateWrittenQuestions`):

```ts
/**
 * Persist a single question's draft answer text (no grading). Used by the
 * client's debounced autosave so typed-but-unsubmitted answers survive reload.
 */
export const saveUserAnswerDraft = mutation({
  args: {
    id: v.id("writtenQuestions"),
    questionId: v.string(),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const existing = await WrittenQuestions.getWrittenQuestion(ctx, args.id);
    if (!existing) throw new Error("Written question set not found or access denied");
    await assertCanEditNotebook(ctx, existing.notebookId, userId);
    await WrittenQuestions.saveUserAnswerDraft(ctx, args.id, args.questionId, args.answer);
  },
});
```

(`mutation`, `v`, `assertCanEditNotebook`, `getAuthUserId`, and `WrittenQuestions` are already imported at the top of the file.)

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun run test:convex -- writtenQuestions/index`
Expected: PASS — 5 tests green.

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add convex/_model/writtenQuestions.ts convex/studio/writtenQuestions/index.ts convex/studio/writtenQuestions/index.test.ts
git commit -m "feat(convex): add saveUserAnswerDraft mutation for written questions

Persists one question's draft answer text with a merge that preserves
existing grade fields. Backs the client's debounced autosave.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `useSaveWrittenAnswerDraft` client hook

**Files:**
- Modify: `apps/web/src/features/studio/services/writtenQuestionsApi.ts` (add after `useSubmitWrittenAnswer`, ~line 229)

No dedicated test — it is a one-line `useMutation` wrapper, exercised through the component tests in Tasks 4–6. This matches the untested `useSubmitWrittenAnswer` / `useResetWrittenAnswers` wrappers already in the file.

- [ ] **Step 1: Add the hook**

In `apps/web/src/features/studio/services/writtenQuestionsApi.ts`, insert immediately after the `useSubmitWrittenAnswer` function (after its closing `}`, ~line 229):

```ts
/**
 * Persist a single question's draft answer text without grading it.
 * Called (debounced) as the user types / navigates so unsubmitted answers
 * are not lost on reload.
 */
export function useSaveWrittenAnswerDraft() {
  const save = useMutation(api.studio.writtenQuestions.index.saveUserAnswerDraft);

  return async (params: { writtenQuestionsId: string; questionId: string; answer: string }) => {
    return await save({
      id: params.writtenQuestionsId as Id<"writtenQuestions">,
      questionId: params.questionId,
      answer: params.answer,
    });
  };
}
```

(`useMutation`, `api`, and `Id` are already imported at the top of the file.)

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/studio/services/writtenQuestionsApi.ts
git commit -m "feat(studio): add useSaveWrittenAnswerDraft hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Results screen consumes the util + honest coverage + percentage guard

**Files:**
- Modify: `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx`
  - Replace `calculateTotalScore` (lines 190–205) and the `showResults` block's score/percentage lines (lines 207–229).
  - Guard the per-question graded-banner percentage (line ~400).
- Test: `apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx` (new — scaffold + results tests)

Reference for the component-test pattern (mock the api hooks module, render with `@testing-library/react`): `apps/web/src/features/studio/components/SaveAsPromptModal.test.tsx`.

- [ ] **Step 1: Write the failing test (with the shared scaffold)**

Create `apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrittenQuestionsNote } from "@/shared/types/index";
import { WrittenQuestionsView } from "./WrittenQuestionsView";

// --- Mocks -------------------------------------------------------------------
const submitAnswer = vi.fn();
const saveDraft = vi.fn();
const resetAnswers = vi.fn();
let latestNote: WrittenQuestionsNote | null = null;

vi.mock("../../services/writtenQuestionsApi", () => ({
  useSubmitWrittenAnswer: () => submitAnswer,
  useSaveWrittenAnswerDraft: () => saveDraft,
  useResetWrittenAnswers: () => resetAnswers,
  useUpdateWrittenQuestionsProgress: () => undefined,
  useWrittenQuestionSet: () => latestNote,
}));

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/utils", () => ({
  sanitizeMarkdown: (s: string) => s,
}));

function makeNote(overrides: Partial<WrittenQuestionsNote> = {}): WrittenQuestionsNote {
  return {
    id: "wq1",
    title: "Set",
    preview: "",
    type: "writtenQuestions",
    questions: [
      { id: "q1", question: "Q1?", questionType: "short", rubric: { maxPoints: 5, criteria: [] } },
      { id: "q2", question: "Q2?", questionType: "short", rubric: { maxPoints: 5, criteria: [] } },
    ],
    userAnswers: {},
    status: "completed",
    metadata: { questionCount: 2, difficulty: "medium", questionType: "short" },
    ...overrides,
  } as WrittenQuestionsNote;
}

beforeEach(() => {
  vi.clearAllMocks();
  latestNote = null;
});

// --- Results coverage ------------------------------------------------------
describe("WrittenQuestionsView results coverage", () => {
  it("shows graded coverage and does not divide-by-zero", async () => {
    const note = makeNote({
      userAnswers: {
        q1: { answer: "a", graded: true, score: 4, maxScore: 5 },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    // Navigate q1 -> q2 -> Finish
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(screen.getByText("You scored 4 out of 10 points")).toBeInTheDocument();
    expect(screen.getByText("Graded 1 of 2 questions")).toBeInTheDocument();
    expect(screen.getByText(/Ungraded questions count as 0/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run --cwd apps/web test -- WrittenQuestionsView`
Expected: FAIL — no element with text `Graded 1 of 2 questions` (and possibly the score-line text differs).

- [ ] **Step 3: Implement — replace `calculateTotalScore` and the results block**

In `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx`:

Add the import near the other local imports (after line 9):

```tsx
import { summarizeWrittenQuestions } from "@/features/studio/utils/writtenQuestionsScore";
```

Delete `calculateTotalScore` (lines 190–205) entirely. Replace the opening of the `showResults` block (lines 207–222) so it reads:

```tsx
  if (showResults) {
    const { score, maxScore, gradedCount, totalCount, percentage } = summarizeWrittenQuestions(
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
          </div>
```

The existing progress-bar `div` and `{percentage}%` line that follow now use the `percentage` from the destructure above (the old inline `const percentage = maxScore > 0 ? ... : 0;` on line 209 is removed by this replacement). Verify the JSX still closes correctly (the rest of the block from the progress bar down is unchanged).

Guard the per-question banner percentage — change line ~400 from:

```tsx
                      {Math.round((currentGradedResult.score / currentGradedResult.maxScore) * 100)}
                      %
```

to:

```tsx
                      {currentGradedResult.maxScore > 0
                        ? Math.round(
                            (currentGradedResult.score / currentGradedResult.maxScore) * 100
                          )
                        : 0}
                      %
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run --cwd apps/web test -- WrittenQuestionsView`
Expected: PASS — results-coverage test green.

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck:web`
Expected: no errors (in particular, no "unused `calculateTotalScore`" or missing-symbol errors).
Run: `bun run lint`
Expected: clean; run `bun run format` if Biome flags formatting.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx
git commit -m "fix(studio): honest coverage on written-questions results screen

Results now report 'Graded X of N questions' and note that ungraded
questions score 0, and the per-question percentage no longer renders NaN
when maxScore is 0.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Debounced draft autosave in the view

**Files:**
- Modify: `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx`
- Test: `apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx` (add a `describe` block)

- [ ] **Step 1: Add the failing test**

Append to `WrittenQuestionsView.test.tsx` (the mock scaffold from Task 4 already exports `useSaveWrittenAnswerDraft: () => saveDraft`):

```tsx
describe("WrittenQuestionsView draft autosave", () => {
  it("persists typed text for an ungraded question after a debounce", async () => {
    vi.useFakeTimers();
    try {
      const note = makeNote();
      latestNote = note;
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<WrittenQuestionsView note={note} />);

      await user.type(
        screen.getByPlaceholderText(/Type your short answer/i),
        "photosynthesis basics"
      );

      expect(saveDraft).not.toHaveBeenCalled(); // still within debounce window
      vi.advanceTimersByTime(900);

      expect(saveDraft).toHaveBeenCalledWith({
        writtenQuestionsId: "wq1",
        questionId: "q1",
        answer: "photosynthesis basics",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not autosave a question that is already graded", async () => {
    vi.useFakeTimers();
    try {
      const note = makeNote({
        userAnswers: { q1: { answer: "done", graded: true, score: 5, maxScore: 5 } },
      });
      latestNote = note;
      render(<WrittenQuestionsView note={note} />);

      vi.advanceTimersByTime(2000);
      expect(saveDraft).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `bun run --cwd apps/web test -- WrittenQuestionsView`
Expected: FAIL — `saveDraft` never called (no autosave wired).

- [ ] **Step 3: Implement the autosave**

In `WrittenQuestionsView.tsx`:

Add to the hook imports block (with the other `writtenQuestionsApi` imports, lines 3–8):

```tsx
  useSaveWrittenAnswerDraft,
```

Inside the component, next to the other mutation hooks (~line 42):

```tsx
  const saveDraftMutation = useSaveWrittenAnswerDraft();
```

Add these refs near `hasInitializedIndex` (~line 47):

```tsx
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedDraftRef = useRef<Record<string, string>>({});
```

Add this effect after the `serverUserAnswersKey` sync effect (~line 74). It must be placed BEFORE the early `return` for `questions.length === 0` is irrelevant (hooks stay above the guard — it is already at line 79, so put this effect at ~line 75, above that guard):

```tsx
  // Debounced autosave of the current question's typed answer (ungraded only),
  // so unsubmitted answers survive a reload. Mirrors useUpdateWrittenQuestionsProgress.
  const currentQuestionId = questions[currentIndex]?.id;
  const currentDraft = currentQuestionId ? userAnswers[currentQuestionId]?.answer ?? "" : "";
  const currentDraftGraded = currentQuestionId
    ? userAnswers[currentQuestionId]?.graded === true
    : false;
  useEffect(() => {
    if (!currentQuestionId || currentDraftGraded) return;
    if (lastSavedDraftRef.current[currentQuestionId] === currentDraft) return;

    draftTimerRef.current = setTimeout(() => {
      lastSavedDraftRef.current[currentQuestionId] = currentDraft;
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
```

Note: `useEffect` is already imported (line 2). Seed `lastSavedDraftRef` from server data so the first render of an already-saved answer does not re-save — add this to the existing `serverUserAnswersKey` sync effect body, right after `setUserAnswers(latestNote.userAnswers)`:

```tsx
      const saved: Record<string, string> = {};
      for (const [qid, entry] of Object.entries(latestNote.userAnswers)) {
        saved[qid] = entry?.answer ?? "";
      }
      lastSavedDraftRef.current = saved;
```

- [ ] **Step 4: Run and confirm it passes**

Run: `bun run --cwd apps/web test -- WrittenQuestionsView`
Expected: PASS — all `WrittenQuestionsView` tests green (results + autosave).

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck:web`
Run: `bun run lint`
Expected: clean (`bun run format` if needed).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx
git commit -m "feat(studio): autosave typed written-question answers

Debounced (800ms) persistence of the current question's draft text for
ungraded questions, so unsubmitted answers are not lost on reload.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Grade-on-Finish loop in the view

**Files:**
- Modify: `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx`
- Test: `apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx` (add a `describe` block)

- [ ] **Step 1: Add the failing tests**

Append to `WrittenQuestionsView.test.tsx`:

```tsx
describe("WrittenQuestionsView grade-on-Finish", () => {
  it("grades answered-but-ungraded questions on Finish then shows a real score", async () => {
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) => ({
      success: true,
      score: questionId === "q1" ? 4 : 3,
      maxScore: 5,
    }));
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    // Loop ran once per pending question
    expect(submitAnswer).toHaveBeenCalledTimes(2);
    expect(submitAnswer).toHaveBeenCalledWith({
      writtenQuestionsId: "wq1",
      questionId: "q1",
      answer: "answer one",
    });

    expect(await screen.findByText("You scored 7 out of 10 points")).toBeInTheDocument();
    expect(screen.getByText("Graded 2 of 2 questions")).toBeInTheDocument();
  });

  it("counts a grading failure as ungraded and surfaces it", async () => {
    submitAnswer.mockImplementation(async ({ questionId }: { questionId: string }) => {
      if (questionId === "q2") throw new Error("grader down");
      return { success: true, score: 5, maxScore: 5 };
    });
    const note = makeNote({
      userAnswers: {
        q1: { answer: "answer one", graded: false },
        q2: { answer: "answer two", graded: false },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText("You scored 5 out of 10 points")).toBeInTheDocument();
    expect(screen.getByText("Graded 1 of 2 questions")).toBeInTheDocument();
    expect(screen.getByText(/1 answer\(s\) couldn't be graded/)).toBeInTheDocument();
  });

  it("skips grading and goes straight to results when nothing is pending", async () => {
    const note = makeNote({
      userAnswers: { q1: { answer: "a", graded: true, score: 5, maxScore: 5 } },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(submitAnswer).not.toHaveBeenCalled();
    expect(screen.getByText("You scored 5 out of 10 points")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `bun run --cwd apps/web test -- WrittenQuestionsView`
Expected: FAIL — `submitAnswer` not called on Finish; score still `0 out of 10`.

- [ ] **Step 3: Implement the grading loop**

In `WrittenQuestionsView.tsx`:

Extend the util import from Task 4:

```tsx
import {
  selectPendingGradeIds,
  summarizeWrittenQuestions,
} from "@/features/studio/utils/writtenQuestionsScore";
```

Add state near `showResults` / `isSubmitting` (~line 36):

```tsx
  const [gradingAll, setGradingAll] = useState<{
    active: boolean;
    done: number;
    total: number;
    failed: number;
  }>({ active: false, done: 0, total: 0, failed: 0 });
```

Replace `handleNext` (lines 138–144) with:

```tsx
  const runGradeAllThenShowResults = async () => {
    const pending = selectPendingGradeIds(questions, userAnswers);
    if (pending.length === 0) {
      setShowResults(true);
      return;
    }

    setGradingAll({ active: true, done: 0, total: pending.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
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

    setGradingAll((s) => ({ ...s, active: false }));
    setShowResults(true);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      void runGradeAllThenShowResults();
    }
  };
```

Add a grading-progress screen. Immediately before `if (showResults) {` (~line 207) insert:

```tsx
  if (gradingAll.active) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">
            Grading your answers… {gradingAll.done} of {gradingAll.total}
          </p>
        </div>
      </div>
    );
  }
```

In the results block (from Task 4), add a failure line after the `Ungraded questions count as 0.` paragraph:

```tsx
            {gradingAll.failed > 0 && (
              <p className="text-xs text-vintage-orange-700 dark:text-vintage-orange-300 mt-0.5">
                {gradingAll.failed} answer(s) couldn't be graded — use Review to resubmit.
              </p>
            )}
```

Disable the nav buttons while grading — on the `Previous` button (line ~477) and the `Next`/`Finish` button (line ~483) add to each `disabled=`:

```tsx
            disabled={currentIndex === 0 || gradingAll.active}
```
```tsx
            disabled={gradingAll.active}
```

(The `Finish` button currently has no `disabled` — add `disabled={gradingAll.active}`.)

- [ ] **Step 4: Run and confirm they pass**

Run: `bun run --cwd apps/web test -- WrittenQuestionsView`
Expected: PASS — all `WrittenQuestionsView` tests green (results + autosave + grade-on-Finish).

- [ ] **Step 5: Typecheck + lint + full web test run**

Run: `bun run typecheck:web`
Run: `bun run lint`
Run: `bun run --cwd apps/web test -- writtenQuestions`
Expected: all clean/green. `bun run format` if Biome flags formatting.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx
git commit -m "fix(studio): grade unsubmitted answers on Finish

Pressing Finish now grades every answered-but-ungraded question (client
loop with a progress screen), so the results screen reflects real work
instead of 0. Grading failures are counted and surfaced.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Verification gates (CLAUDE.md)**

Run each and confirm the stated expectation:

- `bun run typecheck:web` → no errors
- `bun run typecheck:convex` → no errors
- `bun run lint` → no new findings
- `bun run test:convex -- writtenQuestions` → `saveUserAnswerDraft` suite green
- `bun run --cwd apps/web test -- writtenQuestions` → util + view suites green

- [ ] **Step 2: Full test suites (guard against regressions)**

- `bun run test:web` → green
- `bun run test:convex` → green (~990+ tests)

If anything unrelated fails, check whether it fails on a clean `main` before treating it as caused by this work.

- [ ] **Step 3: Manual smoke (optional but recommended)**

`bun run dev:web` + `bun x convex dev`, open a completed Written Questions set, type answers into several questions WITHOUT pressing per-question Submit, reload the page (answers should still be there), then click through to Finish and confirm the results screen shows a non-zero score with `Graded X of N questions`.

- [ ] **Step 4: Update the spec status**

Append a short "Implemented 2026-09-09 on `fix/written-questions-score-tally`" note to the end of `docs/superpowers/specs/2026-09-09-written-questions-score-tally-design.md` and commit:

```bash
git add docs/superpowers/specs/2026-09-09-written-questions-score-tally-design.md
git commit -m "docs: mark written-questions score tally spec implemented

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand off**

Implementation complete. Next: `superpowers:finishing-a-development-branch` (open a PR to `main`) — CI runs Convex typecheck + web build. `bun run test:e2e` (Playwright) IS configured in this repo; the new `e2e/studio/written-questions-grading.spec.ts` adds an always-on reload-persistence test plus an `E2E_AI_ENABLED`-gated Finish→graded-score test (the latter is skipped unless `E2E_AI_ENABLED=1`, like the sibling studio specs).

---

## Self-Review Notes

- **Spec coverage:** Goal 1 (grade on Finish) → Task 6. Goal 2 (honest coverage) → Task 4. Goal 3 (persist typed answers) → Tasks 2/3/5. Percentage `NaN` guard (spec "Contributing factors") → Task 4. Testability extraction (spec Part C) → Task 1. Testing plan (spec Testing) → Tasks 1, 2, 4, 5, 6 + Task 7; e2e coverage is added in `e2e/studio/written-questions-grading.spec.ts` (the repo has Playwright): an always-on reload-persistence test and an `E2E_AI_ENABLED`-gated Finish→graded-score test, with the component tests covering the deterministic loop/UI/guard details.
- **Non-goals honored:** no per-question Submit rework (Submit button logic untouched), no server-side batch grading (loop is client-side reusing `submitAndGrade`), no re-grading of edited graded answers (autosave and the loop both skip `graded === true`).
- **Type consistency:** `summarizeWrittenQuestions` returns `{ score, maxScore, gradedCount, totalCount, percentage }` — consumed with those exact names in Task 4. `selectPendingGradeIds` returns `string[]` of question ids — consumed in Task 6. `submitAnswerMutation` result is used as `{ score, maxScore }` in Task 6, matching the `submitAndGrade` action's return (`{ success, score, maxScore }`). Convex mutation ref path `api.studio.writtenQuestions.index.saveUserAnswerDraft` is identical in Tasks 2 and 3.
- **No placeholders:** every code step shows full code; every run step shows the command and expected result.
