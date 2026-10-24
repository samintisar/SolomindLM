/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import { getDocumentText, setDocumentText } from "../documents/contents";
import schema from "../schema";
import { SHOWCASE_NOTEBOOKS } from "./manifest";
import { remapDeep, withoutSystemFields } from "./transferRemap";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./showcase/transfer.ts"]);

const OWNER = "maintainer@example.com";
const ECON = SHOWCASE_NOTEBOOKS.find((n) => n.slug === "econ-101-midterm-prep");
if (!ECON) throw new Error("missing ECON");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert("users", { email: OWNER, name: "Owner" }));
  const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, {
    ownerEmail: OWNER,
    slug: ECON?.slug ?? "",
  });
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const doc = (status: string) =>
      ctx.db.insert("documents", {
        userId: ownerId,
        notebookId,
        fileName: `Doc ${status}`,
        fileType: "url",
        fileUrl: "https://en.wikipedia.org/wiki/Supply_and_demand",
        status,
        createdAt: now,
        updatedAt: now,
      });
    const documentId = await doc("completed");
    await setDocumentText(ctx, documentId, "Supply meets demand.");
    await doc("failed");
    await ctx.db.insert("documentChunks", {
      documentId,
      userId: ownerId,
      notebookId,
      content: "Demand curves slope down.",
      chunkIndex: 0,
      embedding: [0.5, 0.5],
      createdAt: now,
    });
    const deck = (status: string) =>
      ctx.db.insert("flashcards", {
        userId: ownerId,
        notebookId,
        title: `Deck ${status}`,
        status,
        cardsData: [{ front: "Q", back: "A", proficiency: 3 }],
        metadata: { documentIds: [documentId] },
        createdAt: now,
        updatedAt: now,
      });
    await deck("completed");
    await deck("failed");
    const citationId = await ctx.db.insert("citations", {
      paperId: "p1",
      title: "Paper",
      authors: ["A"],
      url: "https://doi.org/10.1/x",
      sourceApi: "notebook",
      citationKey: "a2020",
      documentId,
    });
    return { documentId, citationId };
  });
  return { t, ownerId, notebookId, ...ids };
}

describe("showcase transfer", () => {
  test("exports completed rows only, without practice progress", async () => {
    const { t, notebookId, documentId } = await setup();
    const rows = await t.query(internal.showcase.transfer.exportNotebookRows, {
      ownerEmail: OWNER,
      slug: ECON.slug,
    });
    expect(rows.notebook).toMatchObject({ _id: notebookId, title: ECON.title });
    expect(rows.documents.map((d) => d._id)).toEqual([documentId]);
    // The bundle carries each source's text on its row.
    expect(rows.documents[0].extractedMarkdown).toBe("Supply meets demand.");
    expect(rows.studio.flashcards).toHaveLength(1);
    expect(rows.studio.flashcards[0].cardsData).toEqual([{ front: "Q", back: "A" }]);
    const page = await t.query(internal.showcase.transfer.exportChunksPage, {
      documentId,
      cursor: null,
    });
    expect(page.page[0]).toMatchObject({
      content: "Demand curves slope down.",
      embedding: [0.5, 0.5],
    });
  });

  test("imports into a fresh notebook once, with remapped ids, and refuses rows of another notebook", async () => {
    const { t, notebookId, documentId } = await setup();
    const rows = await t.query(internal.showcase.transfer.exportNotebookRows, {
      ownerEmail: OWNER,
      slug: ECON.slug,
    });
    const begin = () =>
      t.mutation(internal.showcase.transfer.beginImport, {
        ownerEmail: OWNER,
        title: rows.notebook.title,
        icon: rows.notebook.icon,
        coverColor: rows.notebook.coverColor,
        chatSettings: rows.notebook.chatSettings,
        folderName: "Rehearsal",
      });
    const target = await begin();
    await expect(begin()).rejects.toThrow("already in");

    const ids = new Map<string, string>([[notebookId, target.notebookId]]);
    const [newDocId] = await t.mutation(internal.showcase.transfer.insertRows, {
      notebookId: target.notebookId,
      table: "documents",
      rows: rows.documents.map((d) => remapDeep(withoutSystemFields(d), ids, new Map())),
    });
    ids.set(documentId, newDocId);
    await t.mutation(internal.showcase.transfer.insertRows, {
      notebookId: target.notebookId,
      table: "flashcards",
      rows: rows.studio.flashcards.map((r) => remapDeep(withoutSystemFields(r), ids, new Map())),
    });
    const copied = await t.run(async (ctx) => {
      const doc = await ctx.db.get(newDocId as Id<"documents">);
      return {
        doc,
        text: doc ? await getDocumentText(ctx, doc) : undefined,
        notebook: await ctx.db.get(target.notebookId),
        deck: await ctx.db
          .query("flashcards")
          .withIndex("by_notebook", (q) => q.eq("notebookId", target.notebookId))
          .first(),
      };
    });
    // The text lands in documentContents, not on the copied row.
    expect(copied.doc?.extractedMarkdown).toBeUndefined();
    expect(copied.text).toBe("Supply meets demand.");
    expect(copied.notebook?.title).toBe(ECON.title);
    expect(copied.notebook?.isPublic).toBeFalsy();
    expect(copied.notebook?.chatSettings?.instructionMode).toBe("learningGuide");
    expect(copied.deck?.metadata).toEqual({ documentIds: [newDocId] });

    await expect(
      t.mutation(internal.showcase.transfer.insertRows, {
        notebookId: target.notebookId,
        table: "flashcards",
        rows: rows.studio.flashcards.map(withoutSystemFields),
      })
    ).rejects.toThrow("doesn't belong to the target notebook");
  });

  test("refuses a notebook that isn't in the owner's Showcase folder", async () => {
    const { t } = await setup();
    await expect(
      t.query(internal.showcase.transfer.exportNotebookRows, {
        ownerEmail: OWNER,
        slug: "learn-pytorch",
      })
    ).rejects.toThrow("isn't in");
  });

  test("copies the citations a literature table and report cite", async () => {
    const { t, ownerId, notebookId, citationId } = await setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      const tableId = await ctx.db.insert("literatureTables", {
        title: "Literature Review: Evidence Table",
        notebookId,
        userId: ownerId,
        status: "completed",
        columns: [],
        papers: [{ citationId, rowData: {}, isIncluded: true }],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("literatureReports", {
        title: "Literature Review",
        notebookId,
        userId: ownerId,
        status: "completed",
        content: "Report",
        citationStyle: "apa",
        sections: [],
        citationIds: [citationId as Id<"citations">],
        tableId,
        createdAt: now,
        updatedAt: now,
      } as never);
    });
    const rows = await t.query(internal.showcase.transfer.exportNotebookRows, {
      ownerEmail: OWNER,
      slug: ECON.slug,
    });
    expect(rows.literatureTables).toHaveLength(1);
    expect(rows.literatureReports).toHaveLength(1);
    expect(rows.citations.map((c) => c._id)).toEqual([citationId]);
  });
});
