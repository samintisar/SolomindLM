/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../../_generated/api";
import { preloadModules } from "../../_testing/preloadModules.helpers";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./studio/jobMutations/mindmaps.ts", "./studio/mindmaps/index.ts"]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

async function seedMindmap(overrides: { metadata?: Record<string, unknown> } = {}) {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: now,
      updatedAt: now,
    });
    return ctx.db.insert("mindmaps", {
      userId,
      notebookId,
      title: "Map",
      data: {},
      status: "generating",
      metadata: overrides.metadata ?? { documentIds: ["d1", "d2"] },
      createdAt: now,
      updatedAt: now,
    });
  });
  return { t, id };
}

describe("mind map job writes keep the map's sources", () => {
  test("saveMindMapResults keeps the map's sources", async () => {
    const { t, id } = await seedMindmap();
    await t.mutation(internal.studio.jobMutations.mindmaps.saveMindMapResults, {
      mindmapId: id,
      mindmap: { nodeData: { id: "root", topic: "Map", children: [] } },
      metadata: { title: "Map", nodeCount: 1 },
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.metadata).toMatchObject({ documentIds: ["d1", "d2"], nodeCount: 1 });
  });

  test("updateMindMapStatus keeps the map's sources when it replaces metadata", async () => {
    const { t, id } = await seedMindmap();
    await t.mutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
      mindmapId: id,
      status: "generating",
      metadata: { phase: "building", progress: 70 },
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.metadata).toMatchObject({ documentIds: ["d1", "d2"], phase: "building" });
  });

  test("markMindMapFailed keeps the map's sources", async () => {
    const { t, id } = await seedMindmap();
    await t.mutation(internal.studio.jobMutations.mindmaps.markMindMapFailed, {
      mindmapId: id,
      error: "boom",
      metadata: { phase: "finalizing" },
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.status).toBe("failed");
    expect(row?.metadata).toMatchObject({ documentIds: ["d1", "d2"] });
  });

  test("a row without sources stays without them", async () => {
    const { t, id } = await seedMindmap({ metadata: {} });
    await t.mutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
      mindmapId: id,
      status: "generating",
      metadata: { phase: "building" },
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.metadata).not.toHaveProperty("documentIds");
  });
});

async function seedGenerateMindMapUser() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const now = Date.now();
  const { userId, notebookId, docId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: now,
      updatedAt: now,
    });
    const docId = await ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: "notes.txt",
      fileType: "text",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, notebookId, docId };
  });
  const asOwner = t.withIdentity({
    subject: userId,
    issuer: "test",
    tokenIdentifier: `test|${userId}`,
  });
  return { t, userId, notebookId, docId, asOwner };
}

describe("generateMindMap", () => {
  test("is refused once a Free user's daily mind map has been used", async () => {
    const { t, userId, notebookId, docId, asOwner } = await seedGenerateMindMapUser();
    await t.mutation(internal._lib.limits.consumeDailyLimitInternal, {
      userId,
      feature: "mindmap",
    });

    await expect(
      asOwner.mutation(api.studio.mindmaps.index.generateMindMap, {
        notebookId,
        documentIds: [docId],
      })
    ).rejects.toThrow(/Daily mind map limit reached \(1\/1\)/);
  });

  test("stores the selected sources on the new row", async () => {
    const t = convexTest(schema, modules);
    registerRateLimiter(t);
    const now = Date.now();
    const { userId, notebookId, docId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Test" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId,
        title: "Notebook",
        createdAt: now,
        updatedAt: now,
      });
      const docId = await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "notes.txt",
        fileType: "text",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
      return { userId, notebookId, docId };
    });

    const asOwner = t.withIdentity({
      subject: userId,
      issuer: "test",
      tokenIdentifier: `test|${userId}`,
    });
    const mindmapId = await asOwner.mutation(api.studio.mindmaps.index.generateMindMap, {
      notebookId,
      documentIds: [docId],
    });

    const row = await t.run((ctx) => ctx.db.get(mindmapId));
    expect(row?.metadata).toEqual({ documentIds: [docId] });
  });
});
