/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./userPreferences/index.ts"]);

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

async function getRow(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
  );
}

describe("getMyAiConsent", () => {
  test("reports signed out when there is no identity", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.userPreferences.index.getMyAiConsent, {});
    expect(result).toEqual({ signedIn: false });
  });

  test("reports no answer when the user has no preferences row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const result = await withAuth(t, userId).query(api.userPreferences.index.getMyAiConsent, {});
    expect(result).toEqual({ signedIn: true, version: null, declined: false });
  });
});

describe("grantAiConsent", () => {
  test("stores the version and time", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    expect(await asUser.query(api.userPreferences.index.getMyAiConsent, {})).toEqual({
      signedIn: true,
      version: 1,
      declined: false,
    });
    const row = await getRow(t, userId);
    expect(typeof row?.aiConsentAt).toBe("number");
  });

  test("clears an earlier decline", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.declineAiConsent, {});
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    const row = await getRow(t, userId);
    expect(row?.aiConsentDeclinedAt).toBeUndefined();
    expect(row?.aiConsentVersion).toBe(1);
  });

  test("keeps the output language", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "es" });
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    const row = await getRow(t, userId);
    expect(row?.outputLanguage).toBe("es");
  });

  test.each([0, -1, 1.5])("rejects version %s", async (version) => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(
      withAuth(t, userId).mutation(api.userPreferences.index.grantAiConsent, { version })
    ).rejects.toThrow();
  });

  test("rejects when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.userPreferences.index.grantAiConsent, { version: 1 })
    ).rejects.toThrow();
  });

  test("only changes the caller's row", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t);
    const bob = await seedUser(t);
    await withAuth(t, alice).mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    expect(await withAuth(t, bob).query(api.userPreferences.index.getMyAiConsent, {})).toEqual({
      signedIn: true,
      version: null,
      declined: false,
    });
  });
});

describe("declineAiConsent", () => {
  test("clears a grant and records the decline", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    await asUser.mutation(api.userPreferences.index.declineAiConsent, {});
    expect(await asUser.query(api.userPreferences.index.getMyAiConsent, {})).toEqual({
      signedIn: true,
      version: null,
      declined: true,
    });
    const row = await getRow(t, userId);
    expect(typeof row?.aiConsentDeclinedAt).toBe("number");
  });

  test("rejects when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.userPreferences.index.declineAiConsent, {})).rejects.toThrow();
  });
});
