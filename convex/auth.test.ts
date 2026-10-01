/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

describe("auth.getCurrentUser", () => {
  test("returns the profile image when the user has one", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Ada Lovelace",
        email: "ada@example.com",
        image: "https://lh3.googleusercontent.com/a/photo",
      })
    );

    const user = await withAuth(t, userId).query(api.auth.getCurrentUser, {});

    expect(user).toEqual({
      id: userId,
      email: "ada@example.com",
      name: "Ada Lovelace",
      image: "https://lh3.googleusercontent.com/a/photo",
    });
  });

  test("leaves image undefined when the user has none", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "grace@example.com" })
    );

    const user = await withAuth(t, userId).query(api.auth.getCurrentUser, {});

    expect(user).not.toBeNull();
    expect(user?.email).toBe("grace@example.com");
    expect(user?.image).toBeUndefined();
  });

  test("returns null without an identity", async () => {
    const t = convexTest(schema, modules);

    const user = await t.query(api.auth.getCurrentUser, {});

    expect(user).toBeNull();
  });
});
