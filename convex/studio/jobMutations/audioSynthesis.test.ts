/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import { preloadModules } from "../../_testing/preloadModules.helpers";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./studio/jobMutations/audio.ts"]);

const settings = { audioType: "debate", length: "short" };

const synthesisInput = {
  script: [
    { speaker: "host_a" as const, text: "Opening line." },
    { speaker: "host_b" as const, text: "Reply line." },
  ],
  title: "Generated Title",
  mapSuccessCount: 1,
  mapFailedCount: 1,
  telemetry: {
    tokenUsage: { prompt: 1, completion: 2, total: 3 },
    tokenUsageSource: "provider" as const,
    stageSpans: [
      { stage: "map" as const, latencyMs: 10 },
      { stage: "reduce" as const, latencyMs: 1234 },
    ],
  },
};

/** Runs the mutations in the order the real job does, up to the synthesis handoff. */
async function runToSynthesis(t: ReturnType<typeof convexTest>) {
  const audioOverviewId = await t.run(async (ctx) => {
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
      metadata: settings,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  const audio = internal.studio.jobMutations.audio;
  await t.mutation(audio.initAudioOverviewMapPhase, { audioOverviewId, totalMapTasks: 2 });
  await t.mutation(audio.storeAudioOverviewMapResult, {
    audioOverviewId,
    chunkIndex: 0,
    result: JSON.stringify({ beats: "B", processingTimeMs: 10 }),
  });
  await t.mutation(audio.storeAudioOverviewMapResult, {
    audioOverviewId,
    chunkIndex: 1,
    result: JSON.stringify({ _error: "failed" }),
  });
  // Finalize clears the map output before writing the script.
  await t.mutation(audio.clearAudioOverviewMapData, { audioOverviewId });
  await t.mutation(audio.storeAudioOverviewScript, { audioOverviewId, synthesisInput });
  return audioOverviewId;
}

describe("storeAudioOverviewScript", () => {
  test("hands the script, map counts and telemetry to the synthesis phase", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("generating");
    expect(row?.metadata).toMatchObject({ ...settings, phase: "synthesizing", synthesisInput });
    expect(row?.metadata.mapResults).toBeUndefined();
  });

  test("returns false when the audio overview was deleted", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);
    await t.run((ctx) => ctx.db.delete(audioOverviewId));

    await expect(
      t.mutation(internal.studio.jobMutations.audio.storeAudioOverviewScript, {
        audioOverviewId,
        synthesisInput,
      })
    ).resolves.toBe(false);
  });
});

describe("synthesis handoff cleanup", () => {
  test("completed row drops the stored script", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);

    await t.mutation(internal.studio.jobMutations.audio.saveAudioOverviewResults, {
      audioOverviewId,
      audioUrl: "https://example.com/audio.mp3",
      transcript: "Opening line.\nReply line.",
      metadata: { title: "Generated Title", phase: "completed", progress: 100 },
    });

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("completed");
    expect(row?.metadata).toMatchObject({ ...settings, phase: "completed" });
    expect(row?.metadata.synthesisInput).toBeUndefined();
  });

  test("failed row drops the stored script", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);

    await t.mutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
      audioOverviewId,
      error: "Too many synthesis failures",
      metadata: { phase: "failed", errorPhase: "synthesis", errorType: "unknown" },
    });

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("failed");
    expect(row?.metadata).toMatchObject({ ...settings, phase: "failed" });
    expect(row?.metadata.synthesisInput).toBeUndefined();
  });
});
