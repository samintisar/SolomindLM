/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const OWNER = "owner@example.com";
const TITLE = "Language Learners";

// Keep scheduled docEmbedding jobs from running (they call external services).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type T = ReturnType<typeof convexTest>;

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert("users", { email: OWNER, name: "Owner" }));
  return { t, ownerId };
}

async function storeFile(t: T, text: string) {
  return await t.run((ctx) => ctx.storage.store(new Blob([text])));
}

async function createPack(t: T, title = TITLE) {
  return await t.mutation(internal.eval._seedPack.createPackNotebook, {
    ownerEmail: OWNER,
    notebookTitle: title,
  });
}

async function addDoc(t: T, notebookId: Id<"notebooks">, fileName = "unit-1.md") {
  const storageId = await storeFile(t, "# Unit 1");
  const documentId = await t.mutation(internal.eval._seedPack.insertPackDocument, {
    ownerEmail: OWNER,
    notebookId,
    storageId,
    fileName,
    contentType: "text/markdown",
    fileSize: 8,
    sha256: "abc123",
  });
  return { storageId, documentId };
}

/** A notebook plus a completed document, both owned by `userId`, outside any Test folder. */
async function insertOutsideNotebook(t: T, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Personal",
      createdAt: 0,
      updatedAt: 0,
    });
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: "personal.pdf",
      fileType: "file",
      status: "completed",
      extractedMarkdown: "secret",
      createdAt: 0,
      updatedAt: 0,
    });
    return { notebookId, documentId };
  });
}

describe("findPackNotebook", () => {
  test("returns null when the Test folder does not exist", async () => {
    const { t } = await setup();
    const found = await t.query(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: TITLE,
    });
    expect(found).toBeNull();
  });

  test("throws when no user has the owner email", async () => {
    const { t } = await setup();
    await expect(
      t.query(internal.eval._seedPack.findPackNotebook, {
        ownerEmail: "nobody@example.com",
        notebookTitle: TITLE,
      })
    ).rejects.toThrow(/no user with email nobody@example.com/);
  });

  test("surfaces the ingestion error stored in metadata", async () => {
    const { t, ownerId } = await setup();
    const notebookId = await createPack(t);
    const documentId = await t.run((ctx) =>
      ctx.db.insert("documents", {
        userId: ownerId,
        notebookId,
        fileName: "scan.pdf",
        fileType: "file",
        status: "failed",
        metadata: { error: "No text extracted" },
        createdAt: 0,
        updatedAt: 0,
      })
    );
    const found = await t.query(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: TITLE,
    });
    expect(found?.docs).toEqual([
      { documentId, fileName: "scan.pdf", status: "failed", error: "No text extracted" },
    ]);
  });
});

describe("createPackNotebook", () => {
  test("creates the Test folder and notebook once", async () => {
    const { t, ownerId } = await setup();
    const args = { ownerEmail: OWNER, notebookTitle: TITLE };
    const first = await t.mutation(internal.eval._seedPack.createPackNotebook, args);
    const second = await t.mutation(internal.eval._seedPack.createPackNotebook, args);
    expect(second).toBe(first);

    const { folders, notebook } = await t.run(async (ctx) => ({
      folders: await ctx.db
        .query("folders")
        .withIndex("by_user", (q) => q.eq("userId", ownerId))
        .collect(),
      notebook: await ctx.db.get(first),
    }));
    expect(folders.map((f) => f.name)).toEqual(["Test"]);
    expect(notebook?.folderId).toBe(folders[0]._id);
    expect(notebook?.icon).toBe("Book");

    const found = await t.query(internal.eval._seedPack.findPackNotebook, args);
    expect(found).toEqual({ notebookId: first, docs: [] });
  });

  test("is idempotent for titles with surrounding whitespace", async () => {
    const { t } = await setup();
    const args = { ownerEmail: OWNER, notebookTitle: "  Padded Title  " };
    const first = await t.mutation(internal.eval._seedPack.createPackNotebook, args);
    const second = await t.mutation(internal.eval._seedPack.createPackNotebook, args);
    expect(second).toBe(first);
  });
});

describe("insertPackDocument / deletePackDocument", () => {
  test("inserts a pending document with its source hash, then deletes it and its file", async () => {
    const { t } = await setup();
    const notebookId = await createPack(t);
    const { storageId, documentId } = await addDoc(t, notebookId);

    const found = await t.query(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: TITLE,
    });
    expect(found?.docs).toEqual([
      { documentId, fileName: "unit-1.md", status: "pending", sha256: "abc123" },
    ]);

    // Ingestion finished: deletion is allowed.
    await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
    await t.mutation(internal.eval._seedPack.deletePackDocument, { ownerEmail: OWNER, documentId });
    const after = await t.run(async (ctx) => ({
      doc: await ctx.db.get(documentId),
      url: await ctx.storage.getUrl(storageId),
    }));
    expect(after).toEqual({ doc: null, url: null });
  });

  test("schedules exactly one docEmbedding job for the new document", async () => {
    const { t, ownerId } = await setup();
    const notebookId = await createPack(t);
    const { documentId } = await addDoc(t, notebookId);

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const jobs = scheduled.filter((s) => s.name === "documents/embeddingJob:docEmbedding");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args).toEqual([{ documentId, userId: ownerId, notebookId }]);
  });

  test("refuses to delete a document that is still ingesting", async () => {
    const { t } = await setup();
    const notebookId = await createPack(t);
    const { documentId } = await addDoc(t, notebookId, "busy.md");

    for (const status of ["pending", "processing"]) {
      await t.run((ctx) => ctx.db.patch(documentId, { status }));
      await expect(
        t.mutation(internal.eval._seedPack.deletePackDocument, { ownerEmail: OWNER, documentId })
      ).rejects.toThrow(
        "Document busy.md is still ingesting; wait for it to finish before replacing it."
      );
    }
    expect(await t.run((ctx) => ctx.db.get(documentId))).not.toBeNull();
  });

  test("rejects a storageId that is already attached to a document", async () => {
    const { t } = await setup();
    const notebookId = await createPack(t);
    const { storageId } = await addDoc(t, notebookId);
    await expect(
      t.mutation(internal.eval._seedPack.insertPackDocument, {
        ownerEmail: OWNER,
        notebookId,
        storageId,
        fileName: "again.md",
        contentType: "text/markdown",
        fileSize: 8,
        sha256: "def456",
      })
    ).rejects.toThrow("storageId is already attached to a document.");
  });

  test("refuses notebooks and documents owned by someone else", async () => {
    const { t } = await setup();
    const otherId = await t.run((ctx) => ctx.db.insert("users", { email: "other@example.com" }));
    const { notebookId, documentId } = await insertOutsideNotebook(t, otherId);
    const storageId = await storeFile(t, "x");

    await expect(
      t.mutation(internal.eval._seedPack.insertPackDocument, {
        ownerEmail: OWNER,
        notebookId,
        storageId,
        fileName: "x.md",
        contentType: "text/markdown",
        fileSize: 1,
        sha256: "x",
      })
    ).rejects.toThrow(/not an eval pack notebook/);
    await expect(
      t.mutation(internal.eval._seedPack.deletePackDocument, { ownerEmail: OWNER, documentId })
    ).rejects.toThrow(/does not own/);
    await expect(
      t.query(internal.eval._seedPack.packSourceText, {
        ownerEmail: OWNER,
        documentIds: [documentId],
      })
    ).rejects.toThrow(/not an eval pack document/);
  });

  test("refuses the owner's notebooks outside the Test folder", async () => {
    const { t, ownerId } = await setup();
    await createPack(t); // The Test folder exists, but the notebook below is not in it.
    const { notebookId, documentId } = await insertOutsideNotebook(t, ownerId);
    const storageId = await storeFile(t, "x");
    const notPack = "Notebook is not an eval pack notebook in the Test folder.";

    await expect(
      t.mutation(internal.eval._seedPack.insertPackDocument, {
        ownerEmail: OWNER,
        notebookId,
        storageId,
        fileName: "x.md",
        contentType: "text/markdown",
        fileSize: 1,
        sha256: "x",
      })
    ).rejects.toThrow(notPack);
    await expect(
      t.mutation(internal.eval._seedPack.deletePackDocument, { ownerEmail: OWNER, documentId })
    ).rejects.toThrow(notPack);
    await expect(
      t.query(internal.eval._seedPack.packSourceText, {
        ownerEmail: OWNER,
        documentIds: [documentId],
      })
    ).rejects.toThrow(notPack);
    expect(await t.run((ctx) => ctx.db.get(documentId))).not.toBeNull();
  });
});

describe("packSourceText", () => {
  test("returns extracted text capped at 50k chars", async () => {
    const { t, ownerId } = await setup();
    const nb = await createPack(t);
    const documentId = await t.run((ctx) =>
      ctx.db.insert("documents", {
        userId: ownerId,
        notebookId: nb,
        fileName: "unit-1.pdf",
        fileType: "file",
        status: "completed",
        extractedMarkdown: "a".repeat(60_000),
        createdAt: 0,
        updatedAt: 0,
      })
    );
    const [text] = await t.query(internal.eval._seedPack.packSourceText, {
      ownerEmail: OWNER,
      documentIds: [documentId],
    });
    expect(text.fileName).toBe("unit-1.pdf");
    expect(text.text).toHaveLength(50_000);
  });
});
