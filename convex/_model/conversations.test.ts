/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { getPrimaryVisibleConversation, listVisibleConversations } from "./conversations";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function setup() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const editor = await ctx.db.insert("users", { name: "Editor" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    const otherViewer = await ctx.db.insert("users", { name: "Other" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Public",
      isPublic: true,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notebookMembers", {
      notebookId,
      userId: editor,
      role: "editor",
      joinedAt: now,
    });
    const ownerConv = await ctx.db.insert("conversations", {
      userId: owner,
      notebookId,
      createdAt: now,
      updatedAt: now,
    });
    const editorConv = await ctx.db.insert("conversations", {
      userId: editor,
      notebookId,
      createdAt: now,
      updatedAt: now + 10,
    });
    const viewerConv = await ctx.db.insert("conversations", {
      userId: viewer,
      notebookId,
      isPrivate: true,
      createdAt: now,
      updatedAt: now + 20,
    });
    const otherViewerConv = await ctx.db.insert("conversations", {
      userId: otherViewer,
      notebookId,
      isPrivate: true,
      createdAt: now,
      updatedAt: now + 30,
    });
    return {
      owner,
      editor,
      viewer,
      otherViewer,
      notebookId,
      ownerConv,
      editorConv,
      viewerConv,
      otherViewerConv,
    };
  });
  return { t, ...ids };
}

describe("by_notebook_and_isPrivate index", () => {
  test("eq(isPrivate, undefined) matches rows where the field is absent", async () => {
    const { t, notebookId, ownerConv, editorConv } = await setup();
    const shared = await t.run((ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("by_notebook_and_isPrivate_and_updatedAt", (q) =>
          q.eq("notebookId", notebookId).eq("isPrivate", undefined)
        )
        .collect()
    );
    expect(shared.map((c) => c._id).sort()).toEqual([ownerConv, editorConv].sort());
  });
});

describe("listVisibleConversations", () => {
  test("a viewer sees only their own threads", async () => {
    const { t, viewer, notebookId, viewerConv } = await setup();
    const list = await t.run((ctx) =>
      listVisibleConversations(ctx, notebookId, { userId: viewer, access: "viewer" })
    );
    expect(list.map((c) => c._id)).toEqual([viewerConv]);
  });

  test("an editor sees shared threads but no viewer's private thread", async () => {
    const { t, editor, notebookId, ownerConv, editorConv } = await setup();
    const list = await t.run((ctx) =>
      listVisibleConversations(ctx, notebookId, { userId: editor, access: "editor" })
    );
    expect(list.map((c) => c._id).sort()).toEqual([ownerConv, editorConv].sort());
  });

  test("an explicit isPrivate: false thread counts as shared", async () => {
    const { t, owner, editor, notebookId, ownerConv, editorConv } = await setup();
    const explicitShared = await t.run((ctx) =>
      ctx.db.insert("conversations", {
        userId: owner,
        notebookId,
        isPrivate: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const list = await t.run((ctx) =>
      listVisibleConversations(ctx, notebookId, { userId: editor, access: "editor" })
    );
    expect(list.map((c) => c._id).sort()).toEqual([ownerConv, editorConv, explicitShared].sort());
  });

  test("an owner also sees their own private threads, once", async () => {
    const { t, owner, notebookId, ownerConv, editorConv } = await setup();
    const ownerPrivate = await t.run((ctx) =>
      ctx.db.insert("conversations", {
        userId: owner,
        notebookId,
        isPrivate: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const list = await t.run((ctx) =>
      listVisibleConversations(ctx, notebookId, { userId: owner, access: "owner" })
    );
    expect(list.map((c) => c._id).sort()).toEqual([ownerConv, editorConv, ownerPrivate].sort());
  });
});

describe("getPrimaryVisibleConversation", () => {
  test("picks the most recent thread the requester can see", async () => {
    const { t, owner, viewer, notebookId, editorConv, viewerConv } = await setup();
    const forOwner = await t.run((ctx) =>
      getPrimaryVisibleConversation(ctx, notebookId, { userId: owner, access: "owner" })
    );
    expect(forOwner?._id).toBe(editorConv);
    const forViewer = await t.run((ctx) =>
      getPrimaryVisibleConversation(ctx, notebookId, { userId: viewer, access: "viewer" })
    );
    expect(forViewer?._id).toBe(viewerConv);
  });

  test("considers the requester's own private threads and shared ones marked isPrivate: false", async () => {
    const { t, owner, editor, notebookId } = await setup();
    const now = Date.now();
    const { explicitShared, editorPrivate } = await t.run(async (ctx) => ({
      explicitShared: await ctx.db.insert("conversations", {
        userId: owner,
        notebookId,
        isPrivate: false,
        createdAt: now,
        updatedAt: now + 100,
      }),
      editorPrivate: await ctx.db.insert("conversations", {
        userId: editor,
        notebookId,
        isPrivate: true,
        createdAt: now,
        updatedAt: now + 200,
      }),
    }));

    const forOwner = await t.run((ctx) =>
      getPrimaryVisibleConversation(ctx, notebookId, { userId: owner, access: "owner" })
    );
    expect(forOwner?._id).toBe(explicitShared);
    const forEditor = await t.run((ctx) =>
      getPrimaryVisibleConversation(ctx, notebookId, { userId: editor, access: "editor" })
    );
    expect(forEditor?._id).toBe(editorPrivate);
  });

  test("returns null when the requester has no visible thread", async () => {
    const { t, notebookId } = await setup();
    const stranger = await t.run((ctx) => ctx.db.insert("users", { name: "New" }));
    const result = await t.run((ctx) =>
      getPrimaryVisibleConversation(ctx, notebookId, { userId: stranger, access: "viewer" })
    );
    expect(result).toBeNull();
  });
});
