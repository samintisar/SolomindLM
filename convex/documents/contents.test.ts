/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { deleteDocumentText, getDocumentText, setDocumentText } from "./contents";
import { resetDocumentForReembed } from "./internal";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function seed(t: ReturnType<typeof convexTest>, extractedMarkdown?: string) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Owner" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: 0,
      updatedAt: 0,
    });
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: "paper.pdf",
      fileType: "file",
      status: "completed",
      extractedMarkdown,
      createdAt: 0,
      updatedAt: 0,
    });
    return { userId, notebookId, documentId };
  });
}

async function stored(ctx: MutationCtx, documentId: Id<"documents">) {
  const doc = await ctx.db.get(documentId);
  const rows = await ctx.db
    .query("documentContents")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  return {
    onRow: doc?.extractedMarkdown,
    rows: rows.map((r) => r.extractedMarkdown),
    text: doc ? await getDocumentText(ctx, doc) : undefined,
  };
}

describe("document text", () => {
  test("is read from documentContents, falling back to the deprecated copy on the row", async () => {
    const t = convexTest(schema, modules);
    const legacy = await seed(t, "Old text.");
    const moved = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("documentContents", {
        documentId: moved.documentId,
        extractedMarkdown: "New text.",
      });
      expect((await stored(ctx, legacy.documentId)).text).toBe("Old text.");
      expect((await stored(ctx, moved.documentId)).text).toBe("New text.");
    });
  });

  test("set stores one row, replaces it, clears the row's copy, and undefined deletes it", async () => {
    const t = convexTest(schema, modules);
    const { documentId } = await seed(t, "Old text.");
    await t.run(async (ctx) => {
      await setDocumentText(ctx, documentId, "First.");
      expect(await stored(ctx, documentId)).toEqual({
        onRow: undefined,
        rows: ["First."],
        text: "First.",
      });

      await setDocumentText(ctx, documentId, "Second.");
      expect((await stored(ctx, documentId)).rows).toEqual(["Second."]);

      await setDocumentText(ctx, documentId, undefined);
      expect(await stored(ctx, documentId)).toEqual({
        onRow: undefined,
        rows: [],
        text: undefined,
      });
    });
  });

  test("delete removes the stored text", async () => {
    const t = convexTest(schema, modules);
    const { documentId } = await seed(t);
    await t.run(async (ctx) => {
      await setDocumentText(ctx, documentId, "Text.");
      await deleteDocumentText(ctx, documentId);
      expect((await stored(ctx, documentId)).rows).toEqual([]);
    });
  });

  test("ingestion writes the text to documentContents, not the row", async () => {
    const t = convexTest(schema, modules);
    const { documentId } = await seed(t, "Old text.");
    await t.mutation(internal.documents.internal.setExtractedMarkdown, {
      documentId,
      extractedMarkdown: "# Extracted",
    });
    await t.run(async (ctx) => {
      expect(await stored(ctx, documentId)).toEqual({
        onRow: undefined,
        rows: ["# Extracted"],
        text: "# Extracted",
      });
    });
  });

  test("reprocessing drops the old text", async () => {
    const t = convexTest(schema, modules);
    const { documentId } = await seed(t);
    await t.run(async (ctx) => {
      await setDocumentText(ctx, documentId, "Old text.");
      await resetDocumentForReembed(ctx, { documentId, delayMs: 60_000 });
      expect((await stored(ctx, documentId)).text).toBeUndefined();
    });
  });

  test("the source viewer shows text from documentContents", async () => {
    const t = convexTest(schema, modules);
    const { userId, documentId } = await seed(t);
    await t.run((ctx) => setDocumentText(ctx, documentId, "# Viewer text"));

    const content = await t
      .withIdentity({ subject: `${userId}|session1` })
      .query(api.documents.index.getContent, { id: documentId });
    expect(content?.content).toBe("# Viewer text");
  });

  test("the source guide reads the text only for notebook members", async () => {
    const t = convexTest(schema, modules);
    const { userId, documentId } = await seed(t);
    const strangerId = await t.run(async (ctx) => {
      await setDocumentText(ctx, documentId, "Guide text.");
      return ctx.db.insert("users", { name: "Stranger" });
    });

    const read = (as: Id<"users">) =>
      t.query(internal.documents.index.getDocumentTextInternal, { documentId, userId: as });
    expect(await read(userId)).toBe("Guide text.");
    expect(await read(strangerId)).toBeNull();
  });

  test("deleting sources deletes their text", async () => {
    const t = convexTest(schema, modules);
    const one = await seed(t);
    const two = await seed(t);
    await t.run(async (ctx) => {
      await setDocumentText(ctx, one.documentId, "One.");
      await setDocumentText(ctx, two.documentId, "Two.");
    });

    await t
      .withIdentity({ subject: `${one.userId}|session1` })
      .mutation(api.documents.index.remove, { id: one.documentId });
    await t
      .withIdentity({ subject: `${two.userId}|session1` })
      .mutation(api.documents.index.removeMany, { ids: [two.documentId] });

    const left = await t.run((ctx) => ctx.db.query("documentContents").collect());
    expect(left).toEqual([]);
  });
});
