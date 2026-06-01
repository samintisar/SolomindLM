/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

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
