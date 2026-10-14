/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./chat/messages.ts"]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "Chat NB",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("chat.messages", () => {
  test("createConversation stores conversation for notebook owner", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const conversation = await asUser.mutation(api.chat.messages.createConversation, {
      notebookId,
      title: "Main thread",
    });

    expect(conversation?.notebookId).toBe(notebookId);
    expect(conversation?.title).toBe("Main thread");
    expect(conversation?.userId).toBe(userId);
  });

  test("sendMessage creates conversation when missing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const messageId = await asUser.mutation(api.chat.messages.sendMessage, {
      notebookId,
      content: "Hello",
      role: "user",
    });

    expect(messageId).toBeDefined();

    const bundle = await asUser.query(api.chat.messages.listByNotebook, { notebookId });
    expect(bundle?.messages).toHaveLength(1);
    expect(bundle?.messages[0]?.content).toBe("Hello");
  });

  test("listByNotebook returns empty for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);

    const bundle = await t.query(api.chat.messages.listByNotebook, { notebookId });
    expect(bundle.messages).toEqual([]);
    expect(bundle.chatGenerating).toBe(false);
  });
});

describe("viewer chat on a public notebook", () => {
  // sendMessageOptimistic schedules generateAndSetTitle; fake timers keep it from running.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup() {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Owner" });
      const viewer = await ctx.db.insert("users", { name: "Viewer" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Public",
        isPublic: true,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const ownerConv = await ctx.db.insert("conversations", {
        userId: owner,
        notebookId,
        createdAt: now,
        updatedAt: now + 1000,
      });
      await ctx.db.insert("messages", {
        conversationId: ownerConv,
        role: "user",
        content: "owner's question",
        createdAt: now,
      });
      return { owner, viewer, notebookId, ownerConv };
    });
    return { t, ...ids };
  }

  test("a viewer's first message starts a private thread, not the owner's", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    const { conversationId } = await withAuth(t, viewer).mutation(
      api.chat.messages.sendMessageOptimistic,
      { notebookId, message: "viewer question" }
    );
    expect(conversationId).not.toBe(ownerConv);
    const conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.isPrivate).toBe(true);
    expect(conv?.userId).toBe(viewer);
  });

  test("a viewer does not see the owner's messages", async () => {
    const { t, viewer, notebookId } = await setup();
    const result = await withAuth(t, viewer).query(api.chat.messages.listByNotebook, {
      notebookId,
    });
    expect(result.messages).toEqual([]);
  });

  test("the owner's thread list hides viewers' threads", async () => {
    const { t, owner, viewer, notebookId, ownerConv } = await setup();
    await withAuth(t, viewer).mutation(api.chat.messages.sendMessageOptimistic, {
      notebookId,
      message: "viewer question",
    });
    const ownerList = await withAuth(t, owner).query(api.chat.conversations.listForNotebook, {
      notebookId,
    });
    expect(ownerList.map((c) => c._id)).toEqual([ownerConv]);
    const viewerList = await withAuth(t, viewer).query(api.chat.conversations.listForNotebook, {
      notebookId,
    });
    expect(viewerList).toHaveLength(1);
    expect(viewerList[0]._id).not.toBe(ownerConv);
  });

  test("a viewer cannot post into the owner's thread", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    await expect(
      withAuth(t, viewer).mutation(api.chat.messages.sendMessageOptimistic, {
        notebookId,
        message: "hi",
        conversationId: ownerConv,
      })
    ).rejects.toThrow("Conversation not found");
  });

  test("ensureConversation gives a viewer their own thread", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    const id = await t.mutation(internal.chat.index.ensureConversation, {
      notebookId,
      userId: viewer,
    });
    expect(id).not.toBe(ownerConv);
    expect((await t.run((ctx) => ctx.db.get(id)))?.isPrivate).toBe(true);
  });
});
