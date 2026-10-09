/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isAllowedRedirect, isLocalDevSite } from "./auth";
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
  const DEV_BASES = ["http://localhost:5173"];

  test("allows relative paths and the configured site", () => {
    expect(isAllowedRedirect("/home", PROD_BASES)).toBe(true);
    expect(isAllowedRedirect("?code=1", PROD_BASES)).toBe(true);
    expect(isAllowedRedirect("https://solomindlm.com/home", PROD_BASES)).toBe(true);
  });

  test("rejects other hosts and lookalikes of the site", () => {
    expect(isAllowedRedirect("https://evil.com/home", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("https://solomindlm.com.evil.com/home", PROD_BASES)).toBe(false);
  });

  test("allows a worktree's localhost port when the site itself is localhost", () => {
    const opts = { allowAnyLocalhostPort: true };
    expect(isAllowedRedirect("http://localhost:64402/home", DEV_BASES, opts)).toBe(true);
    expect(isAllowedRedirect("http://127.0.0.1:5181/home", DEV_BASES, opts)).toBe(true);
    expect(isAllowedRedirect("http://localhost:64402", DEV_BASES, opts)).toBe(true);
  });

  test("keeps localhost lookalikes out even on a dev deployment", () => {
    const opts = { allowAnyLocalhostPort: true };
    expect(isAllowedRedirect("http://localhost:64402@evil.com/home", DEV_BASES, opts)).toBe(false);
    expect(isAllowedRedirect("http://localhost.evil.com:64402/home", DEV_BASES, opts)).toBe(false);
    expect(isAllowedRedirect("https://localhost:64402/home", DEV_BASES, opts)).toBe(false);
  });

  test("rejects other localhost ports when the site is not localhost", () => {
    expect(isAllowedRedirect("http://localhost:64402/home", PROD_BASES)).toBe(false);
    expect(isAllowedRedirect("http://127.0.0.1:5181/home", PROD_BASES)).toBe(false);
  });
});

describe("isLocalDevSite", () => {
  test("is true only for a plain-http localhost site", () => {
    expect(isLocalDevSite("http://localhost:5173")).toBe(true);
    expect(isLocalDevSite("http://127.0.0.1:5173")).toBe(true);
    expect(isLocalDevSite("https://solomindlm.com")).toBe(false);
    expect(isLocalDevSite("http://localhost.evil.com")).toBe(false);
    expect(isLocalDevSite("not a url")).toBe(false);
  });
});
