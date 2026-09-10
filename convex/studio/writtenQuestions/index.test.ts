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
        {
          id: "q1",
          question: "Q1?",
          questionType: "short",
          rubric: { maxPoints: 5, criteria: [] },
        },
        {
          id: "q2",
          question: "Q2?",
          questionType: "short",
          rubric: { maxPoints: 5, criteria: [] },
        },
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
    return (
      ((doc?.metadata as { userAnswers?: Record<string, Record<string, unknown>> }) ?? {})
        .userAnswers ?? {}
    );
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

  test("applies draft-over-draft without leaving stale keys", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const wqId = await seedWrittenQuestions(t, userId, notebookId);

    await withAuth(t, userId).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: wqId,
      questionId: "q1",
      answer: "first text",
    });
    await withAuth(t, userId).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: wqId,
      questionId: "q1",
      answer: "second text",
    });

    const answers = await readUserAnswers(t, wqId);
    expect(answers.q1).toEqual({ graded: false, answer: "second text" });
  });

  test("handles a written-question row whose metadata is undefined", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const wqId = await t.run(async (ctx) =>
      ctx.db.insert("writtenQuestions", {
        userId,
        notebookId,
        title: "WQ",
        status: "completed",
        questionType: "short",
        questionsData: [
          {
            id: "q1",
            question: "Q1?",
            questionType: "short",
            rubric: { maxPoints: 5, criteria: [] },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await withAuth(t, userId).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
      id: wqId,
      questionId: "q1",
      answer: "draft with no prior metadata",
    });

    const answers = await readUserAnswers(t, wqId);
    expect(answers.q1).toEqual({ graded: false, answer: "draft with no prior metadata" });
  });

  test("rejects an over-length draft answer", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const wqId = await seedWrittenQuestions(t, userId, notebookId);

    await expect(
      withAuth(t, userId).mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
        id: wqId,
        questionId: "q1",
        answer: "x".repeat(50_001),
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
