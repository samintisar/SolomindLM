/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/internal.ts"]);

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const reader = await ctx.db.insert("users", { name: "Reader" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Notebook",
      isPublic: true,
      publishedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const otherNotebook = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Other",
      createdAt: 1,
      updatedAt: 1,
    });
    for (const nb of [notebookId, otherNotebook]) {
      const documentId = await ctx.db.insert("documents", {
        userId: owner,
        notebookId: nb,
        fileName: "notes.txt",
        fileType: "text",
        status: "completed",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("documentChunks", {
        documentId,
        userId: owner,
        notebookId: nb,
        content: "photosynthesis converts light into chemical energy",
        chunkIndex: 0,
        createdAt: 1,
      });
    }
    return { owner, reader, notebookId };
  });
  return { t, ...ids };
}

describe("documents.internal.keywordSearch", () => {
  test("matches the notebook's chunks for a reader who did not upload them", async () => {
    const { t, reader, notebookId } = await setup();
    const results = await t.query(internal.documents.internal.keywordSearch, {
      notebookId,
      userId: reader,
      query: "photosynthesis",
    });
    expect(results).toHaveLength(1);
  });

  test("stays inside the requested notebook", async () => {
    const { t, owner, notebookId } = await setup();
    const results = await t.query(internal.documents.internal.keywordSearch, {
      notebookId,
      userId: owner,
      query: "photosynthesis",
    });
    expect(results).toHaveLength(1);
  });
});
