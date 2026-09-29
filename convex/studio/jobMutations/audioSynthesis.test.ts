/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function seedAudioOverview(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return ctx.db.insert("audioOverviews", {
      userId,
      notebookId,
      title: "Audio Overview",
      status: "generating",
      metadata: {
        audioType: "debate",
        length: "short",
        mapResults: { 0: JSON.stringify({ beats: "B", processingTimeMs: 10 }) },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

const script = [
  { speaker: "host_a" as const, text: "Opening line." },
  { speaker: "host_b" as const, text: "Reply line." },
];

describe("storeAudioOverviewScript", () => {
  test("stores the script for the synthesis phase without dropping settings or map results", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await seedAudioOverview(t);

    await t.mutation(internal.studio.jobMutations.audio.storeAudioOverviewScript, {
      audioOverviewId,
      script,
      title: "Generated Title",
      reduce: { latencyMs: 1234, tokenUsage: { prompt: 1, completion: 2, total: 3 } },
    });

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("generating");
    expect(row?.metadata).toMatchObject({
      audioType: "debate",
      length: "short",
      mapResults: { 0: expect.any(String) },
      phase: "synthesizing",
      dialogueScript: script,
      pendingTitle: "Generated Title",
      reduceTelemetry: { latencyMs: 1234 },
    });
  });
});

describe("clearAudioOverviewMapData", () => {
  test("removes the intermediate map results and stored script", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await seedAudioOverview(t);
    await t.mutation(internal.studio.jobMutations.audio.storeAudioOverviewScript, {
      audioOverviewId,
      script,
      title: "Generated Title",
      reduce: { latencyMs: 1 },
    });

    await t.mutation(internal.studio.jobMutations.audio.clearAudioOverviewMapData, {
      audioOverviewId,
    });

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.metadata).not.toHaveProperty("mapResults");
    expect(row?.metadata).not.toHaveProperty("dialogueScript");
    expect(row?.metadata).not.toHaveProperty("pendingTitle");
    expect(row?.metadata).not.toHaveProperty("reduceTelemetry");
    expect(row?.metadata).toMatchObject({ audioType: "debate" });
  });
});
