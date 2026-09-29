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
      metadata: { audioType: "debate", length: "short", focus: "exam prep" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

describe("updateAudioOverviewStatus", () => {
  test("keeps the user's generation settings when recording progress", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await seedAudioOverview(t);

    await t.mutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: { phase: "initializing", progress: 5, currentStep: "Initializing..." },
    });

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.metadata).toMatchObject({
      audioType: "debate",
      length: "short",
      focus: "exam prep",
      phase: "initializing",
      progress: 5,
    });
  });

  test("later progress replaces earlier progress fields", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await seedAudioOverview(t);

    for (const [phase, progress] of [
      ["initializing", 5],
      ["writing_script", 55],
    ] as const) {
      await t.mutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
        audioOverviewId,
        status: "generating",
        metadata: { phase, progress },
      });
    }

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.metadata).toMatchObject({ phase: "writing_script", progress: 55, length: "short" });
  });
});
