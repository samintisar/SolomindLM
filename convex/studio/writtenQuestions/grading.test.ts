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
