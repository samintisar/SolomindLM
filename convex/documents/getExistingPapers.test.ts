/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
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

describe("getExistingPapers", () => {
  test("returns DOIs and title hashes for existing papers", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    // Insert paper records directly
    await t.run(async (ctx) => {
      await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Paper One",
        fileType: "paper_record",
        paperRecord: {
          abstract: "Abstract one",
          authors: ["Smith, J."],
          doi: "10.1234/one",
          isOa: false,
        },
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Paper Two",
        fileType: "paper_record",
        paperRecord: {
          abstract: "Abstract two",
          authors: ["Jones, A."],
          doi: "10.1234/two",
          isOa: true,
        },
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asUser.query(api.documents.getExistingPapers.getExistingPapers, {
      notebookId,
    });

    expect(result.dois).toContain("10.1234/one");
    expect(result.dois).toContain("10.1234/two");
    expect(result.dois).toHaveLength(2);

    // Title + first author hash
    expect(result.titleHashes).toContain("paper one|smith");
    expect(result.titleHashes).toContain("paper two|jones");
    expect(result.titleHashes).toHaveLength(2);
  });

  test("returns empty arrays when no papers exist", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const result = await asUser.query(api.documents.getExistingPapers.getExistingPapers, {
      notebookId,
    });

    expect(result.dois).toEqual([]);
    expect(result.titleHashes).toEqual([]);
  });

  test("only includes paper_record file types", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await t.run(async (ctx) => {
      await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Paper One",
        fileType: "paper_record",
        paperRecord: {
          abstract: "Abstract one",
          authors: ["Smith, J."],
          doi: "10.1234/one",
          isOa: false,
        },
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Some URL",
        fileType: "url",
        fileUrl: "https://example.com",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asUser.query(api.documents.getExistingPapers.getExistingPapers, {
      notebookId,
    });

    expect(result.dois).toEqual(["10.1234/one"]);
    expect(result.titleHashes).toHaveLength(1);
  });

  test("normalizes DOIs to lowercase", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await t.run(async (ctx) => {
      await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Paper One",
        fileType: "paper_record",
        paperRecord: {
          abstract: "Abstract",
          authors: ["Author"],
          doi: "10.1234/UPPERCASE",
          isOa: false,
        },
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asUser.query(api.documents.getExistingPapers.getExistingPapers, {
      notebookId,
    });

    expect(result.dois[0]).toBe("10.1234/uppercase");
  });
});
