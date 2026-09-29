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

// Keep scheduled docEmbedding jobs from running (they call external services).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert("users", { email: OWNER, name: "Owner" }));
  return { t, ownerId };
}

async function storeFile(t: ReturnType<typeof convexTest>, text: string) {
  return (await t.run((ctx) => ctx.storage.store(new Blob([text])))) as Id<"_storage">;
}

describe("findPackNotebook", () => {
  test("returns null when the Test folder does not exist", async () => {
    const { t } = await setup();
    const found = await t.query(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: "Language Learners",
    });
    expect(found).toBeNull();
  });

  test("throws when no user has the owner email", async () => {
    const { t } = await setup();
    await expect(
      t.query(internal.eval._seedPack.findPackNotebook, {
        ownerEmail: "nobody@example.com",
        notebookTitle: "Language Learners",
      })
    ).rejects.toThrow(/no user with email nobody@example.com/);
  });
});

describe("createPackNotebook", () => {
  test("creates the Test folder and notebook once", async () => {
    const { t, ownerId } = await setup();
    const args = { ownerEmail: OWNER, notebookTitle: "Language Learners" };
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
});

describe("insertPackDocument / deletePackDocument", () => {
  test("inserts a pending document with its source hash, then deletes it and its file", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.eval._seedPack.createPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: "Language Learners",
    });
    const storageId = await storeFile(t, "# Unit 1");
    const documentId = await t.mutation(internal.eval._seedPack.insertPackDocument, {
      ownerEmail: OWNER,
      notebookId,
      storageId,
      fileName: "unit-1.md",
      contentType: "text/markdown",
      fileSize: 8,
      sha256: "abc123",
    });

    const found = await t.query(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: "Language Learners",
    });
    expect(found?.docs).toEqual([
      { documentId, fileName: "unit-1.md", status: "pending", sha256: "abc123" },
    ]);

    await t.mutation(internal.eval._seedPack.deletePackDocument, { ownerEmail: OWNER, documentId });
    const after = await t.run(async (ctx) => ({
      doc: await ctx.db.get(documentId),
      url: await ctx.storage.getUrl(storageId),
    }));
    expect(after).toEqual({ doc: null, url: null });
  });

  test("refuses notebooks and documents owned by someone else", async () => {
    const { t } = await setup();
    const otherId = await t.run((ctx) => ctx.db.insert("users", { email: "other@example.com" }));
    const { notebookId, documentId } = await t.run(async (ctx) => {
      const nb = await ctx.db.insert("notebooks", {
        userId: otherId,
        title: "Private",
        createdAt: 0,
        updatedAt: 0,
      });
      const doc = await ctx.db.insert("documents", {
        userId: otherId,
        notebookId: nb,
        fileName: "private.pdf",
        fileType: "file",
        status: "completed",
        createdAt: 0,
        updatedAt: 0,
      });
      return { notebookId: nb, documentId: doc };
    });
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
    ).rejects.toThrow(/Pack notebook not found/);
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
});

describe("packSourceText", () => {
  test("returns extracted text capped at 50k chars", async () => {
    const { t, ownerId } = await setup();
    const documentId = await t.run(async (ctx) => {
      const nb = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Language Learners",
        createdAt: 0,
        updatedAt: 0,
      });
      return ctx.db.insert("documents", {
        userId: ownerId,
        notebookId: nb,
        fileName: "unit-1.pdf",
        fileType: "file",
        status: "completed",
        extractedMarkdown: "a".repeat(60_000),
        createdAt: 0,
        updatedAt: 0,
      });
    });
    const [text] = await t.query(internal.eval._seedPack.packSourceText, {
      ownerEmail: OWNER,
      documentIds: [documentId],
    });
    expect(text.fileName).toBe("unit-1.pdf");
    expect(text.text).toHaveLength(50_000);
  });
});
