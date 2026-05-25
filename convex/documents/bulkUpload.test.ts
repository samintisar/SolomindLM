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

describe("bulkUpload", () => {
  test("imports multiple papers", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        abstract: "Abstract one",
        doi: "10.1234/one",
        isOa: false,
      },
      {
        title: "Paper Two",
        authors: ["Jones, A."],
        abstract: "Abstract two",
        doi: "10.1234/two",
        isOa: true,
        pdfUrl: "https://example.com/two.pdf",
      },
    ];

    const result = await asUser.mutation(api.documents.bulkUpload.bulkUpload, {
      notebookId,
      papers,
    });

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.documentIds).toHaveLength(2);

    // Verify documents were created
    const docs = await t.run(async (ctx) =>
      ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect()
    );
    expect(docs).toHaveLength(2);
    expect(docs[0].fileName).toBe("Paper One");
    expect(docs[1].fileName).toBe("Paper Two");
  });

  test("enforces 100-paper limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const papers = Array.from({ length: 101 }, (_, i) => ({
      title: `Paper ${i}`,
      authors: [`Author ${i}`],
      abstract: `Abstract ${i}`,
      isOa: false,
    }));

    await expect(
      asUser.mutation(api.documents.bulkUpload.bulkUpload, {
        notebookId,
        papers,
      })
    ).rejects.toThrow("Cannot import more than 100 papers at once");
  });

  test("skips duplicates", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        abstract: "Abstract one",
        doi: "10.1234/one",
        isOa: false,
      },
    ];

    // First upload
    const result1 = await asUser.mutation(api.documents.bulkUpload.bulkUpload, {
      notebookId,
      papers,
    });
    expect(result1.imported).toBe(1);
    expect(result1.skipped).toBe(0);

    // Second upload with same paper
    const result2 = await asUser.mutation(api.documents.bulkUpload.bulkUpload, {
      notebookId,
      papers,
    });
    expect(result2.imported).toBe(0);
    expect(result2.skipped).toBe(1);
    expect(result2.failed).toBe(0);
  });
});
