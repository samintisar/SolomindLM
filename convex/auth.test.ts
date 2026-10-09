/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isAllowedRedirect } from "./auth";
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

describe("auth.getSignInOptions", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("offers Apple once its Services ID and secret are both set", async () => {
    vi.stubEnv("AUTH_APPLE_ID", "com.solomindlm.web");
    vi.stubEnv("AUTH_APPLE_SECRET", "secret-jwt");
    const t = convexTest(schema, modules);

    expect(await t.query(api.auth.getSignInOptions, {})).toEqual({ apple: true });
  });

  test("hides Apple while either credential is missing", async () => {
    vi.stubEnv("AUTH_APPLE_ID", "com.solomindlm.web");
    vi.stubEnv("AUTH_APPLE_SECRET", "");
    const t = convexTest(schema, modules);

    expect(await t.query(api.auth.getSignInOptions, {})).toEqual({ apple: false });
  });
});

describe("isAllowedRedirect", () => {
  const PROD_BASES = ["https://solomindlm.com"];

  test("allows a LAN Vite dev server", () => {
    expect(isAllowedRedirect("http://192.168.1.20:5173/home", PROD_BASES)).toBe(true);
    expect(isAllowedRedirect("http://192.168.1.20:5173", PROD_BASES)).toBe(true);
    expect(isAllowedRedirect("http://192.168.1.20/home", PROD_BASES)).toBe(true);
  });

  test("rejects LAN lookalikes", () => {
    expect(isAllowedRedirect("http://192.168.1.12.evil.com/home", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("http://192.168.1.12.evil.com:5173/home", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("http://192.168.1.1@evil.com/", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("http://192.168.1.1:5173@evil.com/", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("http://user:pass@192.168.1.20:5173/home", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("https://192.168.1.20:5173/home", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("http://192.168.1.20.nip.io:5173/home", PROD_BASES)).toBe(false);
  });
});
