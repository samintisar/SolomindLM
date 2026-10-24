/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./notebooks/index.ts"]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

describe("notebooks.index", () => {
  test("create returns notebook DTO for authenticated user", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const created = await asUser.mutation(api.notebooks.index.create, {
      title: "My Notebook",
      coverColor: "bg-green-500",
      icon: "Book",
    });

    expect(created.title).toBe("My Notebook");
    expect(created.coverColor).toBe("bg-green-500");
    expect(created.icon).toBe("Book");
    expect(created.sourceCount).toBe(0);
    expect(created.id).toBeDefined();
  });

  test("list returns notebooks for owner only", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const asOwner = withAuth(t, ownerId);

    await asOwner.mutation(api.notebooks.index.create, { title: "Owner NB" });

    const ownerList = await asOwner.query(api.notebooks.index.list, {});
    expect(ownerList).toHaveLength(1);
    expect(ownerList[0]?.title).toBe("Owner NB");

    const otherList = await withAuth(t, otherId).query(api.notebooks.index.list, {});
    expect(otherList).toHaveLength(0);
  });

  test("update patches title and returns DTO", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const created = await asUser.mutation(api.notebooks.index.create, {
      title: "Before",
    });

    const updated = await asUser.mutation(api.notebooks.index.update, {
      id: created.id,
      title: "After",
    });

    expect(updated.title).toBe("After");
  });

  test("remove deletes notebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const created = await asUser.mutation(api.notebooks.index.create, {
      title: "To Delete",
    });

    await asUser.mutation(api.notebooks.index.remove, { id: created.id });

    const list = await asUser.query(api.notebooks.index.list, {});
    expect(list).toHaveLength(0);
  });

  test("update rejects non-owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const intruderId = await seedUser(t);
    const asOwner = withAuth(t, ownerId);

    const created = await asOwner.mutation(api.notebooks.index.create, {
      title: "Private",
    });

    await expect(
      withAuth(t, intruderId).mutation(api.notebooks.index.update, {
        id: created.id,
        title: "Hacked",
      })
    ).rejects.toThrow("Notebook not found");
  });

  test("create requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.notebooks.index.create, { title: "Anon" })).rejects.toThrow(
      "Unauthenticated"
    );
  });
});

describe("notebooks.get access", () => {
  test("a viewer gets the notebook with access=viewer and the owner's name", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { viewer, notebookId } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Ada" });
      const viewer = await ctx.db.insert("users", { name: "Viewer" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Public",
        isPublic: true,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { viewer, notebookId };
    });
    const nb = await withAuth(t, viewer).query(api.notebooks.index.get, { id: notebookId });
    expect(nb?.access).toBe("viewer");
    expect(nb?.isPublic).toBe(true);
    expect(nb?.ownerName).toBe("Ada");
  });

  test("the owner gets access=owner", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { owner, notebookId } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Ada" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Mine",
        createdAt: now,
        updatedAt: now,
      });
      return { owner, notebookId };
    });
    const nb = await withAuth(t, owner).query(api.notebooks.index.get, { id: notebookId });
    expect(nb?.access).toBe("owner");
    expect(nb?.isPublic).toBe(false);
  });

  /** A public notebook filed in the owner's folder, with custom chat instructions. */
  async function seedConfiguredNotebook(t: ReturnType<typeof convexTest>) {
    const now = Date.now();
    return t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Ada" });
      const folderId = await ctx.db.insert("folders", {
        userId: owner,
        name: "Private folder",
        createdAt: now,
        updatedAt: now,
      });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Public",
        isPublic: true,
        publishedAt: now,
        folderId,
        chatSettings: {
          instructionMode: "custom",
          customInstructions: "Secret prompt",
          responseLength: "longer",
          smartModel: "some-model",
        },
        createdAt: now,
        updatedAt: now,
      });
      return { owner, folderId, notebookId };
    });
  }

  test("the owner sees their folder and custom instructions", async () => {
    const t = convexTest(schema, modules);
    const { owner, folderId, notebookId } = await seedConfiguredNotebook(t);
    const nb = await withAuth(t, owner).query(api.notebooks.index.get, { id: notebookId });
    expect(nb?.folderId).toBe(folderId);
    expect(nb?.chatSettings?.customInstructions).toBe("Secret prompt");
  });

  test("an editor gets access=editor without the owner's folder", async () => {
    const t = convexTest(schema, modules);
    const { notebookId } = await seedConfiguredNotebook(t);
    const editor = await t.run(async (ctx) => {
      const editor = await ctx.db.insert("users", { name: "Ed" });
      await ctx.db.insert("notebookMembers", {
        notebookId,
        userId: editor,
        role: "editor",
        joinedAt: Date.now(),
      });
      return editor;
    });
    const nb = await withAuth(t, editor).query(api.notebooks.index.get, { id: notebookId });
    expect(nb?.access).toBe("editor");
    expect(nb?.isSharedNotebook).toBe(true);
    expect(nb?.ownerName).toBe("Ada");
    expect(nb?.folderId).toBeUndefined();
    expect(nb?.chatSettings?.customInstructions).toBe("Secret prompt");
  });

  test("a viewer gets chat settings without the custom instructions or the folder", async () => {
    const t = convexTest(schema, modules);
    const { notebookId } = await seedConfiguredNotebook(t);
    const viewer = await t.run((ctx) => ctx.db.insert("users", { name: "Viewer" }));
    const nb = await withAuth(t, viewer).query(api.notebooks.index.get, { id: notebookId });
    expect(nb?.access).toBe("viewer");
    expect(nb?.folderId).toBeUndefined();
    expect(nb?.chatSettings).toEqual({
      instructionMode: "custom",
      responseLength: "longer",
      smartModel: "some-model",
    });
  });
});

// #589: the list reads the count stored on the notebook instead of every document.
describe("notebook source count", () => {
  test("stays in step as sources are added and removed", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    const created = await asUser.mutation(api.notebooks.index.create, { title: "NB" });
    const notebookId = created.id as Id<"notebooks">;

    const upload = (fileName: string) =>
      asUser.mutation(api.documents.index.upload, {
        notebookId,
        type: "text",
        source: "Some pasted text.",
        fileName,
      });
    const first = await upload("One");
    await upload("Two");
    expect((await asUser.query(api.notebooks.index.list, {}))[0]?.sourceCount).toBe(2);

    await asUser.mutation(api.documents.index.remove, {
      id: first.documentId as Id<"documents">,
    });
    expect((await asUser.query(api.notebooks.index.list, {}))[0]?.sourceCount).toBe(1);
    const stored = await t.run((ctx) => ctx.db.get(notebookId));
    expect(stored?.sourceCount).toBe(1);
  });

  test("counts the documents of a notebook without a stored count", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const notebookId = await ctx.db.insert("notebooks", {
        userId,
        title: "Old NB",
        createdAt: now,
        updatedAt: now,
      });
      for (const fileName of ["a", "b", "c"]) {
        await ctx.db.insert("documents", {
          userId,
          notebookId,
          fileName,
          fileType: "text",
          status: "completed",
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const list = await withAuth(t, userId).query(api.notebooks.index.list, {});
    expect(list[0]?.sourceCount).toBe(3);
  });
});
