/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { createWrittenQuestionSet } from "./seedWrittenQuestions";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function seedUser(t: ReturnType<typeof convexTest>, email: string): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "E2E", email }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "e2e-notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("e2e.seedWrittenQuestions.createWrittenQuestionSet", () => {
  test("is registered as an internal function, not on the public api surface", () => {
    // The generated `api`/`internal` objects are both `anyApi` (a permissive
    // proxy), so a nested lookup never returns `undefined` and cannot witness
    // the public/internal boundary. Inspect the registered function's own
    // visibility flags instead: a public `mutation` sets `isPublic`, an
    // `internalMutation` sets `isInternal`.
    const fn = createWrittenQuestionSet as unknown as {
      isInternal?: boolean;
      isPublic?: boolean;
    };
    expect(fn.isInternal).toBe(true); // RED while it is `mutation` (undefined)
    expect(fn.isPublic).not.toBe(true);
  });

  test("is reachable through the internal reference and seeds a completed set", async () => {
    const t = convexTest(schema, modules);
    const email = "wq-seed@example.com";
    const userId = await seedUser(t, email);
    const notebookId = await seedNotebook(t, userId);

    const result = await t.mutation(internal.e2e.seedWrittenQuestions.createWrittenQuestionSet, {
      email,
      notebookId,
      title: "E2E set",
    });

    expect(result).toEqual({
      writtenQuestionsId: expect.any(String),
      title: "E2E set",
      questionCount: 2,
    });

    const row = await t.run(async (ctx) =>
      ctx.db.get(result.writtenQuestionsId as Id<"writtenQuestions">)
    );
    expect(row).not.toBeNull();
    expect(row?.notebookId).toBe(notebookId);
    expect(row?.userId).toBe(userId);
    expect(row?.status).toBe("completed");
    expect(row?.questionsData).toHaveLength(2);
  });

  test("rejects an email that matches no user", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "known@example.com");
    const notebookId = await seedNotebook(t, userId);

    await expect(
      t.mutation(internal.e2e.seedWrittenQuestions.createWrittenQuestionSet, {
        email: "nobody@example.com",
        notebookId,
        title: "E2E set",
      })
    ).rejects.toThrow(/not found/);
  });
});
