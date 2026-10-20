# Public Notebooks Viewer Progress (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A viewer of a public notebook can practise its flashcards, quizzes and written questions with their own saved progress (reviews, answers, drafts, grades, Due/All choice, last card or question viewed), without touching the shared rows; owners and editors practise exactly as before.

**Architecture:** A new `studioProgress` table holds one row per (viewer, studio item). Every practice write resolves a *practice target* from the caller's access: `"shared"` (owner/editor, unchanged code path on the shared row) or `"viewer"` (upsert into `studioProgress`). Every read that today strips the owner's progress for viewers (`practiceProgress.ts`) now also lays the viewer's own progress over the stripped row, through small pure helpers (`applyViewerProgress`, `forViewer`, `with*` updaters) next to the strip helpers. "Last viewed" and "Try again" move off the generic `update` mutation (which also renames and edits, and stays edit-only) onto two new mutations in `convex/studio/practice.ts`. AI grading gets a per-caller hourly limit. Deleting an item or notebook, and account purge, delete the matching progress rows; fork never reads the table.

**Tech Stack:** Convex (queries/mutations/actions, `@convex-dev/rate-limiter`, `convex-test` + vitest), React 19 + Vite, Testing Library.

Spec: [`docs/superpowers/specs/2026-10-14-public-notebooks-design.md`](../specs/2026-10-14-public-notebooks-design.md) ("PR 2 — Per-viewer studio progress"). Builds on PR 1 ([`2026-10-14-public-notebooks-core.md`](2026-10-14-public-notebooks-core.md)); base branch `feature/public-notebooks`.

**Before any Convex change:** read `convex/_generated/ai/guidelines.md`.

**Commands** (run from the worktree root):

- Convex tests: `bun run test:convex -- <path>` (whole suite: `bun run test:convex`)
- Web tests: `bun run test:web -- <path relative to apps/web>`
- Typecheck: `bun run typecheck:convex` then `bun run typecheck:web` (not in parallel)
- Codegen after adding a Convex module: `npx convex codegen` (needs the worktree's `.env.local` pointing at the dev deployment; see `docs/engineering/dev-environment.md`)

---

## How practice state is stored today (reference)

| Type | Per-user state on the shared row | Keyed by | Written by |
| --- | --- | --- | --- |
| Flashcards | `cardsData[i].proficiency` (`CardProficiency` from `convex/_lib/srsScheduling.ts`) | card index `i` in `cardsData` | `flashcards.submitCardReview({ id, cardIndex, rating })` |
| | `metadata.showMastered: boolean` | — | `flashcards.updatePreferences({ id, showMastered })` |
| | `metadata.lastViewedIndex: number` | — | `flashcards.update({ id, metadata: { lastViewedIndex } })` (web `useUpdateFlashcardProgress`) |
| Quizzes | `metadata.userAnswers: Record<questionIndex, selectedOption>` | question index | `quizzes.submitAnswer({ id, questionIndex, selectedOption })` |
| | `metadata.lastViewedIndex` | — | `quizzes.update({ id, metadata: { lastViewedIndex } })` (`useUpdateQuizProgress`) |
| | "Try again" | — | `quizzes.update({ id, metadata: { userAnswers: {}, lastViewedIndex: 0 } })` (`useResetQuizAnswers`) |
| Written questions | `metadata.userAnswers: Record<questionId, { answer, graded, submittedAt?, score?, maxScore?, feedback?, strengths?, improvements?, gradedAt? }>` | `questionsData[].id` | draft: `writtenQuestions.saveUserAnswerDraft({ id, questionId, answer })`; grade: action `writtenQuestions.grading.submitAndGrade` → `internal…getWrittenQuestionForUserInternal` + `internal…patchUserAnswer` (twice: "in progress", then graded) |
| | `metadata.lastViewedIndex` | — | `writtenQuestions.update(...)` (`useUpdateWrittenQuestionsProgress`) |
| | "Try again" | — | `writtenQuestions.update({ id, metadata: { userAnswers: {}, lastViewedIndex: 0 } })` (`useResetWrittenAnswers`) |

All of these call `assertCanEditNotebook` today, so viewers are refused. Read points that strip the owner's progress for viewers (PR 1): `flashcards.list/get/getDueCards`, `quizzes.list/get`, `writtenQuestions.list/get`, `notes.list` (before `summarizeListRow`), `notes.get`; fork strips in `_forkNotebook.ts`.

Grading today has **no** limit, plan gate or cost accounting: `submitAndGrade` calls the LLM for anyone who can edit. This PR adds the first grading limit (Task 8).

## Viewer progress shape (`studioProgress.progress`)

One object per (viewer, item), mirroring the shared row's per-user fields so the overlay puts each back where the web app already reads it:

```ts
{
  cards?: Record<cardIndex, { front: string; proficiency: CardProficiency }>; // flashcards
  showMastered?: boolean;                                                     // flashcards
  userAnswers?: Record<questionIndex, number>                                 // quizzes
             | Record<questionId, { answer, graded, score?, … }>;              // written questions
  lastViewedIndex?: number;                                                   // all three
}
```

- Flashcards and quizzes are keyed by entry index, like the shared row. A card review also stores the card's `front`; the overlay drops a review whose card front no longer matches, so a card the owner edits, deletes or reorders starts fresh instead of carrying another card's schedule.
- Written questions are keyed by question id, like the shared row (the web view reads `userAnswers[question.id]`).

---

## File map

**Backend**

| File | Change |
| --- | --- |
| `convex/schema.ts` | `studioProgress` table + 4 indexes |
| `convex/_model/practiceProgress.ts` (+ test) | `practiceItemType`, `applyViewerProgress`, `forViewer`, `with*` updaters, `savedCardProficiency` |
| `convex/_model/studioProgress.ts` (new, + test) | `getPracticeTarget`, `getViewerProgress`, `saveViewerProgress`, `listViewerProgressByItem`, `viewerPracticeRow(s)`, `deleteProgressRows` |
| `convex/studio/flashcards/index.ts` | overlay in `list`/`get`/`getDueCards`; viewer path in `submitCardReview`, `updatePreferences`; `remove` cleans progress |
| `convex/studio/quizzes/index.ts` | overlay in `list`/`get`; viewer path in `submitAnswer`; `remove` cleans progress |
| `convex/studio/writtenQuestions/index.ts` | overlay in `list`/`get`; viewer path in `saveUserAnswerDraft`; `getWrittenQuestionForUserInternal` opens to viewers; `patchUserAnswer` takes `userId` and routes; `remove` cleans progress |
| `convex/studio/writtenQuestions/grading.ts` (+ new test) | per-caller hourly limit; passes `userId` |
| `convex/_lib/rateLimits.ts` | `writtenAnswerGrade` window |
| `convex/notes/index.ts` | overlay in `list`/`get` |
| `convex/studio/practice.ts` (new) | `setLastViewedIndex`, `resetAnswers`, `deleteProgressBatch`, `deletePracticeProgress` |
| `convex/notebooks/index.ts` | `remove` cleans progress |
| `convex/account/_purge.ts`, `convex/account/deletion.test.ts` | purge the user's progress and others' progress on the user's notebooks |
| `convex/studio/viewerPracticeProgress.test.ts` | overlay, practice, isolation, clean-up, fork tests |
| `convex/notebooks/viewerWriteGuard.test.ts` | practice mutations move from "refused" to "write only to the viewer's progress" |
| `convex/_generated/*` | codegen |

**Web**

| File | Change |
| --- | --- |
| `apps/web/src/features/studio/services/flashcardsApi.ts`, `quizzesApi.ts`, `writtenQuestionsApi.ts` | progress/reset hooks call `api.studio.practice.*` |
| `apps/web/src/features/studio/services/practiceProgressHooks.test.ts` (new) | hook → mutation wiring |
| `apps/web/src/features/studio/components/views/FlashcardView.tsx` (+ test) | `readOnly` hides only Edit mode; Study, Due/All and progress work |
| `apps/web/src/features/studio/components/views/QuizView.tsx` (+ test) | drop `readOnly` |
| `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx` (+ test) | drop `readOnly`; show the server's reason when grading is refused |
| `apps/web/src/features/studio/components/ActiveNoteView.tsx` | stop passing `readOnly` to quiz and written views |
| `apps/web/src/features/studio/components/practice/ForkToPractiseNote.tsx` | delete |

---

## Task 1: Schema

**Files:** Modify `convex/schema.ts`

The table is new, so this is a pure widen (no migration). No existing table gets an index.

- [ ] **Step 1: Add the table.** In `convex/schema.ts`, directly after the `writtenQuestions: defineTable({...})...` block (it ends with `.index("by_status_and_updatedAt", ["status", "updatedAt"]),`) and before the `// Chat` comment, add:

```ts
  // A public notebook viewer's own practice progress on one flashcard set, quiz or written-question
  // set. Owners and editors practise on the shared row instead (convex/_model/studioProgress.ts).
  studioProgress: defineTable({
    userId: v.id("users"),
    itemType: v.union(
      v.literal("flashcards"),
      v.literal("quizzes"),
      v.literal("writtenQuestions")
    ),
    /** The flashcards / quizzes / writtenQuestions row id. */
    itemId: v.string(),
    notebookId: v.id("notebooks"),
    /** Mirrors the shared row's per-user fields; shape in convex/_model/practiceProgress.ts. */
    progress: v.any(),
    updatedAt: v.number(),
  })
    // One viewer's progress on one item (every practice read and write).
    .index("by_user_and_item", ["userId", "itemId"])
    // One viewer's progress across a notebook (list overlays) and, by prefix, account purge.
    .index("by_user_and_notebook", ["userId", "notebookId"])
    // Every viewer's progress on a notebook (notebook deletion, purge of the notebook's owner).
    .index("by_notebook", ["notebookId"])
    // Every viewer's progress on an item (studio item deletion).
    .index("by_item", ["itemId"]),
```

- [ ] **Step 2: Typecheck.** `bun run typecheck:convex`. Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add convex/schema.ts
git commit -m "feat(studio): studioProgress table for public notebook viewers"
```

---

## Task 2: Pure overlay and update helpers

**Files:** Modify `convex/_model/practiceProgress.ts`, test `convex/_model/practiceProgress.test.ts`

- [ ] **Step 1: Write failing tests.** In `convex/_model/practiceProgress.test.ts`, replace the import block with:

```ts
import { describe, expect, test } from "vitest";
import {
  applyViewerProgress,
  forViewer,
  practiceItemType,
  savedCardProficiency,
  withCardReview,
  withLastViewedIndex,
  withoutAnswers,
  withoutFlashcardProgress,
  withoutPracticeProgress,
  withoutQuizProgress,
  withoutWrittenQuestionProgress,
  withQuizAnswer,
  withShowMastered,
  withWrittenAnswer,
  withWrittenDraft,
} from "./practiceProgress";
```

and append:

```ts
const REVIEWED = {
  interval: 1,
  easeFactor: 2.5,
  streak: 1,
  totalReviews: 1,
  correctCount: 1,
  incorrectCount: 0,
};

describe("practiceItemType", () => {
  test("names the practice table for a table name or list tag", () => {
    expect(practiceItemType("flashcards")).toBe("flashcards");
    expect(practiceItemType("flashcard")).toBe("flashcards");
    expect(practiceItemType("quiz")).toBe("quizzes");
    expect(practiceItemType("writtenQuestions")).toBe("writtenQuestions");
    expect(practiceItemType("report")).toBeNull();
  });
});

describe("applyViewerProgress", () => {
  test("lays a viewer's card reviews, Due/All choice and last card over a stripped deck", () => {
    const row = {
      cardsData: [
        { front: "Q1", back: "A1" },
        { front: "Q2", back: "A2" },
      ],
      metadata: { difficulty: "hard" },
    };
    const progress = {
      cards: { "1": { front: "Q2", proficiency: REVIEWED } },
      showMastered: true,
      lastViewedIndex: 1,
    };

    expect(applyViewerProgress("flashcards", row, progress)).toEqual({
      cardsData: [
        { front: "Q1", back: "A1" },
        { front: "Q2", back: "A2", proficiency: REVIEWED },
      ],
      metadata: { difficulty: "hard", showMastered: true, lastViewedIndex: 1 },
    });
    // The row passed in is not mutated.
    expect(row.cardsData[1]).not.toHaveProperty("proficiency");
  });

  test("drops a card review when the card at that index has changed", () => {
    const row = { cardsData: [{ front: "Edited", back: "A" }] };
    const progress = { cards: { "0": { front: "Original", proficiency: REVIEWED } } };
    expect(applyViewerProgress("flashcard", row, progress).cardsData).toEqual([
      { front: "Edited", back: "A" },
    ]);
  });

  test("lays a viewer's answers over a quiz or written set", () => {
    const quiz = { metadata: { difficulty: "easy" } };
    expect(
      applyViewerProgress("quiz", quiz, { userAnswers: { 0: 1 }, lastViewedIndex: 2 }).metadata
    ).toEqual({ difficulty: "easy", userAnswers: { 0: 1 }, lastViewedIndex: 2 });

    const written = { questionType: "short" };
    expect(
      applyViewerProgress("writtenQuestions", written, {
        userAnswers: { q1: { answer: "Mine", graded: false } },
      })
    ).toEqual({
      questionType: "short",
      metadata: { userAnswers: { q1: { answer: "Mine", graded: false } } },
    });
  });

  test("leaves the row alone without progress, or for other types", () => {
    const row = { metadata: { difficulty: "easy" } };
    expect(applyViewerProgress("quizzes", row, undefined)).toBe(row);
    expect(applyViewerProgress("report", row, { lastViewedIndex: 3 })).toBe(row);
  });
});

describe("forViewer", () => {
  test("replaces the owner's progress with the viewer's", () => {
    const row = { metadata: { difficulty: "easy", userAnswers: { 0: 1 }, lastViewedIndex: 4 } };
    expect(forViewer("quizzes", row, { userAnswers: { 0: 0 } }).metadata).toEqual({
      difficulty: "easy",
      userAnswers: { 0: 0 },
    });
    expect(forViewer("quizzes", row, undefined).metadata).toEqual({ difficulty: "easy" });
  });
});

describe("viewer progress updates", () => {
  test("a card review is stored by index with the card's front", () => {
    const progress = withCardReview({ showMastered: true }, 2, "Q3", REVIEWED);
    expect(progress).toEqual({
      showMastered: true,
      cards: { "2": { front: "Q3", proficiency: REVIEWED } },
    });
    expect(savedCardProficiency(progress, 2, "Q3")).toEqual(REVIEWED);
    expect(savedCardProficiency(progress, 2, "Changed")).toBeUndefined();
    expect(savedCardProficiency(undefined, 0, "Q1")).toBeUndefined();
  });

  test("preferences and position replace only their own field", () => {
    expect(withShowMastered({ lastViewedIndex: 4 }, false)).toEqual({
      lastViewedIndex: 4,
      showMastered: false,
    });
    expect(withLastViewedIndex(undefined, 3)).toEqual({ lastViewedIndex: 3 });
  });

  test("quiz answers merge by question index", () => {
    expect(withQuizAnswer({ userAnswers: { 0: 1 } }, 2, 0)).toEqual({
      userAnswers: { 0: 1, 2: 0 },
    });
  });

  test("a written draft keeps an earlier grade; a graded answer replaces the entry", () => {
    const graded = { userAnswers: { q1: { answer: "Old", graded: true, score: 3 } } };
    expect(withWrittenDraft(graded, "q1", "New")).toEqual({
      userAnswers: { q1: { answer: "New", graded: true, score: 3 } },
    });
    expect(withWrittenDraft(undefined, "q2", "Fresh")).toEqual({
      userAnswers: { q2: { graded: false, answer: "Fresh" } },
    });
    expect(
      withWrittenAnswer(graded, "q1", { answer: "Again", graded: false, submittedAt: 5 })
    ).toEqual({ userAnswers: { q1: { answer: "Again", graded: false, submittedAt: 5 } } });
  });

  test("Try again clears the answers and goes back to the start", () => {
    expect(withoutAnswers({ userAnswers: { 0: 1 }, lastViewedIndex: 4 })).toEqual({
      userAnswers: {},
      lastViewedIndex: 0,
    });
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/_model/practiceProgress.test.ts`. Expected: FAIL (`applyViewerProgress` etc. are not exported).

- [ ] **Step 3: Implement.** In `convex/_model/practiceProgress.ts`, replace lines 1–9 (the doc comment and `type PracticeRow = { metadata?: unknown };`) with:

```ts
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
```

The key constants and `without*` helpers below stay as they are. Append to the end of the file:

```ts
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
```

`ViewerProgress` stays unexported on purpose (Knip flags exported types nobody imports; the convex tsconfig emits no declarations).

- [ ] **Step 4: Run tests.** `bun run test:convex -- convex/_model/practiceProgress.test.ts`. Expected: PASS (old strip tests included).

- [ ] **Step 5: Commit.**

```bash
git add convex/_model/practiceProgress.ts convex/_model/practiceProgress.test.ts
git commit -m "feat(studio): pure helpers to overlay and update a viewer's practice progress"
```

---

## Task 3: Viewer progress storage helpers

**Files:** Create `convex/_model/studioProgress.ts`, `convex/_model/studioProgress.test.ts`

- [ ] **Step 1: Write failing tests.** Create `convex/_model/studioProgress.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  deleteProgressRows,
  getPracticeTarget,
  getViewerProgress,
  listViewerProgressByItem,
  saveViewerProgress,
} from "./studioProgress";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function setup() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const editor = await ctx.db.insert("users", { name: "Editor" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Public",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    });
    const privateNotebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Private",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notebookMembers", {
      notebookId,
      userId: editor,
      role: "editor",
      joinedAt: now,
    });
    return { owner, editor, viewer, notebookId, privateNotebookId };
  });
  return { t, ...ids };
}

function key(userId: Id<"users">, notebookId: Id<"notebooks">, itemId: string) {
  return { userId, notebookId, itemId, itemType: "quizzes" as const };
}

describe("getPracticeTarget", () => {
  test("owners and editors practise on the shared row, a public notebook's viewer on their own", async () => {
    const { t, owner, editor, viewer, notebookId } = await setup();
    await t.run(async (ctx) => {
      expect(await getPracticeTarget(ctx, notebookId, owner)).toBe("shared");
      expect(await getPracticeTarget(ctx, notebookId, editor)).toBe("shared");
      expect(await getPracticeTarget(ctx, notebookId, viewer)).toBe("viewer");
    });
  });

  test("anyone else is refused", async () => {
    const { t, viewer, privateNotebookId } = await setup();
    await expect(
      t.run((ctx) => getPracticeTarget(ctx, privateNotebookId, viewer))
    ).rejects.toThrow("Notebook not found");
  });
});

describe("saveViewerProgress", () => {
  test("creates the viewer's row, then updates it in place", async () => {
    const { t, viewer, notebookId } = await setup();
    await t.run(async (ctx) => {
      await saveViewerProgress(ctx, key(viewer, notebookId, "quiz1"), () => ({
        userAnswers: { 0: 1 },
      }));
      await saveViewerProgress(ctx, key(viewer, notebookId, "quiz1"), (current) => ({
        ...(current as object),
        lastViewedIndex: 2,
      }));
      const rows = await ctx.db.query("studioProgress").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: viewer,
        notebookId,
        itemType: "quizzes",
        itemId: "quiz1",
        progress: { userAnswers: { 0: 1 }, lastViewedIndex: 2 },
      });
      expect((await getViewerProgress(ctx, viewer, "quiz1"))?.progress).toEqual(rows[0].progress);
    });
  });
});

describe("listViewerProgressByItem", () => {
  test("returns only this viewer's progress in this notebook, by item", async () => {
    const { t, owner, viewer, notebookId, privateNotebookId } = await setup();
    await t.run(async (ctx) => {
      await saveViewerProgress(ctx, key(viewer, notebookId, "a"), () => ({ lastViewedIndex: 1 }));
      await saveViewerProgress(ctx, key(owner, notebookId, "a"), () => ({ lastViewedIndex: 9 }));
      await saveViewerProgress(ctx, key(viewer, privateNotebookId, "b"), () => ({}));
      const byItem = await listViewerProgressByItem(ctx, viewer, notebookId);
      expect([...byItem.entries()]).toEqual([["a", { lastViewedIndex: 1 }]]);
    });
  });
});

describe("deleteProgressRows", () => {
  test("deletes by item or by notebook, at most `limit` at a time", async () => {
    const { t, owner, viewer, notebookId, privateNotebookId } = await setup();
    await t.run(async (ctx) => {
      await saveViewerProgress(ctx, key(viewer, notebookId, "a"), () => ({}));
      await saveViewerProgress(ctx, key(owner, notebookId, "a"), () => ({}));
      await saveViewerProgress(ctx, key(viewer, notebookId, "b"), () => ({}));
      await saveViewerProgress(ctx, key(viewer, privateNotebookId, "c"), () => ({}));

      expect(await deleteProgressRows(ctx, { itemId: "a" }, 1)).toBe(false);
      expect(await deleteProgressRows(ctx, { itemId: "a" }, 10)).toBe(true);
      expect(await deleteProgressRows(ctx, { notebookId }, 10)).toBe(true);
      const left = await ctx.db.query("studioProgress").collect();
      expect(left.map((row) => row.itemId)).toEqual(["c"]);
    });
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/_model/studioProgress.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `convex/_model/studioProgress.ts`:

```ts
/**
 * A public notebook viewer's own practice progress (`studioProgress`). Owners and editors keep
 * practising on the shared studio row; a viewer's reviews, answers, drafts, grades and position
 * are stored here, one row per (viewer, item), and laid over the stripped shared row on read.
 * Progress shapes and the overlay itself are pure helpers in `practiceProgress.ts`.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertCanReadNotebook } from "../_lib/notebookAccess";
import { forViewer, type PracticeItemType, practiceItemType } from "./practiceProgress";

type ProgressKey = {
  userId: Id<"users">;
  itemType: PracticeItemType;
  itemId: string;
  notebookId: Id<"notebooks">;
};

/** A notebook's or a studio item's progress rows, for clean-up. */
export type ProgressScope = { notebookId: Id<"notebooks"> } | { itemId: string };

/**
 * Where a practice write goes: the shared row for the owner and editors, the caller's own
 * progress for a public notebook's viewer. Throws "Notebook not found" for anyone else.
 */
export async function getPracticeTarget(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<"shared" | "viewer"> {
  const { access } = await assertCanReadNotebook(ctx, notebookId, userId);
  return access === "viewer" ? "viewer" : "shared";
}

export async function getViewerProgress(
  ctx: QueryCtx,
  userId: Id<"users">,
  itemId: string
): Promise<Doc<"studioProgress"> | null> {
  return await ctx.db
    .query("studioProgress")
    .withIndex("by_user_and_item", (q) => q.eq("userId", userId).eq("itemId", itemId))
    .unique();
}

/** Creates or updates the viewer's progress on one item with `update(current progress)`. */
export async function saveViewerProgress(
  ctx: MutationCtx,
  key: ProgressKey,
  update: (current: unknown) => unknown
): Promise<void> {
  const existing = await getViewerProgress(ctx, key.userId, key.itemId);
  const progress = update(existing?.progress);
  const updatedAt = Date.now();
  if (existing) {
    await ctx.db.patch("studioProgress", existing._id, { progress, updatedAt });
  } else {
    await ctx.db.insert("studioProgress", { ...key, progress, updatedAt });
  }
}

/** The viewer's progress on every item of a notebook they've practised, by item id. */
export async function listViewerProgressByItem(
  ctx: QueryCtx,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<Map<string, unknown>> {
  const rows = await ctx.db
    .query("studioProgress")
    .withIndex("by_user_and_notebook", (q) => q.eq("userId", userId).eq("notebookId", notebookId))
    .collect();
  return new Map(rows.map((row) => [row.itemId, row.progress]));
}

/** What a viewer sees of one practice row (rows of other types come back unchanged). */
export async function viewerPracticeRow<T extends { _id: string }>(
  ctx: QueryCtx,
  type: string,
  row: T,
  userId: Id<"users">
): Promise<T> {
  const progress =
    practiceItemType(type) === null
      ? undefined
      : (await getViewerProgress(ctx, userId, row._id))?.progress;
  return forViewer(type, row, progress);
}

/** What a viewer sees of a notebook's rows of one practice type. */
export async function viewerPracticeRows<T extends { _id: string }>(
  ctx: QueryCtx,
  type: PracticeItemType,
  rows: T[],
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const byItem = await listViewerProgressByItem(ctx, userId, notebookId);
  return rows.map((row) => forViewer(type, row, byItem.get(row._id)));
}

/** Deletes up to `limit` progress rows in `scope`; true when none are left. */
export async function deleteProgressRows(
  ctx: MutationCtx,
  scope: ProgressScope,
  limit: number
): Promise<boolean> {
  const rows =
    "itemId" in scope
      ? await ctx.db
          .query("studioProgress")
          .withIndex("by_item", (q) => q.eq("itemId", scope.itemId))
          .take(limit)
      : await ctx.db
          .query("studioProgress")
          .withIndex("by_notebook", (q) => q.eq("notebookId", scope.notebookId))
          .take(limit);
  for (const row of rows) {
    await ctx.db.delete("studioProgress", row._id);
  }
  return rows.length < limit;
}
```

- [ ] **Step 4: Run tests.** `bun run test:convex -- convex/_model/studioProgress.test.ts`. Expected: PASS.

- [ ] **Step 5: Codegen and typecheck.** `npx convex codegen`, then `bun run typecheck:convex`. Expected: `convex/_generated/api.d.ts` gains `_model/studioProgress`; typecheck PASS.

- [ ] **Step 6: Commit.**

```bash
git add convex/_model/studioProgress.ts convex/_model/studioProgress.test.ts convex/_generated
git commit -m "feat(studio): storage helpers for a viewer's practice progress"
```

---

## Task 4: Overlay the viewer's progress in every studio read

**Files:** Modify `convex/studio/flashcards/index.ts`, `convex/studio/quizzes/index.ts`, `convex/studio/writtenQuestions/index.ts`, `convex/notes/index.ts`; test `convex/studio/viewerPracticeProgress.test.ts`

The overlay goes exactly where PR 1 strips: `flashcards.list/get/getDueCards`, `quizzes.list/get`, `writtenQuestions.list/get`, `notes.list` (before `summarizeListRow`), `notes.get`.

- [ ] **Step 1: Extend the test setup.** In `convex/studio/viewerPracticeProgress.test.ts`, replace everything above `describe("practice progress on a public notebook", ...)` with:

```ts
/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, [
  "./notes/index.ts",
  "./studio/flashcards/index.ts",
  "./studio/quizzes/index.ts",
  "./studio/writtenQuestions/index.ts",
  "./notebooks/index.ts",
  "./notebooks/public.ts",
]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

const PROFICIENCY = { interval: 30, easeFactor: 2.6, streak: 4, totalReviews: 6 };

/** A public notebook whose owner has practised one deck, one quiz and one written set. */
async function setup() {
  const t = convexTest(schema, modules);
  // forkPublic calls the rate limiter.
  registerRateLimiter(t);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    const otherViewer = await ctx.db.insert("users", { name: "Other viewer" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Public",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    });
    const base = { userId: owner, notebookId, status: "completed", createdAt: now, updatedAt: now };
    const flashcardId = await ctx.db.insert("flashcards", {
      ...base,
      title: "Deck",
      cardsData: [{ front: "Q", back: "A", proficiency: PROFICIENCY }],
      metadata: { difficulty: "hard", showMastered: true, lastViewedIndex: 0 },
    });
    const quizId = await ctx.db.insert("quizzes", {
      ...base,
      title: "Quiz",
      questionsData: [{ question: "Q", options: ["a", "b"], correctAnswer: 1 }],
      metadata: { difficulty: "easy", userAnswers: { 0: 1 }, lastViewedIndex: 0 },
    });
    const writtenId = await ctx.db.insert("writtenQuestions", {
      ...base,
      title: "Written",
      questionType: "short",
      questionsData: [{ id: "q1", question: "Why?" }],
      metadata: {
        focus: "causes",
        userAnswers: { q1: { answer: "Because", graded: true, score: 4, feedback: "Good" } },
        lastViewedIndex: 0,
      },
    });
    return { owner, viewer, otherViewer, notebookId, flashcardId, quizId, writtenId };
  });
  return { t, ...ids };
}

type PracticeTable = "flashcards" | "quizzes" | "writtenQuestions";

async function seedProgress(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  notebookId: Id<"notebooks">,
  itemType: PracticeTable,
  itemId: string,
  progress: unknown
) {
  await t.run((ctx) =>
    ctx.db.insert("studioProgress", {
      userId,
      notebookId,
      itemType,
      itemId,
      progress,
      updatedAt: Date.now(),
    })
  );
}

async function allProgress(t: ReturnType<typeof convexTest>) {
  return await t.run((ctx) => ctx.db.query("studioProgress").collect());
}

/** A review state due tomorrow. */
const VIEWER_PROFICIENCY = {
  interval: 1,
  easeFactor: 2.5,
  streak: 1,
  totalReviews: 1,
  correctCount: 1,
  incorrectCount: 0,
  nextReviewDate: Date.now() + 86_400_000,
};
```

The four existing PR 1 tests below stay as they are; they still describe a viewer with no progress.

- [ ] **Step 2: Write failing tests.** Append:

```ts
describe("a viewer's own practice progress", () => {
  test("every studio read shows the viewer's progress instead of the owner's", async () => {
    const { t, viewer, notebookId, flashcardId, quizId, writtenId } = await setup();
    await seedProgress(t, viewer, notebookId, "flashcards", flashcardId, {
      cards: { "0": { front: "Q", proficiency: VIEWER_PROFICIENCY } },
      lastViewedIndex: 0,
    });
    await seedProgress(t, viewer, notebookId, "quizzes", quizId, { userAnswers: { 0: 0 } });
    await seedProgress(t, viewer, notebookId, "writtenQuestions", writtenId, {
      userAnswers: { q1: { answer: "Mine", graded: false } },
    });
    const asViewer = withAuth(t, viewer);

    const deck = await asViewer.query(api.studio.flashcards.index.get, { id: flashcardId });
    expect(deck?.cardsData).toEqual([{ front: "Q", back: "A", proficiency: VIEWER_PROFICIENCY }]);
    expect(deck?.metadata).toEqual({ difficulty: "hard", lastViewedIndex: 0 });
    const [listedDeck] = await asViewer.query(api.studio.flashcards.index.list, { notebookId });
    expect(listedDeck.cardsData).toEqual(deck?.cardsData);

    const quiz = await asViewer.query(api.studio.quizzes.index.get, { id: quizId });
    expect(quiz?.metadata).toEqual({ difficulty: "easy", userAnswers: { 0: 0 } });
    const [listedQuiz] = await asViewer.query(api.studio.quizzes.index.list, { notebookId });
    expect(listedQuiz.metadata).toEqual(quiz?.metadata);

    const written = await asViewer.query(api.studio.writtenQuestions.index.get, { id: writtenId });
    expect(written?.metadata).toEqual({
      focus: "causes",
      userAnswers: { q1: { answer: "Mine", graded: false } },
    });
    const [listedWritten] = await asViewer.query(api.studio.writtenQuestions.index.list, {
      notebookId,
    });
    expect(listedWritten.metadata).toEqual(written?.metadata);

    const rows = await asViewer.query(api.notes.index.list, { notebookId });
    const metadataByType = Object.fromEntries(rows.map((r) => [r._type as string, r.metadata]));
    expect(metadataByType).toEqual({
      flashcard: { difficulty: "hard", lastViewedIndex: 0 },
      quiz: { difficulty: "easy", userAnswers: { 0: 0 } },
      writtenQuestions: {
        focus: "causes",
        userAnswers: { q1: { answer: "Mine", graded: false } },
      },
    });
    const noteDeck = await asViewer.query(api.notes.index.get, {
      type: "flashcard",
      id: flashcardId,
    });
    expect((noteDeck as { cardsData: unknown[] }).cardsData).toEqual(deck?.cardsData);
  });

  test("due cards come from the viewer's own review state", async () => {
    const { t, viewer, otherViewer, notebookId, flashcardId } = await setup();
    await seedProgress(t, viewer, notebookId, "flashcards", flashcardId, {
      cards: { "0": { front: "Q", proficiency: VIEWER_PROFICIENCY } },
    });
    const nowMs = Date.now();

    expect(
      await withAuth(t, viewer).query(api.studio.flashcards.index.getDueCards, {
        id: flashcardId,
        nowMs,
      })
    ).toEqual([]);
    expect(
      await withAuth(t, otherViewer).query(api.studio.flashcards.index.getDueCards, {
        id: flashcardId,
        nowMs,
      })
    ).toEqual([{ index: 0, card: { front: "Q", back: "A" } }]);
  });

  test("two viewers don't see each other's progress, and the owner sees neither", async () => {
    const { t, owner, viewer, otherViewer, notebookId, quizId } = await setup();
    await seedProgress(t, viewer, notebookId, "quizzes", quizId, { userAnswers: { 0: 0 } });

    const theirs = await withAuth(t, otherViewer).query(api.studio.quizzes.index.get, {
      id: quizId,
    });
    expect(theirs?.metadata).toEqual({ difficulty: "easy" });
    const owners = await withAuth(t, owner).query(api.studio.quizzes.index.get, { id: quizId });
    expect(owners?.metadata).toEqual({
      difficulty: "easy",
      userAnswers: { 0: 1 },
      lastViewedIndex: 0,
    });
  });
});
```

- [ ] **Step 3: Run to see them fail.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts`. Expected: the new "every studio read …" and "due cards …" tests FAIL (viewers still see stripped rows only); the PR 1 tests PASS.

- [ ] **Step 4: Flashcard reads.** In `convex/studio/flashcards/index.ts`, replace `import { withoutFlashcardProgress } from "../../_model/practiceProgress";` with:

```ts
import { viewerPracticeRow, viewerPracticeRows } from "../../_model/studioProgress";
```

In `list`, replace the last two statements of the handler with:

```ts
    const flashcards = await Flashcards.listByNotebook(ctx, args.notebookId);
    // Review history on the shared row is the owner's; a viewer sees their own.
    return access === "viewer"
      ? await viewerPracticeRows(ctx, "flashcards", flashcards, userId, args.notebookId)
      : flashcards;
```

In `get`, replace `return access === "viewer" ? withoutFlashcardProgress(flashcard) : flashcard;` with:

```ts
    return access === "viewer"
      ? await viewerPracticeRow(ctx, "flashcards", flashcard, userId)
      : flashcard;
```

In `getDueCards`, replace `const visible = access === "viewer" ? withoutFlashcardProgress(flashcard) : flashcard;` with:

```ts
    const visible =
      access === "viewer" ? await viewerPracticeRow(ctx, "flashcards", flashcard, userId) : flashcard;
```

- [ ] **Step 5: Quiz reads.** In `convex/studio/quizzes/index.ts`, replace `import { withoutQuizProgress } from "../../_model/practiceProgress";` with `import { viewerPracticeRow, viewerPracticeRows } from "../../_model/studioProgress";`. In `list`:

```ts
    const quizzes = await Quizzes.listByNotebook(ctx, args.notebookId);
    // Answers on the shared row are the owner's; a viewer sees their own.
    return access === "viewer"
      ? await viewerPracticeRows(ctx, "quizzes", quizzes, userId, args.notebookId)
      : quizzes;
```

In `get`: `return access === "viewer" ? await viewerPracticeRow(ctx, "quizzes", quiz, userId) : quiz;`

- [ ] **Step 6: Written question reads.** In `convex/studio/writtenQuestions/index.ts`, replace `import { withoutWrittenQuestionProgress } from "../../_model/practiceProgress";` with `import { viewerPracticeRow, viewerPracticeRows } from "../../_model/studioProgress";`. In `list`:

```ts
    const sets = await WrittenQuestions.listByNotebook(ctx, args.notebookId);
    // Answers and grades on the shared row are the owner's; a viewer sees their own.
    return access === "viewer"
      ? await viewerPracticeRows(ctx, "writtenQuestions", sets, userId, args.notebookId)
      : sets;
```

In `get`:

```ts
    return access === "viewer"
      ? await viewerPracticeRow(ctx, "writtenQuestions", writtenQuestion, userId)
      : writtenQuestion;
```

- [ ] **Step 7: Notes reads.** In `convex/notes/index.ts`, replace `import { withoutPracticeProgress } from "../_model/practiceProgress";` with:

```ts
import { forViewer } from "../_model/practiceProgress";
import { listViewerProgressByItem, viewerPracticeRow } from "../_model/studioProgress";
```

In `list`, replace from `const results = await Promise.all(queries);` through the `as Array<Record<string, unknown> & { updatedAt: number }>;` cast with:

```ts
    const results = await Promise.all(queries);
    // Practice progress on a shared row is the owner's; a viewer sees their own instead.
    const viewerProgress =
      access === "viewer" ? await listViewerProgressByItem(ctx, userId, args.notebookId) : null;
    const allNotes = results.flat().map((item: Record<string, unknown> & { _type: string }) =>
      summarizeListRow(
        viewerProgress ? forViewer(item._type, item, viewerProgress.get(item._id as string)) : item
      )
    ) as Array<Record<string, unknown> & { updatedAt: number }>;
```

In `get`, replace `const visible = access === "viewer" ? withoutPracticeProgress(tableName, note) : note;` with:

```ts
    const visible =
      access === "viewer" ? await viewerPracticeRow(ctx, tableName, note, userId) : note;
```

- [ ] **Step 8: Run tests.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts convex/_lib/notebookListQueries.test.ts`. Expected: PASS.

- [ ] **Step 9: Typecheck.** `bun run typecheck:convex`. Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add convex/studio/flashcards/index.ts convex/studio/quizzes/index.ts convex/studio/writtenQuestions/index.ts convex/notes/index.ts convex/studio/viewerPracticeProgress.test.ts
git commit -m "feat(studio): show a public notebook viewer their own practice progress"
```

---

## Task 5: Flashcard reviews and Due/All for viewers

**Files:** Modify `convex/studio/flashcards/index.ts`; test `convex/studio/viewerPracticeProgress.test.ts`

- [ ] **Step 1: Write failing tests.** Append:

```ts
describe("a viewer practising flashcards", () => {
  test("a review is saved for the viewer only", async () => {
    const { t, owner, viewer, otherViewer, flashcardId } = await setup();
    const asViewer = withAuth(t, viewer);

    const reviewed = await asViewer.mutation(api.studio.flashcards.index.submitCardReview, {
      id: flashcardId,
      cardIndex: 0,
      rating: "good",
    });
    // A fresh history of one review, not the owner's six.
    expect(reviewed?.cardsData?.[0]).toMatchObject({ front: "Q", proficiency: { totalReviews: 1 } });
    expect(reviewed?.metadata).toEqual({ difficulty: "hard" });
    const again = await asViewer.mutation(api.studio.flashcards.index.submitCardReview, {
      id: flashcardId,
      cardIndex: 0,
      rating: "good",
    });
    expect(again?.cardsData?.[0]).toMatchObject({ proficiency: { totalReviews: 2 } });

    const shared = await t.run((ctx) => ctx.db.get(flashcardId));
    expect(shared?.cardsData).toEqual([{ front: "Q", back: "A", proficiency: PROFICIENCY }]);
    const theirs = await withAuth(t, otherViewer).query(api.studio.flashcards.index.get, {
      id: flashcardId,
    });
    expect(theirs?.cardsData).toEqual([{ front: "Q", back: "A" }]);
    const owners = await withAuth(t, owner).query(api.studio.flashcards.index.get, {
      id: flashcardId,
    });
    expect(owners?.cardsData).toEqual([{ front: "Q", back: "A", proficiency: PROFICIENCY }]);
  });

  test("a card the owner edits starts fresh for the viewer", async () => {
    const { t, owner, viewer, flashcardId } = await setup();
    await withAuth(t, viewer).mutation(api.studio.flashcards.index.submitCardReview, {
      id: flashcardId,
      cardIndex: 0,
      rating: "good",
    });
    await withAuth(t, owner).mutation(api.studio.flashcards.index.updateCard, {
      id: flashcardId,
      cardIndex: 0,
      front: "New Q",
    });

    const deck = await withAuth(t, viewer).query(api.studio.flashcards.index.get, {
      id: flashcardId,
    });
    expect(deck?.cardsData).toEqual([{ front: "New Q", back: "A" }]);
  });

  test("the Due/All choice is the viewer's own", async () => {
    const { t, viewer, flashcardId } = await setup();
    const updated = await withAuth(t, viewer).mutation(
      api.studio.flashcards.index.updatePreferences,
      { id: flashcardId, showMastered: false }
    );
    expect(updated?.metadata).toEqual({ difficulty: "hard", showMastered: false });
    const shared = await t.run((ctx) => ctx.db.get(flashcardId));
    expect(shared?.metadata).toEqual({
      difficulty: "hard",
      showMastered: true,
      lastViewedIndex: 0,
    });
  });

  test("nothing is saved once the notebook is unpublished", async () => {
    const { t, viewer, notebookId, flashcardId } = await setup();
    await t.run((ctx) => ctx.db.patch(notebookId, { isPublic: false }));
    await expect(
      withAuth(t, viewer).mutation(api.studio.flashcards.index.submitCardReview, {
        id: flashcardId,
        cardIndex: 0,
        rating: "good",
      })
    ).rejects.toThrow("Notebook not found");
    expect(await allProgress(t)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts`. Expected: the first three FAIL with "Access denied"; the unpublished one already PASSes.

- [ ] **Step 3: Implement.** In `convex/studio/flashcards/index.ts`, replace the `_model` imports with:

```ts
import * as Flashcards from "../../_model/flashcards";
import {
  savedCardProficiency,
  withCardReview,
  withShowMastered,
} from "../../_model/practiceProgress";
import {
  getPracticeTarget,
  saveViewerProgress,
  viewerPracticeRow,
  viewerPracticeRows,
} from "../../_model/studioProgress";
```

In `submitCardReview`, replace everything from `await assertCanEditNotebook(ctx, flashcard.notebookId, userId);` up to (not including) `const currentProficiency = card.proficiency;` with:

```ts
    const target = await getPracticeTarget(ctx, flashcard.notebookId, userId);

    const cardsData = flashcard.cardsData as any[];
    if (!cardsData || args.cardIndex < 0 || args.cardIndex >= cardsData.length) {
      throw new Error("Invalid card index");
    }

    const card = cardsData[args.cardIndex];

    if (target === "viewer") {
      // A viewer's review goes to their own progress; the shared deck is the owner's.
      const front = String((card as { front?: unknown }).front ?? "");
      await saveViewerProgress(
        ctx,
        {
          userId,
          itemType: "flashcards",
          itemId: flashcard._id,
          notebookId: flashcard.notebookId,
        },
        (current) =>
          withCardReview(
            current,
            args.cardIndex,
            front,
            Flashcards.updateProficiencyAfterReview(
              savedCardProficiency(current, args.cardIndex, front),
              args.rating
            )
          )
      );
      return await viewerPracticeRow(ctx, "flashcards", flashcard, userId);
    }

```

(The rest of the handler, from `const currentProficiency = card.proficiency;`, is the unchanged owner/editor path. `cardsData as any[]` is the existing line, not new `any`.)

In `updatePreferences`, replace `await assertCanEditNotebook(ctx, flashcard.notebookId, userId);` with:

```ts
    const target = await getPracticeTarget(ctx, flashcard.notebookId, userId);
    if (target === "viewer") {
      const { showMastered } = args;
      if (showMastered !== undefined) {
        await saveViewerProgress(
          ctx,
          {
            userId,
            itemType: "flashcards",
            itemId: flashcard._id,
            notebookId: flashcard.notebookId,
          },
          (current) => withShowMastered(current, showMastered)
        );
      }
      return await viewerPracticeRow(ctx, "flashcards", flashcard, userId);
    }
```

`updateCard`, `addCard`, `deleteCard`, `update`, `create` and `remove` keep `assertCanEditNotebook`.

- [ ] **Step 4: Run tests.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add convex/studio/flashcards/index.ts convex/studio/viewerPracticeProgress.test.ts
git commit -m "feat(studio): viewers save their own flashcard reviews and Due/All choice"
```

---

## Task 6: Quiz answers and written drafts for viewers

**Files:** Modify `convex/studio/quizzes/index.ts`, `convex/studio/writtenQuestions/index.ts`; test `convex/studio/viewerPracticeProgress.test.ts`

- [ ] **Step 1: Write failing tests.** Append:

```ts
describe("a viewer answering quizzes and written questions", () => {
  test("a quiz answer is saved for the viewer only", async () => {
    const { t, viewer, quizId } = await setup();
    const answered = await withAuth(t, viewer).mutation(api.studio.quizzes.index.submitAnswer, {
      id: quizId,
      questionIndex: 0,
      selectedOption: 0,
    });
    expect(answered?.metadata).toEqual({ difficulty: "easy", userAnswers: { 0: 0 } });
    const shared = await t.run((ctx) => ctx.db.get(quizId));
    expect(shared?.metadata).toEqual({
      difficulty: "easy",
      userAnswers: { 0: 1 },
      lastViewedIndex: 0,
    });
  });

  test("a written draft is saved for the viewer only", async () => {
    const { t, viewer, writtenId } = await setup();
    const asViewer = withAuth(t, viewer);
    await asViewer.mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: writtenId,
      questionId: "q1",
      answer: "Mine",
    });

    const mine = await asViewer.query(api.studio.writtenQuestions.index.get, { id: writtenId });
    expect(mine?.metadata?.userAnswers).toEqual({ q1: { graded: false, answer: "Mine" } });
    const shared = await t.run((ctx) => ctx.db.get(writtenId));
    expect(shared?.metadata?.userAnswers).toEqual({
      q1: { answer: "Because", graded: true, score: 4, feedback: "Good" },
    });
    await expect(
      asViewer.mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
        id: writtenId,
        questionId: "nope",
        answer: "x",
      })
    ).rejects.toThrow("Question not found");
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts`. Expected: both FAIL with "Access denied".

- [ ] **Step 3: Quizzes.** In `convex/studio/quizzes/index.ts`, replace the `studioProgress` import from Task 4 with:

```ts
import { withQuizAnswer } from "../../_model/practiceProgress";
import {
  getPracticeTarget,
  saveViewerProgress,
  viewerPracticeRow,
  viewerPracticeRows,
} from "../../_model/studioProgress";
```

In `submitAnswer`, replace `await assertCanEditNotebook(ctx, quiz.notebookId, userId);` with:

```ts
    const target = await getPracticeTarget(ctx, quiz.notebookId, userId);
    if (target === "viewer") {
      // A viewer's answer goes to their own progress; the shared quiz is the owner's.
      await saveViewerProgress(
        ctx,
        { userId, itemType: "quizzes", itemId: quiz._id, notebookId: quiz.notebookId },
        (current) => withQuizAnswer(current, args.questionIndex, args.selectedOption)
      );
      return await viewerPracticeRow(ctx, "quizzes", quiz, userId);
    }
```

- [ ] **Step 4: Written drafts.** In `convex/studio/writtenQuestions/index.ts`, replace the `studioProgress` import from Task 4 with:

```ts
import { withWrittenDraft } from "../../_model/practiceProgress";
import {
  getPracticeTarget,
  saveViewerProgress,
  viewerPracticeRow,
  viewerPracticeRows,
} from "../../_model/studioProgress";
```

Replace the body of `saveUserAnswerDraft`'s handler with:

```ts
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const existing = await WrittenQuestions.getWrittenQuestion(ctx, args.id);
    if (!existing) throw new Error("Written question set not found or access denied");
    const target = await getPracticeTarget(ctx, existing.notebookId, userId);
    const known = (existing.questionsData ?? []).some(
      (q: { id?: string }) => q?.id === args.questionId
    );
    if (!known) throw new Error("Question not found");
    if (args.answer.length > MAX_DRAFT_ANSWER_LENGTH) {
      throw new Error("Answer is too long to save");
    }
    if (target === "viewer") {
      await saveViewerProgress(
        ctx,
        {
          userId,
          itemType: "writtenQuestions",
          itemId: existing._id,
          notebookId: existing.notebookId,
        },
        (current) => withWrittenDraft(current, args.questionId, args.answer)
      );
      return;
    }
    await WrittenQuestions.saveWrittenQuestionUserAnswerDraft(
      ctx,
      existing,
      args.questionId,
      args.answer
    );
```

- [ ] **Step 5: Run tests.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts convex/studio/writtenQuestions/index.test.ts`. Expected: PASS (the existing "rejects a user who cannot edit the notebook" draft test still passes: its notebook is private, so the stranger gets "Notebook not found").

- [ ] **Step 6: Commit.**

```bash
git add convex/studio/quizzes/index.ts convex/studio/writtenQuestions/index.ts convex/studio/viewerPracticeProgress.test.ts
git commit -m "feat(studio): viewers save their own quiz answers and written drafts"
```

---

## Task 7: Last viewed position and "Try again"

**Files:** Create `convex/studio/practice.ts`; test `convex/studio/viewerPracticeProgress.test.ts`

Today both go through each type's `update` mutation, which also renames and edits the item and must stay edit-only. Two dedicated mutations replace those calls for everyone; the owner/editor path writes exactly what `update` wrote (merged `metadata`, bumped `updatedAt`). The file also holds the progress clean-up used by Task 9.

- [ ] **Step 1: Write failing tests.** Add `"./studio/practice.ts"` to the `preloadModules(modules, [...])` list at the top of `convex/studio/viewerPracticeProgress.test.ts`, then append:

```ts
describe("practice.setLastViewedIndex and practice.resetAnswers", () => {
  test("a viewer's position and Try again stay in their own progress", async () => {
    const { t, viewer, flashcardId, quizId, writtenId } = await setup();
    const asViewer = withAuth(t, viewer);
    await asViewer.mutation(api.studio.quizzes.index.submitAnswer, {
      id: quizId,
      questionIndex: 0,
      selectedOption: 0,
    });
    await asViewer.mutation(api.studio.practice.setLastViewedIndex, {
      itemType: "quizzes",
      itemId: quizId,
      index: 3,
    });
    expect((await asViewer.query(api.studio.quizzes.index.get, { id: quizId }))?.metadata).toEqual(
      { difficulty: "easy", userAnswers: { 0: 0 }, lastViewedIndex: 3 }
    );

    await asViewer.mutation(api.studio.practice.resetAnswers, {
      itemType: "quizzes",
      itemId: quizId,
    });
    expect((await asViewer.query(api.studio.quizzes.index.get, { id: quizId }))?.metadata).toEqual(
      { difficulty: "easy", userAnswers: {}, lastViewedIndex: 0 }
    );

    await asViewer.mutation(api.studio.practice.setLastViewedIndex, {
      itemType: "flashcards",
      itemId: flashcardId,
      index: 0,
    });
    await asViewer.mutation(api.studio.practice.resetAnswers, {
      itemType: "writtenQuestions",
      itemId: writtenId,
    });

    const shared = await t.run(async (ctx) => ({
      deck: await ctx.db.get(flashcardId),
      quiz: await ctx.db.get(quizId),
      written: await ctx.db.get(writtenId),
    }));
    expect(shared.deck?.metadata).toEqual({
      difficulty: "hard",
      showMastered: true,
      lastViewedIndex: 0,
    });
    expect(shared.quiz?.metadata).toEqual({
      difficulty: "easy",
      userAnswers: { 0: 1 },
      lastViewedIndex: 0,
    });
    expect(shared.written?.metadata).toMatchObject({ userAnswers: { q1: { answer: "Because" } } });
  });

  test("the owner's position and Try again still go on the shared row", async () => {
    const { t, owner, quizId, writtenId } = await setup();
    const asOwner = withAuth(t, owner);
    await asOwner.mutation(api.studio.practice.setLastViewedIndex, {
      itemType: "quizzes",
      itemId: quizId,
      index: 2,
    });
    expect((await t.run((ctx) => ctx.db.get(quizId)))?.metadata).toEqual({
      difficulty: "easy",
      userAnswers: { 0: 1 },
      lastViewedIndex: 2,
    });
    await asOwner.mutation(api.studio.practice.resetAnswers, {
      itemType: "writtenQuestions",
      itemId: writtenId,
    });
    expect((await t.run((ctx) => ctx.db.get(writtenId)))?.metadata).toEqual({
      focus: "causes",
      userAnswers: {},
      lastViewedIndex: 0,
    });
    expect(await allProgress(t)).toEqual([]);
  });

  test("an id from another table is refused", async () => {
    const { t, owner, flashcardId } = await setup();
    await expect(
      withAuth(t, owner).mutation(api.studio.practice.setLastViewedIndex, {
        itemType: "quizzes",
        itemId: flashcardId,
        index: 0,
      })
    ).rejects.toThrow("Studio item not found");
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts`. Expected: FAIL (`preloadModules: "./studio/practice.ts" is not in the modules map`).

- [ ] **Step 3: Implement.** Create `convex/studio/practice.ts`:

```ts
/**
 * Practice actions shared by flashcards, quizzes and written questions: remembering the last card
 * or question viewed, "Try again", and deleting viewers' progress when an item or notebook goes.
 * Owners and editors write to the shared row; a public notebook's viewer writes to their own
 * `studioProgress` row (`convex/_model/studioProgress.ts`).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx, mutation } from "../_generated/server";
import {
  type PracticeItemType,
  withLastViewedIndex,
  withoutAnswers,
} from "../_model/practiceProgress";
import {
  deleteProgressRows,
  getPracticeTarget,
  type ProgressScope,
  saveViewerProgress,
} from "../_model/studioProgress";
import { getAuthUserId } from "../auth";

/** Progress rows deleted per transaction when an item or notebook is deleted. */
const PROGRESS_DELETE_BATCH = 500;

const practiceItemTypeValidator = v.union(
  v.literal("flashcards"),
  v.literal("quizzes"),
  v.literal("writtenQuestions")
);

const progressScopeValidator = v.union(
  v.object({ notebookId: v.id("notebooks") }),
  v.object({ itemId: v.string() })
);

async function getPracticeItem(ctx: MutationCtx, itemType: PracticeItemType, itemId: string) {
  const id = ctx.db.normalizeId(itemType, itemId);
  const item = id === null ? null : await ctx.db.get(id);
  if (!item) throw new Error("Studio item not found");
  return item;
}

/** Remembers the last card or question viewed (the web app debounces it). */
export const setLastViewedIndex = mutation({
  args: { itemType: practiceItemTypeValidator, itemId: v.string(), index: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    if (!Number.isInteger(args.index) || args.index < 0) throw new Error("Invalid index");

    const item = await getPracticeItem(ctx, args.itemType, args.itemId);
    if ((await getPracticeTarget(ctx, item.notebookId, userId)) === "viewer") {
      await saveViewerProgress(
        ctx,
        { userId, itemType: args.itemType, itemId: item._id, notebookId: item.notebookId },
        (current) => withLastViewedIndex(current, args.index)
      );
      return null;
    }
    await ctx.db.patch(item._id, {
      metadata: { ...(item.metadata ?? {}), lastViewedIndex: args.index },
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** "Try again": clears the answers and goes back to the first question. */
export const resetAnswers = mutation({
  args: {
    itemType: v.union(v.literal("quizzes"), v.literal("writtenQuestions")),
    itemId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const item = await getPracticeItem(ctx, args.itemType, args.itemId);
    if ((await getPracticeTarget(ctx, item.notebookId, userId)) === "viewer") {
      await saveViewerProgress(
        ctx,
        { userId, itemType: args.itemType, itemId: item._id, notebookId: item.notebookId },
        withoutAnswers
      );
      return null;
    }
    await ctx.db.patch(item._id, {
      metadata: { ...(item.metadata ?? {}), userAnswers: {}, lastViewedIndex: 0 },
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Deletes every viewer's progress on a deleted studio item or notebook: one batch now, the rest
 * in scheduled batches, since a popular public notebook can have many viewers.
 */
export async function deletePracticeProgress(
  ctx: MutationCtx,
  scope: ProgressScope
): Promise<void> {
  const done = await deleteProgressRows(ctx, scope, PROGRESS_DELETE_BATCH);
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.studio.practice.deleteProgressBatch, { scope });
  }
}

export const deleteProgressBatch = internalMutation({
  args: { scope: progressScopeValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await deletePracticeProgress(ctx, args.scope);
    return null;
  },
});
```

If `ctx.db.patch(item._id, …)` does not typecheck on the three-table union id, switch on `args.itemType` and patch each table separately with the same object.

- [ ] **Step 4: Codegen.** `npx convex codegen`. Expected: `api.studio.practice.*` and `internal.studio.practice.deleteProgressBatch` appear in `convex/_generated/api.d.ts`.

- [ ] **Step 5: Run tests and typecheck.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts`, then `bun run typecheck:convex`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add convex/studio/practice.ts convex/studio/viewerPracticeProgress.test.ts convex/_generated
git commit -m "feat(studio): practice mutations for last viewed position and Try again"
```

---

## Task 8: Written-answer grading for viewers, on the caller's own limit

**Files:** Modify `convex/_lib/rateLimits.ts`, `convex/studio/writtenQuestions/index.ts`, `convex/studio/writtenQuestions/grading.ts`; create `convex/studio/writtenQuestions/grading.test.ts`

There is no grading limit today. This adds a per-user hourly window keyed by the caller, so a viewer's grades count against their own allowance (and the owner's against theirs).

- [ ] **Step 1: Write failing tests.** Create `convex/studio/writtenQuestions/grading.test.ts`:

```ts
/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { rateLimiter, WRITTEN_ANSWER_GRADES_PER_HOUR } from "../../_lib/rateLimits";
import { preloadModules } from "../../_testing/preloadModules.helpers";
import schema from "../../schema";

const { gradeAnswer } = vi.hoisted(() => ({ gradeAnswer: vi.fn() }));
vi.mock("../../_services/grading/WrittenQuestionsGradingService", () => ({
  WrittenQuestionsGradingService: class {
    gradeAnswer = gradeAnswer;
  },
}));

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, [
  "./studio/writtenQuestions/grading.ts",
  "./studio/writtenQuestions/index.ts",
]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

const GRADE = { score: 4, maxScore: 5, feedback: "Good", strengths: ["Clear"], improvements: [] };
const OWNER_ANSWER = { answer: "Owner's", graded: true, score: 2, maxScore: 5 };

async function setup() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Public",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    });
    const writtenId = await ctx.db.insert("writtenQuestions", {
      userId: owner,
      notebookId,
      title: "W",
      status: "completed",
      questionType: "short",
      questionsData: [
        {
          id: "q1",
          question: "Why?",
          questionType: "short",
          rubric: { maxPoints: 5, criteria: [] },
        },
      ],
      metadata: { userAnswers: { q1: OWNER_ANSWER } },
      createdAt: now,
      updatedAt: now,
    });
    return { owner, viewer, notebookId, writtenId };
  });
  return { t, ...ids };
}

beforeEach(() => {
  gradeAnswer.mockReset();
  gradeAnswer.mockResolvedValue(GRADE);
});

describe("writtenQuestions.grading.submitAndGrade", () => {
  test("a viewer's graded answer is saved for them, not on the shared set", async () => {
    const { t, viewer, writtenId } = await setup();
    const asViewer = withAuth(t, viewer);

    const result = await asViewer.action(api.studio.writtenQuestions.grading.submitAndGrade, {
      writtenQuestionsId: writtenId,
      questionId: "q1",
      answer: "Mine",
    });

    expect(result).toEqual({ success: true, score: 4, maxScore: 5 });
    const shared = await t.run((ctx) => ctx.db.get(writtenId));
    expect(shared?.metadata).toEqual({ userAnswers: { q1: OWNER_ANSWER } });
    const mine = await asViewer.query(api.studio.writtenQuestions.index.get, { id: writtenId });
    expect(mine?.metadata?.userAnswers?.q1).toMatchObject({
      answer: "Mine",
      graded: true,
      score: 4,
      maxScore: 5,
      feedback: "Good",
      strengths: ["Clear"],
    });
  });

  test("the owner's grade still goes on the shared set", async () => {
    const { t, owner, writtenId } = await setup();
    await withAuth(t, owner).action(api.studio.writtenQuestions.grading.submitAndGrade, {
      writtenQuestionsId: writtenId,
      questionId: "q1",
      answer: "Better",
    });
    const shared = await t.run((ctx) => ctx.db.get(writtenId));
    expect(shared?.metadata?.userAnswers?.q1).toMatchObject({
      answer: "Better",
      graded: true,
      score: 4,
    });
    expect(await t.run((ctx) => ctx.db.query("studioProgress").collect())).toEqual([]);
  });

  test("grading counts against the caller's own hourly limit", async () => {
    const { t, owner, viewer, writtenId } = await setup();
    await t.run((ctx) =>
      rateLimiter.limit(ctx, "writtenAnswerGrade", {
        key: viewer,
        count: WRITTEN_ANSWER_GRADES_PER_HOUR,
      })
    );
    const args = { writtenQuestionsId: writtenId, questionId: "q1", answer: "Mine" };

    await expect(
      withAuth(t, viewer).action(api.studio.writtenQuestions.grading.submitAndGrade, args)
    ).rejects.toThrow(/graded a lot of answers/);
    expect(gradeAnswer).not.toHaveBeenCalled();
    // The owner's allowance is their own.
    await expect(
      withAuth(t, owner).action(api.studio.writtenQuestions.grading.submitAndGrade, args)
    ).resolves.toMatchObject({ score: 4 });
  });

  test("a stranger to a private notebook is refused before grading", async () => {
    const { t, viewer, notebookId, writtenId } = await setup();
    await t.run((ctx) => ctx.db.patch(notebookId, { isPublic: false }));
    await expect(
      withAuth(t, viewer).action(api.studio.writtenQuestions.grading.submitAndGrade, {
        writtenQuestionsId: writtenId,
        questionId: "q1",
        answer: "Mine",
      })
    ).rejects.toThrow("Notebook not found");
    expect(gradeAnswer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/studio/writtenQuestions/grading.test.ts`. Expected: FAIL (`WRITTEN_ANSWER_GRADES_PER_HOUR` is not exported; the viewer is refused with "Access denied").

- [ ] **Step 3: Rate limit window.** In `convex/_lib/rateLimits.ts`, above `RATE_LIMIT_CONFIG` add:

```ts
/** AI grades of written answers per user per hour, owners and public-notebook viewers alike. */
export const WRITTEN_ANSWER_GRADES_PER_HOUR = 100;
```

and inside `RATE_LIMIT_CONFIG`, after `paperFullText`:

```ts
  /** AI grading of written answers (per user, per hour); each grade is one LLM call */
  writtenAnswerGrade: { kind: "fixed window", rate: WRITTEN_ANSWER_GRADES_PER_HOUR, period: HOUR },
```

- [ ] **Step 4: Open the internal load and route the answer write.** In `convex/studio/writtenQuestions/index.ts`, change the practice import to `import { withWrittenAnswer, withWrittenDraft } from "../../_model/practiceProgress";`.

Replace `getWrittenQuestionForUserInternal` with:

```ts
/**
 * Internal: Load a written-question set for someone who may practise on it: the owner, an editor
 * or a public notebook's viewer (actions without query auth). Throws for anyone else.
 */
export const getWrittenQuestionForUserInternal = internalQuery({
  args: { id: v.id("writtenQuestions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const wq = await WrittenQuestions.getWrittenQuestion(ctx, args.id);
    if (!wq) return null;
    await getPracticeTarget(ctx, wq.notebookId, args.userId);
    return wq;
  },
});
```

Replace `patchUserAnswer` with:

```ts
/**
 * Internal: Record one answer's grading state for `userId`: on the shared set for the owner and
 * editors, in their own progress for a public notebook's viewer.
 */
export const patchUserAnswer = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    userId: v.id("users"),
    questionId: v.string(),
    answerData: v.any(),
  },
  handler: async (ctx, args) => {
    const set = await WrittenQuestions.getWrittenQuestion(ctx, args.writtenQuestionId);
    if (!set) throw new Error("Written question set not found");
    const target = await getPracticeTarget(ctx, set.notebookId, args.userId);
    if (target === "viewer") {
      await saveViewerProgress(
        ctx,
        {
          userId: args.userId,
          itemType: "writtenQuestions",
          itemId: set._id,
          notebookId: set.notebookId,
        },
        (current) => withWrittenAnswer(current, args.questionId, args.answerData)
      );
      return;
    }
    await WrittenQuestions.patchWrittenQuestionUserAnswer(
      ctx,
      args.writtenQuestionId,
      args.questionId,
      args.answerData
    );
  },
});
```

(`assertCanEditNotebook` stays imported: `create`, `createInternal`, `update` and `remove` still use it.)

- [ ] **Step 5: Grading action.** In `convex/studio/writtenQuestions/grading.ts`, add imports:

```ts
import { InputValidationError } from "../../_lib/errors";
import { rateLimiter } from "../../_lib/rateLimits";
import { toConvexError } from "../../_lib/serviceErrors";
```

and below the imports:

```ts
const GRADING_RATE_LIMITED = "You've graded a lot of answers in the last hour. Try again later.";
```

After the `if (!question) { throw new Error("Question not found"); }` block, add:

```ts
    // Each grade is an LLM call, charged to the caller (owner, editor or viewer alike).
    const { ok } = await rateLimiter.limit(ctx, "writtenAnswerGrade", { key: userId });
    if (!ok) throw toConvexError(new InputValidationError(GRADING_RATE_LIMITED));
```

In both `ctx.runMutation(internal.studio.writtenQuestions.index.patchUserAnswer, { ... })` calls, add `userId,` after `writtenQuestionId: writtenQuestionsId,`. Change the action's doc comment to: `Submit an answer and grade it. The answer and grade are saved where the caller practises (the shared set, or a viewer's own progress); each grade counts against the caller's hourly grading limit.`

- [ ] **Step 6: Run tests.** `bun run test:convex -- convex/studio/writtenQuestions/grading.test.ts convex/_lib/limits.test.ts`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add convex/_lib/rateLimits.ts convex/studio/writtenQuestions/index.ts convex/studio/writtenQuestions/grading.ts convex/studio/writtenQuestions/grading.test.ts
git commit -m "feat(studio): viewers get written answers graded on their own hourly limit"
```

---

## Task 9: Delete viewers' progress with the item or notebook

**Files:** Modify `convex/studio/flashcards/index.ts`, `convex/studio/quizzes/index.ts`, `convex/studio/writtenQuestions/index.ts`, `convex/notebooks/index.ts`; test `convex/studio/viewerPracticeProgress.test.ts`

`removeNotebookWithRelated` (`convex/_model/notebooks.ts`) has one caller, `notebooks.remove`, and deliberately leaves per-notebook content (documents, studio rows) in place. The clean-up goes in `notebooks.remove` rather than inside `removeNotebookWithRelated`, because it may schedule a follow-up through `internal` (no `_model` file imports `_generated/api`). Studio rows survive notebook deletion today, so item-scoped and notebook-scoped clean-up are separate.

- [ ] **Step 1: Write failing tests.** In `convex/studio/viewerPracticeProgress.test.ts`, change the imports to `import { describe, expect, test, vi } from "vitest";` and `import { api, internal } from "../_generated/api";`, then append:

```ts
describe("cleaning up viewers' progress", () => {
  test("deleting a studio item deletes viewers' progress on it", async () => {
    const { t, owner, viewer, flashcardId, quizId, writtenId } = await setup();
    const asViewer = withAuth(t, viewer);
    await asViewer.mutation(api.studio.flashcards.index.submitCardReview, {
      id: flashcardId,
      cardIndex: 0,
      rating: "good",
    });
    await asViewer.mutation(api.studio.quizzes.index.submitAnswer, {
      id: quizId,
      questionIndex: 0,
      selectedOption: 0,
    });
    await asViewer.mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: writtenId,
      questionId: "q1",
      answer: "Mine",
    });
    const asOwner = withAuth(t, owner);

    await asOwner.mutation(api.studio.flashcards.index.remove, { id: flashcardId });
    expect((await allProgress(t)).map((p) => p.itemId).sort()).toEqual(
      [quizId as string, writtenId as string].sort()
    );
    await asOwner.mutation(api.studio.quizzes.index.remove, { id: quizId });
    await asOwner.mutation(api.studio.writtenQuestions.index.remove, {
      writtenQuestionId: writtenId,
    });
    expect(await allProgress(t)).toEqual([]);
  });

  test("deleting the notebook deletes every viewer's progress on it", async () => {
    const { t, owner, viewer, otherViewer, notebookId, quizId } = await setup();
    for (const user of [viewer, otherViewer]) {
      await withAuth(t, user).mutation(api.studio.quizzes.index.submitAnswer, {
        id: quizId,
        questionIndex: 0,
        selectedOption: 0,
      });
    }
    await withAuth(t, owner).mutation(api.notebooks.index.remove, { id: notebookId });
    expect(await allProgress(t)).toEqual([]);
  });

  test("a large clean-up finishes in scheduled batches", async () => {
    vi.useFakeTimers();
    try {
      const { t, viewer, notebookId } = await setup();
      await t.run(async (ctx) => {
        for (let i = 0; i < 501; i++) {
          await ctx.db.insert("studioProgress", {
            userId: viewer,
            notebookId,
            itemType: "quizzes",
            itemId: `item${i}`,
            progress: {},
            updatedAt: 0,
          });
        }
      });
      await t.mutation(internal.studio.practice.deleteProgressBatch, { scope: { notebookId } });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await allProgress(t)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts`. Expected: the first two FAIL (rows left behind); the batch test already PASSes (Task 7).

- [ ] **Step 3: Item deletion.** Add `import { deletePracticeProgress } from "../practice";` to `convex/studio/flashcards/index.ts`, `convex/studio/quizzes/index.ts` and `convex/studio/writtenQuestions/index.ts`. Then:

- `flashcards.remove`: after `await Flashcards.deleteFlashcard(ctx, args.id);` add `await deletePracticeProgress(ctx, { itemId: args.id });`
- `quizzes.remove`: after `await Quizzes.deleteQuiz(ctx, args.id);` add `await deletePracticeProgress(ctx, { itemId: args.id });`
- `writtenQuestions.remove`: after `await WrittenQuestions.deleteWrittenQuestion(ctx, args.writtenQuestionId);` add `await deletePracticeProgress(ctx, { itemId: args.writtenQuestionId });`

- [ ] **Step 4: Notebook deletion.** In `convex/notebooks/index.ts`, add `import { deletePracticeProgress } from "../studio/practice";` and in `remove`, after `await Notebooks.removeNotebookWithRelated(ctx, args.id);`:

```ts
    // Viewers' practice progress goes with the notebook (its studio rows are kept, as before).
    await deletePracticeProgress(ctx, { notebookId: args.id });
```

- [ ] **Step 5: Run tests.** `bun run test:convex -- convex/studio/viewerPracticeProgress.test.ts convex/notebooks/index.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add convex/studio/flashcards/index.ts convex/studio/quizzes/index.ts convex/studio/writtenQuestions/index.ts convex/notebooks/index.ts convex/studio/viewerPracticeProgress.test.ts
git commit -m "feat(studio): delete viewers' practice progress with its item or notebook"
```

---

## Task 10: Account purge

**Files:** Modify `convex/account/_purge.ts`, `convex/account/deletion.test.ts`

Two cases: the deleted user's own progress (on anyone's notebooks), and other users' progress on the deleted user's notebooks (the purge deletes those notebook rows, so that progress would be orphaned). `deletion.test.ts` "covers every table that references a user" fails until `studioProgress` is purged.

- [ ] **Step 1: Write failing tests.** In `convex/account/deletion.test.ts`, add `"studioProgress",` to `DIRECT_USER_TABLES` (after `"notes",`). Then add inside `describe("account deletion", ...)`:

```ts
  test("deletes other users' practice progress on the user's notebooks, and keeps the rest", async () => {
    const t = setup();
    const doomed = await seedUser(t, "doomed@example.com");
    const viewer = await seedUser(t, "viewer@example.com");
    const { onDoomed, onOwn } = await t.run(async (ctx) => {
      const doomedNotebook = await ctx.db
        .query("notebooks")
        .withIndex("by_user", (q) => q.eq("userId", doomed.userId))
        .first();
      const viewerNotebook = await ctx.db
        .query("notebooks")
        .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
        .first();
      if (!doomedNotebook || !viewerNotebook) throw new Error("seed is missing a notebook");
      // biome-ignore lint/suspicious/noExplicitAny: validation is off; rows carry only links.
      const row = (notebookId: Id<"notebooks">) => ({ userId: viewer.userId, notebookId }) as any;
      return {
        onDoomed: await ctx.db.insert("studioProgress", row(doomedNotebook._id)),
        onOwn: await ctx.db.insert("studioProgress", row(viewerNotebook._id)),
      };
    });

    await deleteAndDrain(t, doomed.userId);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(onDoomed)).toBeNull();
      expect(await ctx.db.get(onOwn)).not.toBeNull();
    });
  });
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/account/deletion.test.ts`. Expected: "removes the user, …" FAILs (the doomed user's `studioProgress` row survives), "covers every table that references a user" FAILs with `["studioProgress"]`, and the new test FAILs.

- [ ] **Step 3: Implement.** In `convex/account/_purge.ts`, replace the notebooks step with:

```ts
  {
    // Viewers' practice progress on the user's public notebooks goes with the notebooks.
    tables: ["notebooks", "notebookShareLinks", "notebookMembers", "studioProgress"],
    run: (ctx, userId, budget) =>
      drainWithChildren(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("notebooks")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .take(n),
        (notebook) => [
          {
            take: (n) =>
              ctx.db
                .query("notebookShareLinks")
                .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("notebookMembers")
                .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("studioProgress")
                .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
                .take(n),
          },
        ]
      ),
  },
```

and, right after the `direct("notebookMembers", ...)` step:

```ts
  // Practice progress on other people's public notebooks.
  direct("studioProgress", (ctx, userId, n) =>
    ctx.db
      .query("studioProgress")
      .withIndex("by_user_and_notebook", (q) => q.eq("userId", userId))
      .take(n)
  ),
```

- [ ] **Step 4: Run tests.** `bun run test:convex -- convex/account/deletion.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add convex/account/_purge.ts convex/account/deletion.test.ts
git commit -m "feat(account): purge practice progress with the account and its notebooks"
```

---

## Task 11: Viewer write guard and fork

**Files:** Modify `convex/notebooks/viewerWriteGuard.test.ts`, `convex/studio/viewerPracticeProgress.test.ts`

- [ ] **Step 1: Move the practice calls out of the refused list.** In `convex/notebooks/viewerWriteGuard.test.ts`:

1. In the `// Practice on the owner's rows` section of `cases`, delete the five entries `"flashcards.submitCardReview"`, `"flashcards.updatePreferences"`, `"quizzes.submitAnswer"`, `"writtenQuestions.saveUserAnswerDraft"` and `"writtenQuestions.submitAndGrade"`. Keep `updateCard`, `addCard` and `deleteCard`, and rename the section comment to `// Card edits on the owner's deck`.
2. In the header comment, extend the "Deliberately not listed, because viewers may call them" sentence with: `the practice calls (flashcards.submitCardReview / updatePreferences, quizzes.submitAnswer, writtenQuestions.saveUserAnswerDraft, writtenQuestions.grading.submitAndGrade, practice.setLastViewedIndex / resetAnswers), which write only to the viewer's own studioProgress (tested below, in studio/viewerPracticeProgress.test.ts and in studio/writtenQuestions/grading.test.ts)`.
3. Add `"./studio/practice.ts"` to the `preloadModules(modules, [...])` list.
4. Append:

```ts
describe("a public notebook's viewer practises on their own progress", () => {
  test("practice calls leave the owner's rows untouched", async () => {
    const s = await seed();
    await s.asViewer.mutation(api.studio.flashcards.index.submitCardReview, {
      id: s.flashcardId,
      cardIndex: 0,
      rating: "good",
    });
    await s.asViewer.mutation(api.studio.flashcards.index.updatePreferences, {
      id: s.flashcardId,
      showMastered: true,
    });
    await s.asViewer.mutation(api.studio.quizzes.index.submitAnswer, {
      id: s.quizId,
      questionIndex: 0,
      selectedOption: 1,
    });
    await s.asViewer.mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: s.writtenId,
      questionId: "q1",
      answer: "x",
    });
    for (const [itemType, itemId] of [
      ["flashcards", s.flashcardId],
      ["quizzes", s.quizId],
      ["writtenQuestions", s.writtenId],
    ] as const) {
      await s.asViewer.mutation(api.studio.practice.setLastViewedIndex, {
        itemType,
        itemId,
        index: 1,
      });
    }
    await s.asViewer.mutation(api.studio.practice.resetAnswers, {
      itemType: "quizzes",
      itemId: s.quizId,
    });
    await s.asViewer.mutation(api.studio.practice.resetAnswers, {
      itemType: "writtenQuestions",
      itemId: s.writtenId,
    });

    const after = await s.t.run(async (ctx) => ({
      flashcard: await ctx.db.get(s.flashcardId),
      quiz: await ctx.db.get(s.quizId),
      written: await ctx.db.get(s.writtenId),
      progress: await ctx.db
        .query("studioProgress")
        .withIndex("by_user_and_notebook", (q) =>
          q.eq("userId", s.viewer).eq("notebookId", s.notebookId)
        )
        .collect(),
    }));
    expect(after.flashcard?.cardsData).toEqual([{ front: "Q", back: "A" }]);
    for (const row of [after.flashcard, after.quiz, after.written]) {
      expect(row?.metadata).toBeUndefined();
    }
    expect(after.progress.map((p) => p.itemType).sort()).toEqual([
      "flashcards",
      "quizzes",
      "writtenQuestions",
    ]);
  });
});
```

- [ ] **Step 2: Fork test.** Append to `convex/studio/viewerPracticeProgress.test.ts`:

```ts
describe("forking a public notebook", () => {
  test("leaves the viewer's progress behind", async () => {
    const { t, viewer, notebookId, flashcardId } = await setup();
    const asViewer = withAuth(t, viewer);
    await asViewer.mutation(api.studio.flashcards.index.submitCardReview, {
      id: flashcardId,
      cardIndex: 0,
      rating: "good",
    });

    const { newNotebookId } = await asViewer.mutation(api.notebooks.public.forkPublic, {
      notebookId,
    });

    const [forkedDeck] = await asViewer.query(api.studio.flashcards.index.list, {
      notebookId: newNotebookId,
    });
    expect(forkedDeck.cardsData).toEqual([{ front: "Q", back: "A" }]);
    expect((await allProgress(t)).map((p) => p.itemId)).toEqual([flashcardId]);
  });
});
```

- [ ] **Step 3: Run tests.** `bun run test:convex -- convex/notebooks/viewerWriteGuard.test.ts convex/studio/viewerPracticeProgress.test.ts`. Expected: PASS (fork needs no change: `performNotebookFork` never reads `studioProgress`).

- [ ] **Step 4: Commit.**

```bash
git add convex/notebooks/viewerWriteGuard.test.ts convex/studio/viewerPracticeProgress.test.ts
git commit -m "test(studio): viewer practice writes only to their own progress; forks leave it behind"
```

---

## Task 12: Web hooks call the practice mutations

**Files:** Modify `apps/web/src/features/studio/services/flashcardsApi.ts`, `quizzesApi.ts`, `writtenQuestionsApi.ts`; create `apps/web/src/features/studio/services/practiceProgressHooks.test.ts`

- [ ] **Step 1: Write failing tests.** Create `apps/web/src/features/studio/services/practiceProgressHooks.test.ts`:

```ts
// @vitest-environment jsdom
import { api } from "@convex/_generated/api";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateFlashcardProgress } from "./flashcardsApi";
import { useResetQuizAnswers, useUpdateQuizProgress } from "./quizzesApi";
import { useResetWrittenAnswers, useUpdateWrittenQuestionsProgress } from "./writtenQuestionsApi";

const { mockMutate, mockUseMutation } = vi.hoisted(() => {
  const mockMutate = vi.fn().mockResolvedValue(null);
  return { mockMutate, mockUseMutation: vi.fn((_ref: unknown) => mockMutate) };
});

vi.mock("convex/react", () => ({
  useMutation: mockUseMutation,
  useQuery: vi.fn(),
  useAction: vi.fn(),
}));

/** Vitest's `api` mock tags each reference with its path. */
const refName = (ref: unknown) => Object.prototype.toString.call(ref);

beforeEach(() => {
  vi.useFakeTimers();
  mockMutate.mockClear();
  mockUseMutation.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("practice progress hooks", () => {
  it.each([
    ["flashcards", () => useUpdateFlashcardProgress("item1", 2)],
    ["quizzes", () => useUpdateQuizProgress("item1", 2)],
    ["writtenQuestions", () => useUpdateWrittenQuestionsProgress("item1", 2)],
  ] as const)("saves the last %s position through practice.setLastViewedIndex", (itemType, hook) => {
    renderHook(hook);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(refName(mockUseMutation.mock.calls[0][0])).toBe(
      refName(api.studio.practice.setLastViewedIndex)
    );
    expect(mockMutate).toHaveBeenCalledWith({ itemType, itemId: "item1", index: 2 });
  });

  it("Try again resets through practice.resetAnswers", async () => {
    const { result: quiz } = renderHook(() => useResetQuizAnswers());
    await quiz.current("q1");
    expect(mockMutate).toHaveBeenLastCalledWith({ itemType: "quizzes", itemId: "q1" });

    const { result: written } = renderHook(() => useResetWrittenAnswers());
    await written.current("w1");
    expect(mockMutate).toHaveBeenLastCalledWith({ itemType: "writtenQuestions", itemId: "w1" });
    expect(refName(mockUseMutation.mock.calls.at(-1)?.[0])).toBe(
      refName(api.studio.practice.resetAnswers)
    );
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:web -- src/features/studio/services/practiceProgressHooks.test.ts`. Expected: FAIL (hooks call `…index.update`).

- [ ] **Step 3: Implement.**

`flashcardsApi.ts` — replace `useUpdateFlashcardProgress` (keep its doc comment and add the line "Viewers of a public notebook save to their own progress."):

```ts
export function useUpdateFlashcardProgress(flashcardId: string | null, currentIndex: number) {
  const setLastViewedIndex = useMutation(api.studio.practice.setLastViewedIndex);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (flashcardId == null) return;

    // Debounce the update to avoid excessive API calls during navigation
    timeoutRef.current = setTimeout(() => {
      setLastViewedIndex({ itemType: "flashcards", itemId: flashcardId, index: currentIndex });
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [flashcardId, currentIndex, setLastViewedIndex]);
}
```

`quizzesApi.ts` — replace `useResetQuizAnswers` and `useUpdateQuizProgress` with:

```ts
/**
 * Reset all answers for a quiz ("Try again")
 */
export function useResetQuizAnswers() {
  const reset = useMutation(api.studio.practice.resetAnswers);

  return async (quizId: string) => {
    return await reset({ itemType: "quizzes", itemId: quizId });
  };
}

/**
 * Persist quiz progress (last viewed question index)
 * Note: Does NOT use optimistic updates to avoid interfering with quiz state
 */
export function useUpdateQuizProgress(quizId: string | null, currentIndex: number) {
  const setLastViewedIndex = useMutation(api.studio.practice.setLastViewedIndex);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (quizId == null) return;

    // Debounce the update to avoid excessive API calls during navigation
    timeoutRef.current = setTimeout(() => {
      setLastViewedIndex({ itemType: "quizzes", itemId: quizId, index: currentIndex });
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [quizId, currentIndex, setLastViewedIndex]);
}
```

`writtenQuestionsApi.ts` — replace `useResetWrittenAnswers` and `useUpdateWrittenQuestionsProgress` with:

```ts
/**
 * Reset all answers for a written questions set ("Try again")
 */
export function useResetWrittenAnswers() {
  const reset = useMutation(api.studio.practice.resetAnswers);

  return async (id: string) => {
    return await reset({ itemType: "writtenQuestions", itemId: id });
  };
}

/**
 * Persist written questions progress (last viewed question index)
 * Note: Does NOT use optimistic updates to avoid interfering with questions state
 */
export function useUpdateWrittenQuestionsProgress(
  writtenQuestionsId: string | null,
  currentIndex: number
) {
  const setLastViewedIndex = useMutation(api.studio.practice.setLastViewedIndex);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (writtenQuestionsId == null) return;

    // Debounce the update to avoid excessive API calls during navigation
    timeoutRef.current = setTimeout(() => {
      setLastViewedIndex({
        itemType: "writtenQuestions",
        itemId: writtenQuestionsId,
        index: currentIndex,
      });
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [writtenQuestionsId, currentIndex, setLastViewedIndex]);
}
```

(`useRenameFlashcard` / `useRenameQuiz` / `useRenameWrittenQuestions` keep using `…index.update`.)

- [ ] **Step 4: Run tests and typecheck.** `bun run test:web -- src/features/studio/services/practiceProgressHooks.test.ts`, then `bun run typecheck:web`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/studio/services/flashcardsApi.ts apps/web/src/features/studio/services/quizzesApi.ts apps/web/src/features/studio/services/writtenQuestionsApi.ts apps/web/src/features/studio/services/practiceProgressHooks.test.ts
git commit -m "feat(web): save practice position and Try again through the practice mutations"
```

---

## Task 13: Open practice to viewers in the studio views

**Files:** Modify `apps/web/src/features/studio/components/views/FlashcardView.tsx` (+ test), `QuizView.tsx` (+ test), `WrittenQuestionsView.tsx` (+ test), `apps/web/src/features/studio/components/ActiveNoteView.tsx`; delete `apps/web/src/features/studio/components/practice/ForkToPractiseNote.tsx`

Read `docs/design/principles.md` first. Viewers keep every other read-only gate from PR 1 (no card edits, no report or sheet edits, no item menu, no tool grid); only practice opens.

- [ ] **Step 1: Write failing tests.**

`FlashcardView.test.tsx` — replace the two `read-only …` tests with:

```tsx
  it("read-only studies and saves its own progress, but has no Edit mode", async () => {
    const user = userEvent.setup();
    render(<FlashcardView note={makeNote()} readOnly />);
    expect(await screen.findByText("Front 1")).toBeInTheDocument();
    expect(screen.queryByText("Fork this notebook to practise.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Study Mode" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Edit Mode" })).not.toBeInTheDocument();
    expect(updateProgress).toHaveBeenCalledWith("fc1", 0);
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(updatePreferences).toHaveBeenCalledWith("fc1", { showMastered: true });
  });

  it("read-only starts on the viewer's own Due/All choice", () => {
    render(<FlashcardView note={makeNote(true)} readOnly />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Due" })).toHaveAttribute("aria-pressed", "false");
  });
```

`QuizView.test.tsx` — delete the test `"read-only locks the options, saves no progress and offers no retry"` (the prop goes away; the existing tests now cover everyone, including "clears the score and answers on Try Again").

`WrittenQuestionsView.test.tsx` — delete the `describe("WrittenQuestionsView read-only", ...)` block, add `import { ConvexError } from "convex/values";` to the imports, and append:

```tsx
describe("WrittenQuestionsView grading errors", () => {
  it("shows the server's reason when grading is refused", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const reason = "You've graded a lot of answers in the last hour. Try again later.";
    submitAnswer.mockRejectedValueOnce(
      new ConvexError({ type: "INPUT_VALIDATION_ERROR", detail: reason })
    );
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={makeNote()} />);

    await user.type(screen.getByRole("textbox"), "My answer");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(reason));
    alertSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:web -- src/features/studio/components/views/FlashcardView.test.tsx src/features/studio/components/views/WrittenQuestionsView.test.tsx`. Expected: the new FlashcardView tests and the grading-error test FAIL.

- [ ] **Step 3: FlashcardView.** In `FlashcardView.tsx`:

1. Delete `import { ForkToPractiseNote } from "../practice/ForkToPractiseNote";`.
2. Replace the `readOnly` prop doc with:

```tsx
  /**
   * Viewer of a public notebook: no Edit mode, since card edits change the shared deck. Study
   * reviews, the Due/All choice and the last card viewed save to the viewer's own progress.
   */
  readOnly?: boolean;
```

3. Replace the `showMastered` state initialiser (and the comment above it) with:

```tsx
  const [showMastered, setShowMastered] = useState<boolean>(
    (note.metadata as { showMastered?: boolean } | undefined)?.showMastered ?? false
  );
```

4. `useUpdateFlashcardProgress(readOnly ? null : note.id, stableCurrentIndex);` → `useUpdateFlashcardProgress(note.id, stableCurrentIndex);`
5. In the showMastered sync effect, delete `if (readOnly) return;`, change its dependency list to `[latestNote, showMastered]`, and its comment to `// Sync showMastered with server`.
6. In `setShowMasteredPreference`, delete `if (readOnly) return;`.
7. Below the `modeToggles` constant add:

```tsx
  // A viewer studies the shared deck but can't edit it.
  const visibleModeToggles = readOnly
    ? modeToggles.filter(({ value }) => value !== "edit")
    : modeToggles;
```

8. Replace the `{readOnly ? (<ForkToPractiseNote className="w-auto" />) : (<ButtonGroup …>…</ButtonGroup>)}` expression with just its `<ButtonGroup variant="tray" aria-label="Mode">…</ButtonGroup>` element, mapping `visibleModeToggles` instead of `modeToggles`.

- [ ] **Step 4: QuizView.** In `QuizView.tsx`: delete the `ForkToPractiseNote` import; delete `readOnly` (and its doc line) from `QuizViewProps` and from the component's destructuring; `useUpdateQuizProgress(note.id, stableCurrentIndex);`; in `handleSelect` use `if (isAnswered || reviewMode) return;`; in `ResultsSummary`'s `actions` render the Try Again `<Button>` unconditionally (remove the `{!readOnly && (…)}` wrapper); delete `{readOnly && !reviewMode && <ForkToPractiseNote />}`; on `QuizOption` use `disabled={isAnswered || reviewMode}`.

- [ ] **Step 5: WrittenQuestionsView.** In `WrittenQuestionsView.tsx`:

1. Delete the `ForkToPractiseNote` import; add `import { getServiceErrorMessage, parseServiceError } from "@/shared/utils/errorParser";`.
2. Delete `readOnly` (and its doc comment) from `WrittenQuestionsViewProps` and from the destructuring.
3. `useUpdateWrittenQuestionsProgress(note.id, stableCurrentIndex);`
4. In `flushDraft`, delete `if (readOnly) return;` and change its deps to `[saveDraftMutation, note.id]`.
5. In the autosave `useEffect`, delete `if (readOnly) return;` and its deps become `[currentQuestionId, currentDraft, currentDraftGraded, note.id, saveDraftMutation]`.
6. In `handleSubmitAnswer`: `if (!isAnswered || isSubmitting || gradePending) return;`, and replace the catch's `alert(...)` line with:

```tsx
      const parsed = parseServiceError(error);
      alert(
        parsed
          ? getServiceErrorMessage(parsed)
          : error instanceof Error
            ? error.message
            : "Failed to submit answer"
      );
```

7. In `handleNext`, delete the `} else if (readOnly) { setShowResults(true); }` branch.
8. Render the Try Again `<Button>` unconditionally (remove its `{!readOnly && (…)}` wrapper), delete `{readOnly && !reviewMode && <ForkToPractiseNote className="mb-6" />}`, set the textarea to `disabled={reviewMode}`, and change the submit condition to `{!isGraded && !reviewMode && (`.

- [ ] **Step 6: ActiveNoteView.** In `ActiveNoteView.tsx`: remove `readOnly={readOnly}` from `<QuizView>` and `<WrittenQuestionsView>` (keep it on `FlashcardView`, `SpreadsheetView` and the report-editor check), and change the prop doc to `/** Viewer of a public notebook: card, report and sheet edits are locked; practice saves to the viewer's own progress. */`.

- [ ] **Step 7: Delete the fork note.** `git rm apps/web/src/features/studio/components/practice/ForkToPractiseNote.tsx`, then `grep -rn "ForkToPractise" apps/web/src` → no output.

- [ ] **Step 8: Run tests and typecheck.** `bun run test:web -- src/features/studio`, then `bun run typecheck:web`. Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add apps/web/src/features/studio
git commit -m "feat(web): public notebook viewers practise flashcards, quizzes and written questions"
```

---

## Task 14: Manual check, validation gates and PR

- [ ] **Step 1: Manual check in the browser preview.** Push functions to the dev deployment with `npx convex dev --once` (another worktree may own `dev:convex`), then start `bun run dev:web` via the preview tool. As user A, publish a notebook with a flashcard deck, a quiz and a written set, and practise a little on each. As user B (viewer), open `/notebook/<id>`:
  - Flashcards: Browse and Study modes are there, Edit is not; review two cards; reload — the Due count and proficiency badges are B's, and B's last card is restored.
  - Quiz: answer two questions, reload — answers and position are B's; finish and press Try Again.
  - Written: type a draft, reload — it is still there; Submit grades it; Finish grades the rest.
  - As A, reload the same items — A's own progress is unchanged and B's answers are not visible.
  - As A, delete the quiz, then check in the Convex dashboard that `studioProgress` has no row for it.
  Take screenshots for the PR.
- [ ] **Step 2:** `bun run typecheck:web`, `bun run typecheck:convex` (one at a time). Expected: PASS.
- [ ] **Step 3:** `bun run lint` and `bun run lint:design`. Expected: PASS.
- [ ] **Step 4:** `bun run test:convex` and `bun run test:web`. Expected: PASS.
- [ ] **Step 5:** `npx convex codegen` and confirm `git status` shows no `convex/_generated` diff.
- [ ] **Step 6:** Push and open the PR against PR 1's branch:

```bash
git push -u origin feature/public-notebooks-progress
gh pr create --base feature/public-notebooks --title "feat(studio): saved practice progress for public notebook viewers" --body-file <body file in the scratchpad>
```

Body: summary (viewers practise with their own saved progress; owners and editors unchanged); the progress shape and keying (entry index for cards and quiz questions, with a card-front check; question id for written answers); the new `practice.setLastViewedIndex` / `practice.resetAnswers` mutations replacing the `update` calls; the new `writtenAnswerGrade` limit (100 per hour per caller, owners included: the first grading limit); clean-up on item delete, notebook delete and account purge; fork does not copy progress; screenshots from Step 1. End with the Claude Code attribution line.

---

## Self-review against the spec

| Spec requirement | Where |
| --- | --- |
| `studioProgress { userId, itemType, itemId, notebookId, progress, updatedAt }`, index `by_user_and_item` | Task 1 (plus `by_user_and_notebook`, `by_notebook`, `by_item` for overlays, purge and clean-up) |
| `progress` mirrors per-entry fields, keyed by entry index | Task 2 and "Viewer progress shape" (written answers keyed by question id, as on the shared row) |
| Viewer practice mutations write to `studioProgress` | Tasks 5, 6, 7, 8 |
| Studio `get`/`list` overlay the viewer's progress | Task 4 (also `getDueCards`, `notes.list`, `notes.get`) |
| Owner/editor behaviour unchanged | `"shared"` paths keep the old code; owner tests in Tasks 4, 5, 7, 8 |
| Written-answer grading counts against the viewer's own limit | Task 8 |
| Deleting a notebook deletes its rows; forking doesn't copy them | Tasks 9 and 11 (plus item deletion and account purge: Tasks 9, 10) |
| Tests: shared row untouched; overlay returns the viewer's state; two viewers isolated; owner unaffected | Tasks 4–11 |
