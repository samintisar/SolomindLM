/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/chunks.ts"]);

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@example.com" });
    const notebookId = await ctx.db.insert("notebooks", {
      title: "N",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const doc = (fileName: string) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName,
        fileType: "text",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    return { userId, notebookId, a: await doc("a"), b: await doc("b") };
  });
  const chunk = (documentId: Id<"documents">, chunkIndex: number, embedding: number[]) =>
    t.run((ctx) =>
      ctx.db.insert("documentChunks", {
        documentId,
        userId: ids.userId,
        notebookId: ids.notebookId,
        content: `chunk ${chunkIndex} of ${documentId}`,
        chunkIndex,
        embedding,
        sectionTitle: chunkIndex === 0 ? "Intro" : undefined,
        createdAt: Date.now(),
      })
    );
  return { t, ...ids, chunk };
}

describe("chunk text for Studio jobs", () => {
  test("lists a document's chunks in order, without embeddings", async () => {
    const { t, a, chunk } = await setup();
    await chunk(a, 0, [1, 0]);
    await chunk(a, 1, [0, 1]);
    const rows = await t.query(internal.documents.chunks.listChunkTexts, { documentId: a });
    expect(rows).toEqual([
      { documentId: a, chunkIndex: 0, content: `chunk 0 of ${a}`, sectionTitle: "Intro" },
      { documentId: a, chunkIndex: 1, content: `chunk 1 of ${a}` },
    ]);
  });

  test("scores a document against a topic from its best chunks; null with no embeddings", async () => {
    const { t, a, b, chunk } = await setup();
    await chunk(a, 0, [1, 0]);
    await chunk(a, 1, [0, 1]);
    const score = await t.query(internal.documents.chunks.documentTopicScore, {
      documentId: a,
      topicEmbedding: [1, 0],
    });
    expect(score).toBeCloseTo(0.5);
    expect(
      await t.query(internal.documents.chunks.documentTopicScore, {
        documentId: b,
        topicEmbedding: [1, 0],
      })
    ).toBeNull();
  });

  test("fetchChunks returns every document's text, sorted, with no topic", async () => {
    const { t, a, b, chunk } = await setup();
    await chunk(b, 1, [0, 1]);
    await chunk(a, 0, [1, 0]);
    await chunk(b, 0, [1, 0]);
    const rows = await t.action(internal.documents.chunks.fetchChunks, { documentIds: [a, b] });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => Object.keys(r).sort().join() === "content,documentId")).toBe(true);
    const bRows = rows.filter((r) => r.documentId === b).map((r) => r.content);
    expect(bRows).toEqual([`chunk 0 of ${b}`, `chunk 1 of ${b}`]);
  });
});
