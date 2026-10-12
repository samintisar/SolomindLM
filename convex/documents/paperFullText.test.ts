/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/paperFullText.ts", "./documents/internal.ts"]);

type DocFields = Partial<Omit<Doc<"documents">, "_id" | "_creationTime">>;
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

type T = ReturnType<typeof convexTest>;

function makeT(): T {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

async function seedPaper(
  t: T,
  over: DocFields = {}
): Promise<{ userId: Id<"users">; notebookId: Id<"notebooks">; documentId: Id<"documents"> }> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: 1,
      updatedAt: 1,
    });
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: "A paper",
      fileType: "paper_record",
      status: "completed",
      ingestionStatus: "metadata_only",
      fulltextStatus: "unavailable",
      paperRecord: { abstract: "Abstract.", authors: [], doi: "10.1/x", isOa: false },
      createdAt: 1,
      updatedAt: 1,
      ...over,
    });
    return { userId, notebookId, documentId };
  });
}

describe("documents.paperFullText internal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("recordPaperIngest sets the outcome and clears an old source when none is given", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t, {
      fullTextSource: { method: "landing_page", url: "https://old.example" },
    });

    await t.mutation(internal.documents.paperFullText.recordPaperIngest, {
      documentId,
      ingestionStatus: "metadata_only",
      fulltextStatus: "unavailable",
    });

    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc?.ingestionStatus).toBe("metadata_only");
    expect(doc?.fullTextSource).toBeUndefined();
  });

  test("recordPaperIngest stores the full-text source", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    await t.mutation(internal.documents.paperFullText.recordPaperIngest, {
      documentId,
      ingestionStatus: "ingested",
      fulltextStatus: "available",
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });
    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({
      ingestionStatus: "ingested",
      fulltextStatus: "available",
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });
  });

  test("setPaperStorage sets and clears the storage id", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.7"])));

    await t.mutation(internal.documents.paperFullText.setPaperStorage, { documentId, storageId });
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.storageId).toBe(storageId);

    await t.mutation(internal.documents.paperFullText.setPaperStorage, { documentId });
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.storageId).toBeUndefined();
  });

  test("prepareDocumentReembed keeps fullTextSource unless a new PDF replaces the old one", async () => {
    // Fake timers keep the scheduled docEmbedding job from running (it would call real APIs).
    vi.useFakeTimers();
    const t = makeT();
    const { documentId } = await seedPaper(t, {
      ingestionStatus: "ingested",
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });

    await t.mutation(internal.documents.internal.prepareDocumentReembed, {
      documentId,
      delayMs: 0,
    });
    let doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ status: "pending", ingestionStatus: "pending" });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((f) => f.name.includes("docEmbedding"))).toBe(true);
    expect(doc?.fullTextSource).toEqual({ method: "oa_pdf", host: "arxiv.org" });

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.7"])));
    await t.mutation(internal.documents.internal.prepareDocumentReembed, {
      documentId,
      delayMs: 0,
      newStorageId: storageId,
    });
    doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc?.storageId).toBe(storageId);
    expect(doc?.fullTextSource).toBeUndefined();
  });
});
