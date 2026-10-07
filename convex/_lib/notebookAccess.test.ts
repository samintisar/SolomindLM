/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  assertCanEditNotebook,
  assertCanReadNotebook,
  assertNotebookOwner,
  canReadNotebook,
  getNotebookAccess,
  getNotebookMember,
} from "./notebookAccess";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  title = "Test Notebook"
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedNotebookMember(
  t: ReturnType<typeof convexTest>,
  notebookId: Id<"notebooks">,
  userId: Id<"users">,
  role: "editor" | "viewer" = "editor"
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

describe("getNotebookMember", () => {
  test("returns member record when user is a member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const memberId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, memberId, "editor");

    const result = await t.run(async (ctx) => getNotebookMember(ctx, notebookId, memberId));
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(memberId);
    expect(result?.role).toBe("editor");
  });

  test("returns null when user is not a member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    const result = await t.run(async (ctx) => getNotebookMember(ctx, notebookId, otherId));
    expect(result).toBeNull();
  });
});

describe("getNotebookAccess", () => {
  test("returns owner for notebook creator", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    const result = await t.run(async (ctx) => getNotebookAccess(ctx, notebookId, ownerId));
    expect(result).toBe("owner");
  });

  test("returns editor for notebook member with editor role", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const editorId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, editorId, "editor");

    const result = await t.run(async (ctx) => getNotebookAccess(ctx, notebookId, editorId));
    expect(result).toBe("editor");
  });

  test("returns editor for notebook member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const memberId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, memberId);

    const result = await t.run(async (ctx) => getNotebookAccess(ctx, notebookId, memberId));
    expect(result).toBe("editor");
  });

  test("returns null for non-member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    const result = await t.run(async (ctx) => getNotebookAccess(ctx, notebookId, otherId));
    expect(result).toBeNull();
  });

  test("returns null for non-existent notebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const result = await t.run(async (ctx) =>
      getNotebookAccess(ctx, "non-existent" as Id<"notebooks">, userId)
    );
    expect(result).toBeNull();
  });
});

describe("assertCanReadNotebook", () => {
  test("returns notebook and access for owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    const result = await t.run(async (ctx) => assertCanReadNotebook(ctx, notebookId, ownerId));
    expect(result.notebook._id).toBe(notebookId);
    expect(result.access).toBe("owner");
  });

  test("returns notebook and access for editor member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const editorId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, editorId, "editor");

    const result = await t.run(async (ctx) => assertCanReadNotebook(ctx, notebookId, editorId));
    expect(result.notebook._id).toBe(notebookId);
    expect(result.access).toBe("editor");
  });

  test("throws for non-member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    await expect(
      t.run(async (ctx) => assertCanReadNotebook(ctx, notebookId, otherId))
    ).rejects.toThrow("Notebook not found");
  });

  test("throws for non-existent notebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      t.run(async (ctx) => assertCanReadNotebook(ctx, "non-existent" as Id<"notebooks">, userId))
    ).rejects.toThrow("Notebook not found");
  });
});

describe("canReadNotebook", () => {
  test("returns true for owner and editor member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const editorId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, editorId, "editor");

    await expect(t.run(async (ctx) => canReadNotebook(ctx, notebookId, ownerId))).resolves.toBe(
      true
    );
    await expect(t.run(async (ctx) => canReadNotebook(ctx, notebookId, editorId))).resolves.toBe(
      true
    );
  });

  test("returns false for non-member instead of throwing", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    await expect(t.run(async (ctx) => canReadNotebook(ctx, notebookId, otherId))).resolves.toBe(
      false
    );
  });

  test("returns false for a deleted notebook instead of throwing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await t.run(async (ctx) => ctx.db.delete(notebookId));

    await expect(t.run(async (ctx) => canReadNotebook(ctx, notebookId, userId))).resolves.toBe(
      false
    );
  });
});

describe("assertCanEditNotebook", () => {
  test("returns notebook and access for owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    const result = await t.run(async (ctx) => assertCanEditNotebook(ctx, notebookId, ownerId));
    expect(result.access).toBe("owner");
  });

  test("returns notebook and access for editor member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const editorId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, editorId, "editor");

    const result = await t.run(async (ctx) => assertCanEditNotebook(ctx, notebookId, editorId));
    expect(result.access).toBe("editor");
  });

  test("returns notebook and access for member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const memberId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedNotebookMember(t, notebookId, memberId);

    const result = await t.run(async (ctx) => assertCanEditNotebook(ctx, notebookId, memberId));
    expect(result.access).toBe("editor");
  });

  test("throws for non-member", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    await expect(
      t.run(async (ctx) => assertCanEditNotebook(ctx, notebookId, otherId))
    ).rejects.toThrow("Notebook not found");
  });
});

describe("assertNotebookOwner", () => {
  test("returns notebook for owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    const result = await t.run(async (ctx) => assertNotebookOwner(ctx, notebookId, ownerId));
    expect(result._id).toBe(notebookId);
  });

  test("throws for non-owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    await expect(
      t.run(async (ctx) => assertNotebookOwner(ctx, notebookId, otherId))
    ).rejects.toThrow("Notebook not found");
  });

  test("throws for non-existent notebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      t.run(async (ctx) => assertNotebookOwner(ctx, "non-existent" as Id<"notebooks">, userId))
    ).rejects.toThrow("Notebook not found");
  });
});
