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

const FIRST_PAGE = { numItems: 50, cursor: null };

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

    const bundle = await asUser.query(api.chat.messages.listPage, {
      notebookId,
      paginationOpts: FIRST_PAGE,
    });
    expect(bundle.page).toHaveLength(1);
    expect(bundle.page[0]?.content).toBe("Hello");
  });

  test("listPage returns the newest messages first and continues with older ones", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const conversationId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("conversations", {
        userId,
        notebookId,
        chatGenerationInFlight: 1,
        chatGenerationStartedAt: 123,
        createdAt: 0,
        updatedAt: 0,
      });
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert("messages", {
          conversationId: id,
          role: "user",
          content: `m${i}`,
          createdAt: i,
        });
      }
      return id;
    });
    const asUser = withAuth(t, userId);

    const first = await asUser.query(api.chat.messages.listPage, {
      notebookId,
      conversationId,
      paginationOpts: FIRST_PAGE,
    });
    expect(first.page.map((m) => m.content)).toEqual(
      Array.from({ length: 50 }, (_, i) => `m${59 - i}`)
    );
    expect(first.isDone).toBe(false);

    const rest = await asUser.query(api.chat.messages.listPage, {
      notebookId,
      conversationId,
      paginationOpts: { numItems: 50, cursor: first.continueCursor },
    });
    expect(rest.page.map((m) => m.content)).toEqual(
      Array.from({ length: 10 }, (_, i) => `m${9 - i}`)
    );
    expect(rest.isDone).toBe(true);

    const state = await asUser.query(api.chat.messages.generationState, {
      notebookId,
      conversationId,
    });
    expect(state).toEqual({ chatGenerating: true, chatGenerationStartedAt: 123 });

    // The deprecated query still answers clients on the previous bundle: whole thread, oldest first.
    const legacy = await asUser.query(api.chat.messages.listByNotebook, {
      notebookId,
      conversationId,
    });
    expect(legacy.messages.map((m) => m.content)).toEqual(
      Array.from({ length: 60 }, (_, i) => `m${i}`)
    );
    expect(legacy.chatGenerating).toBe(true);
  });

  test("listPage and generationState return empty for an unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);

    const page = await t.query(api.chat.messages.listPage, {
      notebookId,
      paginationOpts: FIRST_PAGE,
    });
    expect(page.page).toEqual([]);
    const state = await t.query(api.chat.messages.generationState, { notebookId });
    expect(state).toEqual({ chatGenerating: false, chatGenerationStartedAt: null });
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

  test("a viewer's conversation keeps the owner's instructions server-side but never returns them", async () => {
    const { t, owner, viewer, notebookId } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(notebookId, {
        chatSettings: {
          instructionMode: "custom",
          customInstructions: "Secret prompt",
          responseLength: "default",
        },
      })
    );

    const created = await withAuth(t, viewer).mutation(api.chat.messages.createConversation, {
      notebookId,
    });
    expect(created).not.toHaveProperty("customInstructions");
    expect(created?.instructionMode).toBe("custom");

    const listed = await withAuth(t, viewer).query(api.chat.conversations.listForNotebook, {
      notebookId,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("customInstructions");

    // Chat still runs with the snapshot.
    const stored = await t.run((ctx) => ctx.db.get(created!._id));
    expect(stored?.customInstructions).toBe("Secret prompt");

    // The owner still sees their own instructions.
    const ownerCreated = await withAuth(t, owner).mutation(api.chat.messages.createConversation, {
      notebookId,
    });
    expect(ownerCreated?.customInstructions).toBe("Secret prompt");
  });

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
    const result = await withAuth(t, viewer).query(api.chat.messages.listPage, {
      paginationOpts: FIRST_PAGE,
      notebookId,
    });
    expect(result.page).toEqual([]);
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

  test("a viewer's clearHistory without a conversationId leaves the owner's thread intact", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    await withAuth(t, viewer).mutation(api.chat.messages.sendMessageOptimistic, {
      notebookId,
      message: "viewer question",
    });
    await withAuth(t, viewer).mutation(api.chat.messages.clearHistory, { notebookId });
    const ownerMessages = await t.run((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", ownerConv))
        .collect()
    );
    expect(ownerMessages.map((m) => m.content)).toEqual(["owner's question"]);
  });

  test("createConversation by a viewer is private", async () => {
    const { t, viewer, notebookId } = await setup();
    const conv = await withAuth(t, viewer).mutation(api.chat.messages.createConversation, {
      notebookId,
      title: "Mine",
    });
    expect(conv?.isPrivate).toBe(true);
    expect(conv?.userId).toBe(viewer);
  });

  test("listPage with the owner's conversationId is empty for a viewer", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    const result = await withAuth(t, viewer).query(api.chat.messages.listPage, {
      paginationOpts: FIRST_PAGE,
      notebookId,
      conversationId: ownerConv,
    });
    expect(result.page).toEqual([]);
  });

  test("an editor sees another editor's shared thread but not a viewer's private one", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    const [editorA, editorB] = await t.run(async (ctx) => {
      const a = await ctx.db.insert("users", { name: "Editor A" });
      const b = await ctx.db.insert("users", { name: "Editor B" });
      for (const userId of [a, b]) {
        await ctx.db.insert("notebookMembers", {
          notebookId,
          userId,
          role: "editor",
          joinedAt: Date.now(),
        });
      }
      return [a, b];
    });
    const editorAConv = await withAuth(t, editorA).mutation(api.chat.messages.createConversation, {
      notebookId,
      title: "Editor A thread",
    });
    await withAuth(t, viewer).mutation(api.chat.messages.sendMessageOptimistic, {
      notebookId,
      message: "viewer question",
    });
    const list = await withAuth(t, editorB).query(api.chat.conversations.listForNotebook, {
      notebookId,
    });
    expect(list.map((c) => c._id).sort()).toEqual([ownerConv, editorAConv?._id].sort());
  });

  test("after unpublishing, a viewer can no longer read their own thread", async () => {
    const { t, viewer, notebookId } = await setup();
    const { conversationId } = await withAuth(t, viewer).mutation(
      api.chat.messages.sendMessageOptimistic,
      { notebookId, message: "viewer question" }
    );
    await t.run((ctx) => ctx.db.patch(notebookId, { isPublic: false }));
    const result = await withAuth(t, viewer).query(api.chat.messages.listPage, {
      paginationOpts: FIRST_PAGE,
      notebookId,
      conversationId,
    });
    expect(result.page).toEqual([]);
    const list = await withAuth(t, viewer).query(api.chat.conversations.listForNotebook, {
      notebookId,
    });
    expect(list).toEqual([]);
  });

  test("releaseChatGeneration ignores a conversation from another notebook", async () => {
    const { t, owner, ownerConv } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(ownerConv, { chatGenerationInFlight: 1, chatGenerationStartedAt: Date.now() })
    );
    const otherNotebook = await seedNotebook(t, owner);
    await withAuth(t, owner).mutation(api.chat.messages.releaseChatGeneration, {
      notebookId: otherNotebook,
      conversationId: ownerConv,
    });
    const conv = await t.run((ctx) => ctx.db.get(ownerConv));
    expect(conv?.chatGenerationInFlight).toBe(1);
  });
});
