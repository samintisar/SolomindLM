/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

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
