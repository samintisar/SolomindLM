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

describe("practice progress on a public notebook", () => {
  test("a viewer gets each practice item without the owner's progress", async () => {
    const { t, viewer, flashcardId, quizId, writtenId } = await setup();
    const asViewer = withAuth(t, viewer);

    const deck = await asViewer.query(api.studio.flashcards.index.get, { id: flashcardId });
    expect(deck?.cardsData).toEqual([{ front: "Q", back: "A" }]);
    expect(deck?.metadata).toEqual({ difficulty: "hard" });

    const quiz = await asViewer.query(api.studio.quizzes.index.get, { id: quizId });
    expect(quiz?.metadata).toEqual({ difficulty: "easy" });
    expect(quiz?.questionsData).toHaveLength(1);

    const written = await asViewer.query(api.studio.writtenQuestions.index.get, { id: writtenId });
    expect(written?.metadata).toEqual({ focus: "causes" });

    const due = await asViewer.query(api.studio.flashcards.index.getDueCards, {
      id: flashcardId,
      nowMs: Date.now(),
    });
    expect(due).toEqual([{ index: 0, card: { front: "Q", back: "A" } }]);
  });

  test("a viewer's lists leave out the owner's progress", async () => {
    const { t, viewer, notebookId } = await setup();
    const asViewer = withAuth(t, viewer);

    const [deck] = await asViewer.query(api.studio.flashcards.index.list, { notebookId });
    expect(deck.cardsData).toEqual([{ front: "Q", back: "A" }]);
    expect(deck.metadata).toEqual({ difficulty: "hard" });
    const [quiz] = await asViewer.query(api.studio.quizzes.index.list, { notebookId });
    expect(quiz.metadata).toEqual({ difficulty: "easy" });
    const [written] = await asViewer.query(api.studio.writtenQuestions.index.list, { notebookId });
    expect(written.metadata).toEqual({ focus: "causes" });

    const rows = await asViewer.query(api.notes.index.list, { notebookId });
    const metadataByType = Object.fromEntries(rows.map((r) => [r._type as string, r.metadata]));
    expect(metadataByType).toEqual({
      flashcard: { difficulty: "hard" },
      quiz: { difficulty: "easy" },
      writtenQuestions: { focus: "causes" },
    });
  });

  test("notes.get strips a viewer's single item too", async () => {
    const { t, viewer, flashcardId, quizId } = await setup();
    const asViewer = withAuth(t, viewer);

    const deck = await asViewer.query(api.notes.index.get, { type: "flashcard", id: flashcardId });
    expect(deck).toMatchObject({ cardsData: [{ front: "Q", back: "A" }] });
    expect((deck as { cardsData: unknown[] }).cardsData[0]).not.toHaveProperty("proficiency");
    const quiz = await asViewer.query(api.notes.index.get, { type: "quiz", id: quizId });
    expect((quiz as { metadata: unknown }).metadata).toEqual({ difficulty: "easy" });
  });

  test("the owner still sees their progress", async () => {
    const { t, owner, notebookId, flashcardId, quizId, writtenId } = await setup();
    const asOwner = withAuth(t, owner);

    const deck = await asOwner.query(api.studio.flashcards.index.get, { id: flashcardId });
    expect(deck?.cardsData).toEqual([{ front: "Q", back: "A", proficiency: PROFICIENCY }]);
    expect(deck?.metadata).toMatchObject({ showMastered: true, lastViewedIndex: 0 });
    const quiz = await asOwner.query(api.studio.quizzes.index.get, { id: quizId });
    expect(quiz?.metadata).toMatchObject({ userAnswers: { 0: 1 } });
    const written = await asOwner.query(api.studio.writtenQuestions.index.get, { id: writtenId });
    expect(written?.metadata).toMatchObject({ userAnswers: { q1: { score: 4 } } });

    const rows = await asOwner.query(api.notes.index.list, { notebookId });
    expect(rows.find((r) => r._type === "quiz")?.metadata).toMatchObject({
      userAnswers: { 0: 1 },
    });
  });
});

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
    expect(reviewed?.cardsData?.[0]).toMatchObject({
      front: "Q",
      proficiency: { totalReviews: 1 },
    });
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
