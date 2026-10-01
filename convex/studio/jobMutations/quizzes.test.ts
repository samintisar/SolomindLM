/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import { preloadModules } from "../../_testing/preloadModules.helpers";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./studio/jobMutations/quizzes.ts"]);

async function seedQuiz(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return ctx.db.insert("quizzes", {
      userId,
      notebookId,
      title: "Quiz",
      status: "generating",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

/** What the expand LLM tends to return: correct answer first, sometimes letter-prefixed. */
function llmQuestion(i: number) {
  return {
    question: `Question ${i}`,
    options: [`A. right ${i}`, `B. wrong ${i}a`, `C. wrong ${i}b`, `D. wrong ${i}c`],
    answer: 0,
    hint: "hint",
    explanation: "explanation",
  };
}

describe("saveQuizResults", () => {
  test("stores shuffled, label-free options with the answer index tracking the correct text", async () => {
    const t = convexTest(schema, modules);
    const quizId = await seedQuiz(t);
    const questions = Array.from({ length: 200 }, (_, i) => llmQuestion(i));

    await t.mutation(internal.studio.jobMutations.quizzes.saveQuizResults, {
      quizId,
      questions,
      metadata: { title: "Quiz" },
    });

    const stored = await t.run((ctx) => ctx.db.get(quizId));
    const saved = stored?.questionsData as Array<{ options: string[]; answer: number }>;
    expect(saved).toHaveLength(200);

    const counts = [0, 0, 0, 0];
    saved.forEach((q, i) => {
      expect(q.options[q.answer]).toBe(`right ${i}`);
      expect(q.options.every((o) => !/^[A-D]\.\s/.test(o))).toBe(true);
      counts[q.answer]++;
    });
    // 200 draws at p=0.25: each position lands within 25–75 with overwhelming probability.
    for (const c of counts) {
      expect(c).toBeGreaterThan(25);
      expect(c).toBeLessThan(75);
    }
  });
});
