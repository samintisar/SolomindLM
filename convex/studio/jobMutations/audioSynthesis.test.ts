/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import type { AudioSynthesisInput } from "./audio";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

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
async function runToSynthesis(
  t: ReturnType<typeof convexTest>,
  input: AudioSynthesisInput = synthesisInput
) {
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
  await t.mutation(audio.storeAudioOverviewScript, { audioOverviewId, synthesisInput: input });
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

const audio = internal.studio.jobMutations.audio;
const twoChunks = [
  { start: 0, end: 1 },
  { start: 1, end: 2 },
];

async function storeFile(t: ReturnType<typeof convexTest>, bytes: number[]) {
  return t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }))
  );
}

async function fileExists(t: ReturnType<typeof convexTest>, storageId: Id<"_storage">) {
  return t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null);
}

const chunkResult = (storageId: Id<"_storage">) => ({
  storageId,
  synthesizedLines: 1,
  failedLines: 0,
  latencyMs: 10,
});

describe("synthesis state", () => {
  test("initAudioSynthesis writes the chunk plan once", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);

    await expect(
      t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks })
    ).resolves.toBe(true);
    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.metadata.synthesis).toMatchObject({ chunks: twoChunks, done: {} });
    await expect(
      t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks })
    ).resolves.toBe(false);
  });

  test("recordAudioSynthesisChunk reports the last chunk exactly once, in any order", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);
    const chunks = [...twoChunks, { start: 2, end: 3 }];
    await t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks });

    const isLast: boolean[] = [];
    for (const chunkIndex of [2, 0, 1]) {
      const storageId = await storeFile(t, [chunkIndex]);
      const recorded = await t.mutation(audio.recordAudioSynthesisChunk, {
        audioOverviewId,
        chunkIndex,
        result: chunkResult(storageId),
      });
      isLast.push(recorded.isLast);
    }

    expect(isLast).toEqual([false, false, true]);
    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.metadata.progress).toBe(95);
  });

  test("a chunk recorded twice keeps the first result and deletes the second file", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);
    await t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks });
    const first = await storeFile(t, [1]);
    const second = await storeFile(t, [2]);

    await t.mutation(audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex: 0,
      result: chunkResult(first),
    });
    const again = await t.mutation(audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex: 0,
      result: chunkResult(second),
    });

    expect(again.isLast).toBe(false);
    expect(await fileExists(t, first)).toBe(true);
    expect(await fileExists(t, second)).toBe(false);
  });

  test("a chunk recorded after the job failed has its file deleted", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);
    await t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks });
    await t.mutation(audio.markAudioOverviewFailed, {
      audioOverviewId,
      error: "boom",
      metadata: { phase: "failed", errorPhase: "synthesis" },
    });
    const late = await storeFile(t, [1]);

    const recorded = await t.mutation(audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex: 0,
      result: chunkResult(late),
    });

    expect(recorded.isLast).toBe(false);
    expect(await fileExists(t, late)).toBe(false);
  });

  test("completion and failure delete the chunk files and drop the synthesis state", async () => {
    for (const end of ["completed", "failed"] as const) {
      const t = convexTest(schema, modules);
      const audioOverviewId = await runToSynthesis(t);
      await t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks });
      const chunkFile = await storeFile(t, [1]);
      await t.mutation(audio.recordAudioSynthesisChunk, {
        audioOverviewId,
        chunkIndex: 0,
        result: chunkResult(chunkFile),
      });

      if (end === "completed") {
        await t.mutation(audio.saveAudioOverviewResults, {
          audioOverviewId,
          audioUrl: "https://example.com/audio.mp3",
          transcript: "Opening line.\nReply line.",
          metadata: { title: "Generated Title", phase: "completed", progress: 100 },
        });
      } else {
        await t.mutation(audio.markAudioOverviewFailed, {
          audioOverviewId,
          error: "boom",
          metadata: { phase: "failed", errorPhase: "synthesis" },
        });
      }

      const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
      expect(row?.status).toBe(end);
      expect(row?.metadata.synthesis).toBeUndefined();
      expect(await fileExists(t, chunkFile)).toBe(false);
    }
  });
});

const job = internal.studio.audio.job;

async function jobArgs(t: ReturnType<typeof convexTest>, audioOverviewId: Id<"audioOverviews">) {
  const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
  if (!row) throw new Error("row missing");
  return { audioOverviewId, userId: row.userId, notebookId: row.notebookId };
}

async function scheduledCalls(t: ReturnType<typeof convexTest>, functionName: string) {
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return scheduled.filter((call) => call.name.includes(functionName));
}

const scriptOf = (lines: number): AudioSynthesisInput => ({
  ...synthesisInput,
  script: Array.from({ length: lines }, (_, i) => ({
    speaker: i % 2 === 0 ? ("host_a" as const) : ("host_b" as const),
    text: `Line ${i + 1}.`,
  })),
});

describe("synthesis phases", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Generous timeouts: the first action call loads the whole audio job module.
  test("the planner stores the plan and schedules one action per chunk, without TTS", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t, scriptOf(100));

    await t.action(job.synthesizeAudioOverviewPhase, await jobArgs(t, audioOverviewId));

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.metadata.synthesis.chunks).toHaveLength(3);
    const chunkCalls = await scheduledCalls(t, "synthesizeAudioOverviewChunk");
    expect(chunkCalls.map((call) => call.args[0].chunkIndex)).toEqual([0, 1, 2]);
    expect(chunkCalls.every((call) => call.args[0].attempt === 0)).toBe(true);
  }, 30000);

  test("a chunk for a job that is no longer generating does nothing", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);
    await t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks });
    await t.mutation(audio.markAudioOverviewFailed, {
      audioOverviewId,
      error: "boom",
      metadata: { phase: "failed", errorPhase: "synthesis" },
    });

    await t.action(job.synthesizeAudioOverviewChunk, {
      ...(await jobArgs(t, audioOverviewId)),
      chunkIndex: 0,
      attempt: 0,
    });

    expect(await scheduledCalls(t, "synthesizeAudioOverviewChunk")).toHaveLength(0);
  }, 30000);

  test("a failing chunk retries once, then fails the job", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    // No chunk plan stored: the chunk action throws before calling TTS.
    const audioOverviewId = await runToSynthesis(t);
    const args = { ...(await jobArgs(t, audioOverviewId)), chunkIndex: 0 };

    await t.action(job.synthesizeAudioOverviewChunk, { ...args, attempt: 0 });
    const retries = await scheduledCalls(t, "synthesizeAudioOverviewChunk");
    expect(retries.map((call) => call.args[0].attempt)).toEqual([1]);

    await expect(
      t.action(job.synthesizeAudioOverviewChunk, { ...args, attempt: 1 })
    ).rejects.toThrow("No script or plan stored for synthesis chunk 0");
    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("failed");
    expect(row?.metadata).toMatchObject({ errorPhase: "synthesis" });
  }, 30000);

  test("assembly joins chunk MP3s in order, saves the episode and deletes the chunks", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);
    await t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks });
    const first = await storeFile(t, [1, 2, 3]);
    const second = await storeFile(t, [4, 5]);
    await t.mutation(audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex: 1,
      result: chunkResult(second),
    });
    await t.mutation(audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex: 0,
      result: chunkResult(first),
    });

    await t.action(job.assembleAudioOverviewPhase, await jobArgs(t, audioOverviewId));

    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("completed");
    expect(row?.transcript).toBe("Opening line.\nReply line.");
    expect(row?.metadata).toMatchObject({ phase: "completed", dialogueLines: 2 });
    expect(row?.metadata.synthesis).toBeUndefined();
    expect(await fileExists(t, first)).toBe(false);
    expect(await fileExists(t, second)).toBe(false);
    const files = await t.run((ctx) => ctx.db.system.query("_storage").collect());
    expect(files).toHaveLength(1);
    const bytes = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0]._id);
      return blob ? [...new Uint8Array(await blob.arrayBuffer())] : [];
    });
    expect(bytes).toEqual([1, 2, 3, 4, 5]);
  }, 30000);

  test("assembly fails the job when fewer than half the lines were synthesized", async () => {
    const t = convexTest(schema, modules);
    const audioOverviewId = await runToSynthesis(t);
    await t.mutation(audio.initAudioSynthesis, { audioOverviewId, chunks: twoChunks });
    const partial = await storeFile(t, [1]);
    const failed = { synthesizedLines: 0, failedLines: 1, latencyMs: 10 };
    await t.mutation(audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex: 0,
      result: { ...failed, firstError: "voice unavailable" },
    });
    await t.mutation(audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex: 1,
      result: { ...failed, storageId: partial },
    });

    await expect(
      t.action(job.assembleAudioOverviewPhase, await jobArgs(t, audioOverviewId))
    ).rejects.toThrow(
      "Too many synthesis failures: 0/2 lines synthesized (first error: voice unavailable)"
    );
    const row = await t.run((ctx) => ctx.db.get(audioOverviewId));
    expect(row?.status).toBe("failed");
    expect(await fileExists(t, partial)).toBe(false);
  }, 30000);
});
