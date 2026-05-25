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

describe("setOutputLanguage", () => {
  test("stores a valid language code", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await withAuth(t, userId).mutation(api.userPreferences.index.setOutputLanguage, {
      outputLanguage: "es",
    });
    const prefs = await t.run(async (ctx) =>
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique()
    );
    expect(prefs?.outputLanguage).toBe("es");
  });

  test("upserts on second call (no duplicate rows)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "fr" });
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "ja" });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].outputLanguage).toBe("ja");
  });

  test("rejects an unknown language code", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(
      withAuth(t, userId).mutation(api.userPreferences.index.setOutputLanguage, {
        outputLanguage: "xx",
      })
    ).rejects.toThrow();
  });

  test("rejects when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.userPreferences.index.setOutputLanguage, {
        outputLanguage: "en",
      })
    ).rejects.toThrow();
  });
});

describe("getMyPreferences", () => {
  test("returns null when no row exists", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const result = await withAuth(t, userId).query(api.userPreferences.index.getMyPreferences, {});
    expect(result).toBeNull();
  });

  test("returns stored preference after mutation", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "ko" });
    const result = await asUser.query(api.userPreferences.index.getMyPreferences, {});
    expect(result?.outputLanguage).toBe("ko");
  });
});
