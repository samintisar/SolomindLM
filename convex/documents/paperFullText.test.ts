/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { MAX_PDF_BYTES } from "../_services/extraction/openAccess/fetchOaCandidate";
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

/** convex-test drops the Blob's content type, so write it (and any size override) onto the `_storage` row. */
async function storeFile(
  t: T,
  body: string,
  contentType: string,
  extra: { size?: number } = {}
): Promise<Id<"_storage">> {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([body], { type: contentType }));
    // biome-ignore lint/suspicious/noExplicitAny: convex-test lets us patch system tables
    await (ctx.db as any).patch(storageId, { contentType, ...extra });
    return storageId;
  });
}

function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
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

describe("documents.paperFullText.findFullText", () => {
  beforeEach(() => {
    // Fake timers keep the scheduled docEmbedding job from running (it would call real APIs).
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("resets an abstract-only paper for another ingest", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    await asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId });
    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ status: "pending", ingestionStatus: "pending" });
  });

  test("rejects another user's paper", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    const stranger = await t.run((ctx) => ctx.db.insert("users", { name: "Other" }));
    await expect(
      asUser(t, stranger).mutation(api.documents.paperFullText.findFullText, { documentId })
    ).rejects.toThrow();
  });

  test("rejects sources that aren't papers, and papers still processing", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t, { fileType: "url" });
    await expect(
      asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId })
    ).rejects.toThrow();

    const busy = await seedPaper(t, { status: "processing" });
    await expect(
      asUser(t, busy.userId).mutation(api.documents.paperFullText.findFullText, {
        documentId: busy.documentId,
      })
    ).rejects.toThrow();
  });

  test("is rate limited per user", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    for (let i = 0; i < 20; i++) {
      await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
      await asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId });
    }
    await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
    await expect(
      asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId })
    ).rejects.toThrow();
  });
});

describe("documents.paperFullText.attachPdf", () => {
  beforeEach(() => {
    // Fake timers keep the scheduled docEmbedding job from running (it would call real APIs).
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("attaches a PDF and re-ingests from it", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const storageId = await storeFile(t, "%PDF-1.7", "application/pdf");

    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });

    expect(res).toEqual({ ok: true });
    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ storageId, status: "pending", ingestionStatus: "pending" });
  });

  test("refuses a file that isn't a PDF and deletes the upload", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const storageId = await storeFile(t, "hello", "text/plain");

    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });

    expect(res).toEqual({ ok: false, reason: "Choose a PDF file." });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.storageId).toBeUndefined();
  });

  test("rejects another user's paper without touching the upload", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    const stranger = await t.run((ctx) => ctx.db.insert("users", { name: "Other" }));
    const storageId = await storeFile(t, "%PDF-1.7", "application/pdf");
    await expect(
      asUser(t, stranger).mutation(api.documents.paperFullText.attachPdf, { documentId, storageId })
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
  });

  test("leaves a blob another document references alone (PDF or not)", async () => {
    const t = makeT();
    const victim = await seedPaper(t);
    const attacker = await seedPaper(t);

    for (const [body, type] of [
      ["%PDF-1.7", "application/pdf"],
      ["hello", "text/plain"],
    ] as const) {
      const storageId = await storeFile(t, body, type);
      await t.run((ctx) => ctx.db.patch(victim.documentId, { storageId }));

      const res = await asUser(t, attacker.userId).mutation(api.documents.paperFullText.attachPdf, {
        documentId: attacker.documentId,
        storageId,
      });

      expect(res).toEqual({ ok: false, reason: "The upload didn't arrive. Try again." });
      expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
      expect((await t.run((ctx) => ctx.db.get(victim.documentId)))?.storageId).toBe(storageId);
      expect((await t.run((ctx) => ctx.db.get(attacker.documentId)))?.storageId).toBeUndefined();
    }
  });

  test("the document's own current PDF can't be re-attached", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const storageId = await storeFile(t, "%PDF-1.7", "application/pdf");
    await t.run((ctx) => ctx.db.patch(documentId, { storageId }));

    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });

    expect(res).toEqual({ ok: false, reason: "The upload didn't arrive. Try again." });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(documentId))).toMatchObject({
      storageId,
      status: "completed",
    });
  });

  test("deletes the upload when the source isn't a paper or is still processing", async () => {
    const t = makeT();
    const notPaper = await seedPaper(t, { fileType: "url" });
    const a = await storeFile(t, "%PDF-1.7", "application/pdf");
    expect(
      await asUser(t, notPaper.userId).mutation(api.documents.paperFullText.attachPdf, {
        documentId: notPaper.documentId,
        storageId: a,
      })
    ).toEqual({ ok: false, reason: "Only paper sources have this option." });
    expect(await t.run((ctx) => ctx.db.system.get(a))).toBeNull();

    const busy = await seedPaper(t, { status: "processing" });
    const b = await storeFile(t, "%PDF-1.7", "application/pdf");
    expect(
      await asUser(t, busy.userId).mutation(api.documents.paperFullText.attachPdf, {
        documentId: busy.documentId,
        storageId: b,
      })
    ).toEqual({ ok: false, reason: "This source is still being processed." });
    expect(await t.run((ctx) => ctx.db.system.get(b))).toBeNull();
  });

  test("accepts a content type with parameters", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const storageId = await storeFile(t, "%PDF-1.7", "Application/PDF; charset=binary");
    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });
    expect(res).toEqual({ ok: true });
  });

  test("refuses an oversize PDF and deletes it", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const storageId = await storeFile(t, "%PDF-1.7", "application/pdf", {
      size: MAX_PDF_BYTES + 1,
    });
    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });
    expect(res).toEqual({ ok: false, reason: "That PDF is over 50 MB." });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
  });

  test("when rate limited, deletes the upload and reports it", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    for (let i = 0; i < 20; i++) {
      const id = await storeFile(t, "%PDF-1.7", "application/pdf");
      await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
      const ok = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
        documentId,
        storageId: id,
      });
      expect(ok).toEqual({ ok: true });
    }
    await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
    const storageId = await storeFile(t, "%PDF-1.7", "application/pdf");
    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });
    expect(res).toMatchObject({ ok: false });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
  });

  test("deletes the PDF it replaces", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const oldId = await storeFile(t, "%PDF-old", "application/pdf");
    await t.run((ctx) => ctx.db.patch(documentId, { storageId: oldId }));
    const newId = await storeFile(t, "%PDF-new", "application/pdf");

    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId: newId,
    });

    expect(res).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.system.get(oldId))).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.storageId).toBe(newId);
  });
});
