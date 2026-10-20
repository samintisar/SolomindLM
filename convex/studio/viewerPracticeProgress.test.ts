/// <reference types="vite/client" />
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
preloadModules(modules, ["./notes/index.ts"]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

const PROFICIENCY = { interval: 30, easeFactor: 2.6, streak: 4, totalReviews: 6 };

/** A public notebook whose owner has practised one deck, one quiz and one written set. */
async function setup() {
  const t = convexTest(schema, modules);
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
    return { owner, viewer, notebookId, flashcardId, quizId, writtenId };
  });
  return { t, ...ids };
}

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

  test("notes.get returns nothing when the type doesn't match the id's table", async () => {
    const { t, viewer, flashcardId } = await setup();
    const asViewer = withAuth(t, viewer);

    // A quiz-shaped strip would leave the deck's card proficiency in place.
    const mismatched = await asViewer.query(api.notes.index.get, {
      type: "quiz",
      id: flashcardId,
    });
    expect(mismatched).toBeNull();
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
