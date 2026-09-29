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

  test("does nothing when the audio overview was deleted mid-job", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await seedAudioOverview(t);
    await t.run((ctx) => ctx.db.delete(audioOverviewId));

    await expect(
      t.mutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
        audioOverviewId,
        status: "generating",
        metadata: { phase: "writing_script", progress: 55 },
      })
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
        audioOverviewId,
        error: "boom",
      })
    ).resolves.toBeNull();
  });
});

describe("audio job mutation sequence", () => {
  const settings = { audioType: "debate", length: "short", focus: "exam prep" };

  async function runMapPhase(t: ReturnType<typeof convexTest>) {
    const audioOverviewId = await seedAudioOverview(t);
    const audio = internal.studio.jobMutations.audio;
    await t.mutation(audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: { phase: "initializing", progress: 5 },
    });
    await t.mutation(audio.initAudioOverviewMapPhase, { audioOverviewId, totalMapTasks: 1 });
    await t.mutation(audio.storeAudioOverviewMapResult, {
      audioOverviewId,
      chunkIndex: 0,
      result: JSON.stringify({ beats: "beat" }),
    });
    await t.mutation(audio.clearAudioOverviewMapData, { audioOverviewId });
    await t.mutation(audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: { phase: "writing_script", progress: 55 },
    });
    return audioOverviewId;
  }

  test("completed row keeps the user's settings", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runMapPhase(t);

    await t.mutation(internal.studio.jobMutations.audio.saveAudioOverviewResults, {
      audioOverviewId,
      audioUrl: "https://example.com/audio.mp3",
      transcript: "Hello",
      metadata: { title: "Title", phase: "completed", progress: 100 },
    });

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("completed");
    expect(row?.metadata).toMatchObject({ ...settings, phase: "completed", progress: 100 });
    expect(row?.metadata.mapResults).toBeUndefined();
  });

  test("failed row keeps the user's settings and drops map output", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await seedAudioOverview(t);
    await t.mutation(internal.studio.jobMutations.audio.initAudioOverviewMapPhase, {
      audioOverviewId,
      totalMapTasks: 2,
    });

    await t.mutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
      audioOverviewId,
      error: "All map tasks failed",
      metadata: { phase: "failed", errorPhase: "map_processing", errorType: "llm_failure" },
    });

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("failed");
    expect(row?.metadata).toMatchObject({ ...settings, phase: "failed" });
    expect(row?.metadata.mapResults).toBeUndefined();
  });
});
