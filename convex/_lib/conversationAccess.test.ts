/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import type { Id } from "../_generated/dataModel";
import {
  getConversationIfReadable,
  assertCanReadConversation,
  assertCanEditConversation,
} from "./conversationAccess";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

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
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedNotebookMember(
  t: ReturnType<typeof convexTest>,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<Id<"notebookMembers">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebookMembers", {
      notebookId,
      userId,
      role: "editor",
      joinedAt: Date.now(),
    })
  );
}

async function seedConversation(
  t: ReturnType<typeof convexTest>,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<Id<"conversations">> {
  return t.run(async (ctx) =>
    ctx.db.insert("conversations", {
      notebookId,
      userId,
      title: "Test Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("getConversationIfReadable", () => {
  test("returns conversation for notebook owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    const result = await t.run(async (ctx) =>
      getConversationIfReadable(ctx, conversationId, ownerId)
    );
    expect(result).not.toBeNull();
    expect(result?._id).toBe(conversationId);
  });

  test("returns conversation for notebook editor", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const editorId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, editorId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    const result = await t.run(async (ctx) =>
      getConversationIfReadable(ctx, conversationId, editorId)
    );
    expect(result).not.toBeNull();
    expect(result?._id).toBe(conversationId);
  });

  test("returns null for non-member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    const result = await t.run(async (ctx) =>
      getConversationIfReadable(ctx, conversationId, otherId)
    );
    expect(result).toBeNull();
  });

  test("returns null for non-existent conversation", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const result = await t.run(async (ctx) =>
      getConversationIfReadable(ctx, "non-existent" as Id<"conversations">, userId)
    );
    expect(result).toBeNull();
  });
});

describe("assertCanReadConversation", () => {
  test("returns conversation for notebook owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    const result = await t.run(async (ctx) =>
      assertCanReadConversation(ctx, conversationId, ownerId)
    );
    expect(result._id).toBe(conversationId);
  });

  test("returns conversation for notebook editor", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const editorId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, editorId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    const result = await t.run(async (ctx) =>
      assertCanReadConversation(ctx, conversationId, editorId)
    );
    expect(result._id).toBe(conversationId);
  });

  test("throws for non-member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    await expect(
      t.run(async (ctx) => assertCanReadConversation(ctx, conversationId, otherId))
    ).rejects.toThrow("Notebook not found");
  });

  test("throws for non-existent conversation", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      t.run(async (ctx) =>
        assertCanReadConversation(ctx, "non-existent" as Id<"conversations">, userId)
      )
    ).rejects.toThrow("Conversation not found");
  });
});

describe("assertCanEditConversation", () => {
  test("returns conversation for notebook owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    const result = await t.run(async (ctx) =>
      assertCanEditConversation(ctx, conversationId, ownerId)
    );
    expect(result._id).toBe(conversationId);
  });

  test("returns conversation for notebook editor", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const editorId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, editorId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    const result = await t.run(async (ctx) =>
      assertCanEditConversation(ctx, conversationId, editorId)
    );
    expect(result._id).toBe(conversationId);
  });

  test("throws for notebook viewer", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const viewerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    await expect(
      t.run(async (ctx) => assertCanEditConversation(ctx, conversationId, viewerId))
    ).rejects.toThrow("Notebook not found");
  });

  test("throws for non-member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const conversationId = await seedConversation(t, notebookId, ownerId);

    await expect(
      t.run(async (ctx) => assertCanEditConversation(ctx, conversationId, otherId))
    ).rejects.toThrow("Notebook not found");
  });

  test("throws for non-existent conversation", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      t.run(async (ctx) =>
        assertCanEditConversation(ctx, "non-existent" as Id<"conversations">, userId)
      )
    ).rejects.toThrow("Conversation not found");
  });
});
