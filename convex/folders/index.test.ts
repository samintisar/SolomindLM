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

describe("folders.index", () => {
  test("create returns folder DTO", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const folder = await asUser.mutation(api.folders.index.create, {
      name: "Research",
      description: "Papers",
      color: "bg-purple-500",
    });

    expect(folder.name).toBe("Research");
    expect(folder.description).toBe("Papers");
    expect(folder.notebookCount).toBe(0);
    expect(folder.id).toBeDefined();
  });

  test("list returns folders with notebook counts", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const folder = await asUser.mutation(api.folders.index.create, { name: "Work" });
    await asUser.mutation(api.notebooks.index.create, {
      title: "NB1",
      folderId: folder.id,
    });

    const list = await asUser.query(api.folders.index.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]?.notebookCount).toBe(1);
  });

  test("get returns null for another user's folder", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherId = await seedUser(t);
    const asOwner = withAuth(t, ownerId);

    const folder = await asOwner.mutation(api.folders.index.create, { name: "Private" });

    const result = await withAuth(t, otherId).query(api.folders.index.get, {
      id: folder.id,
    });
    expect(result).toBeNull();
  });

  test("remove unlinks notebooks and deletes folder", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const folder = await asUser.mutation(api.folders.index.create, { name: "Temp" });
    const nb = await asUser.mutation(api.notebooks.index.create, {
      title: "In Folder",
      folderId: folder.id,
    });

    await asUser.mutation(api.folders.index.remove, { id: folder.id });

    const folders = await asUser.query(api.folders.index.list, {});
    expect(folders).toHaveLength(0);

    const notebooks = await asUser.query(api.notebooks.index.list, {});
    const updated = notebooks.find((n) => n.id === nb.id);
    expect(updated?.folderId).toBeUndefined();
  });
});
