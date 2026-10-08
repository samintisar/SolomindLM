/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

type T = ReturnType<typeof convexTest>;

const asUser = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session1` });

const driveArgs = (notebookId: Id<"notebooks">) => ({
  notebookId,
  fileId: "drive-file-1",
  fileName: "notes.pdf",
  mimeType: "application/pdf",
  accessToken: "test-drive-token",
});

async function seed(t: T) {
  return t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const stranger = await ctx.db.insert("users", { name: "Stranger" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { owner, stranger, notebookId };
  });
}

const storedFileCount = (t: T) =>
  t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);

describe("googleDrive.ingestFromGoogleDrive", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("%PDF-1.4 drive bytes", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("downloads and stores the file for a notebook editor", async () => {
    const t = convexTest(schema, modules);
    const { owner, notebookId } = await seed(t);

    const result = await asUser(t, owner).action(
      api.googleDrive.ingestFromGoogleDrive,
      driveArgs(notebookId)
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await storedFileCount(t)).toBe(1);
    const doc = await t.run(async (ctx) => ctx.db.get(result.documentId as Id<"documents">));
    expect(doc?.googleDriveFileId).toBe("drive-file-1");
  });

  test("refuses a user without notebook access before downloading or storing", async () => {
    const t = convexTest(schema, modules);
    const { stranger, notebookId } = await seed(t);

    await expect(
      asUser(t, stranger).action(api.googleDrive.ingestFromGoogleDrive, driveArgs(notebookId))
    ).rejects.toThrow("Notebook not found");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await storedFileCount(t)).toBe(0);
  });

  test("refuses a notebook at the source limit before downloading or storing", async () => {
    const t = convexTest(schema, modules);
    const { owner, notebookId } = await seed(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert("documents", {
          userId: owner,
          notebookId,
          fileName: `Existing ${i}`,
          fileType: "text",
          status: "completed",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    await expect(
      asUser(t, owner).action(api.googleDrive.ingestFromGoogleDrive, driveArgs(notebookId))
    ).rejects.toThrow("Source limit reached");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await storedFileCount(t)).toBe(0);
  });

  test("refuses signed-out callers", async () => {
    const t = convexTest(schema, modules);
    const { notebookId } = await seed(t);

    await expect(
      t.action(api.googleDrive.ingestFromGoogleDrive, driveArgs(notebookId))
    ).rejects.toThrow("Unauthenticated");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
