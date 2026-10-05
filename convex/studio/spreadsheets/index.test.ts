/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { preloadModules } from "../../_testing/preloadModules.helpers";
import schema from "../../schema.js";

// Root-relative glob normalized to "./studio/..." keys, as in convex/studio/prompts/index.test.ts.
const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<any>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./studio/spreadsheets/index.ts"]);

type TestConvex = ReturnType<typeof convexTest>;

async function seedUser(t: TestConvex, email = "test@example.com") {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      email,
      emailVerificationTime: Date.now(),
      isAnonymous: false,
    });
  });
}

async function seedNotebook(t: TestConvex, ownerUserId: Id<"users">) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    return await ctx.db.insert("notebooks", {
      userId: ownerUserId,
      title: "Test notebook",
      createdAt: now,
      updatedAt: now,
    });
  });
}

function withIdentity(t: TestConvex, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: "test", tokenIdentifier: `test|${userId}` });
}

async function seedSpreadsheet(
  t: TestConvex,
  userId: Id<"users">,
  notebookId: Id<"notebooks">,
  overrides: Partial<{ status: string; data: unknown }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("spreadsheets", {
      userId,
      notebookId,
      title: "Sheet",
      data: '"a","b"\n"1","2"',
      status: "completed",
      metadata: { spreadsheetType: "comparison_table", documentIds: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    })
  );
}

async function setup(overrides: Partial<{ status: string; data: unknown }> = {}) {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const notebookId = await seedNotebook(t, userId);
  const id = await seedSpreadsheet(t, userId, notebookId, overrides);
  return { t, userId, notebookId, id, owner: withIdentity(t, userId) };
}

const INPUT_VALIDATION = {
  data: expect.objectContaining({ type: "INPUT_VALIDATION_ERROR", field: "data" }),
};

const rows = (count: number) => Array.from({ length: count }, (_, i) => String(i)).join("\n");
const columns = (count: number) => Array.from({ length: count }, (_, i) => `c${i}`).join(",");

describe("spreadsheets.index.update", () => {
  it("saves new CSV and marks the edit without losing metadata", async () => {
    const { id, owner } = await setup();
    const updated = await owner.mutation(api.studio.spreadsheets.index.update, {
      id,
      data: '"x","y"\n"3","4"',
    });
    expect(updated?.data).toBe('"x","y"\n"3","4"');
    expect(typeof updated?.metadata.editedAt).toBe("number");
    expect(updated?.metadata.spreadsheetType).toBe("comparison_table");
  });

  it("renames without marking an edit", async () => {
    const { id, owner } = await setup();
    const updated = await owner.mutation(api.studio.spreadsheets.index.update, {
      id,
      title: "Renamed",
    });
    expect(updated?.title).toBe("Renamed");
    expect(updated?.data).toBe('"a","b"\n"1","2"');
    expect(updated?.metadata.editedAt).toBeUndefined();
  });

  it("rejects a user who cannot see the notebook", async () => {
    const { t, id } = await setup();
    const other = await seedUser(t, "other@example.com");
    await expect(
      withIdentity(t, other).mutation(api.studio.spreadsheets.index.update, { id, data: "a" })
    ).rejects.toThrow("Notebook not found");
  });

  it("rejects an unauthenticated caller", async () => {
    const { t, id } = await setup();
    await expect(
      t.mutation(api.studio.spreadsheets.index.update, { id, data: "a" })
    ).rejects.toThrow("Unauthenticated");
  });

  it("rejects non-string data", async () => {
    const { id, owner } = await setup();
    await expect(
      owner.mutation(api.studio.spreadsheets.index.update, {
        id,
        data: 42 as unknown as string,
      })
    ).rejects.toThrow();
  });

  it("rejects CSV over 512 KB", async () => {
    const { id, owner } = await setup();
    await expect(
      owner.mutation(api.studio.spreadsheets.index.update, {
        id,
        data: "x".repeat(512 * 1024 + 1),
      })
    ).rejects.toMatchObject(INPUT_VALIDATION);
  });

  it("measures the size limit in UTF-8 bytes, not characters", async () => {
    const { id, owner } = await setup();
    // 3 bytes per character: under the limit by characters, over it by bytes.
    await expect(
      owner.mutation(api.studio.spreadsheets.index.update, {
        id,
        data: "€".repeat(200 * 1024),
      })
    ).rejects.toMatchObject(INPUT_VALIDATION);
  });

  it("accepts exactly 2,000 rows and rejects 2,001", async () => {
    const { id, owner } = await setup();
    await expect(
      owner.mutation(api.studio.spreadsheets.index.update, { id, data: rows(2001) })
    ).rejects.toMatchObject(INPUT_VALIDATION);
    const updated = await owner.mutation(api.studio.spreadsheets.index.update, {
      id,
      data: rows(2000),
    });
    expect(updated?.data).toBe(rows(2000));
  });

  it("accepts 50 columns and rejects 51", async () => {
    const { id, owner } = await setup();
    await expect(
      owner.mutation(api.studio.spreadsheets.index.update, { id, data: columns(51) })
    ).rejects.toMatchObject(INPUT_VALIDATION);
    const updated = await owner.mutation(api.studio.spreadsheets.index.update, {
      id,
      data: columns(50),
    });
    expect(updated?.data).toBe(columns(50));
  });

  it("rejects data while generating but still allows a rename", async () => {
    const { id, owner } = await setup({ status: "generating", data: {} });
    await expect(
      owner.mutation(api.studio.spreadsheets.index.update, { id, data: "a,b" })
    ).rejects.toMatchObject(INPUT_VALIDATION);
    const updated = await owner.mutation(api.studio.spreadsheets.index.update, {
      id,
      title: "Renamed",
    });
    expect(updated?.title).toBe("Renamed");
  });

  it("no longer exposes the duplicate updateSpreadsheet mutation", () => {
    expect("updateSpreadsheet" in api.studio.spreadsheets.index).toBe(false);
  });
});
