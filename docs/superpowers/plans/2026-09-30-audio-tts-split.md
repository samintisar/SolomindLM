# Audio Overview TTS Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synthesize Audio Overviews of any length within Convex's 10-minute and 512 MB action limits. Do it by splitting TTS into parallel chunk actions plus one assemble action (issue #257, spec `docs/superpowers/specs/2026-09-30-audio-tts-split-design.md`).

**Architecture:**

1. **Planner.** `synthesizeAudioOverviewPhase` becomes a planner. It writes a chunk plan to `audioOverviews.metadata.synthesis` and schedules one `synthesizeAudioOverviewChunk` action per chunk.
2. **Chunk actions.** Each chunk action synthesizes its lines, encodes its own MP3, stores it, and records it with a mutation. The mutation returns `isLast` to exactly one caller.
3. **Assembly.** That caller schedules `assembleAudioOverviewPhase`. It joins the chunk MP3 bytes, stores the episode, and saves the results. The save and failure mutations delete the chunk files.

**Tech Stack:** Convex (actions, mutations, scheduler, file storage), convex-test with vitest, lamejs (`@breezystack/lamejs`) through the existing `convex/_services/ai/mp3.ts`, and Together TTS through `convex/_services/ai/togetherTts.ts`.

---

## Before you start

- Work in this session's worktree on branch `fix/audio-tts-split`, which starts from `origin/main`.
- Read `convex/_generated/ai/guidelines.md` before changing Convex code (CLAUDE.md requires it).
- Edit `.ts` files with the Edit or Write tools. Serena is bound to the main checkout, not this worktree.
- Before every commit, run `bunx @biomejs/biome@2.5.14 format --write <changed files>` to fix CRLF from edits. The junctioned `node_modules` has an older Biome.
- Don't use `taskkill /IM`. Kill processes by PID only.
- The dev deployment (`prestigious-canary-33`) is shared with other sessions, and a deploy there replaces their code.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `convex/studio/audio/synthesisChunks.ts` | Create | Pure chunk planner and its two constants |
| `convex/studio/audio/synthesisChunks.test.ts` | Create | Planner tests |
| `convex/_services/ai/mp3.ts` | Modify | Add `concatenateMp3Buffers` |
| `convex/_services/ai/mp3.test.ts` | Modify | Join tests, and a test pinning "no header block" |
| `convex/studio/jobMutations/audio.ts` | Modify | Synthesis state types and validators, `initAudioSynthesis`, `recordAudioSynthesisChunk`, chunk-file cleanup in `saveAudioOverviewResults` and `markAudioOverviewFailed` |
| `convex/studio/jobMutations/audioSynthesis.test.ts` | Modify | Mutation, planner and assemble tests |
| `convex/studio/audio/audioJobPhases.ts` | Modify | `synthesizeDialogueLines` and `failSynthesisPhase` helpers; planner, chunk and assemble phases |
| `convex/studio/audio/job.ts` | Modify | Register `synthesizeAudioOverviewChunk` and `assembleAudioOverviewPhase` |
| `convex/_generated/api.d.ts` | Regenerate | New module entry |

---

### Task 1: Chunk planner

**Files:**
- Create: `convex/studio/audio/synthesisChunks.ts`
- Test: `convex/studio/audio/synthesisChunks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { MAX_PARALLEL_CHUNKS, planSynthesisChunks } from "./synthesisChunks";

describe("planSynthesisChunks", () => {
  it("keeps short scripts in one chunk", () => {
    expect(planSynthesisChunks(1)).toEqual([{ start: 0, end: 1 }]);
    expect(planSynthesisChunks(40)).toEqual([{ start: 0, end: 40 }]);
  });

  it("uses 40-line chunks until the parallel limit is reached", () => {
    expect(planSynthesisChunks(41)).toEqual([
      { start: 0, end: 40 },
      { start: 40, end: 41 },
    ]);
    expect(planSynthesisChunks(100)).toEqual([
      { start: 0, end: 40 },
      { start: 40, end: 80 },
      { start: 80, end: 100 },
    ]);
    expect(planSynthesisChunks(240)).toHaveLength(6);
  });

  it("grows chunks instead of adding more past the parallel limit", () => {
    expect(planSynthesisChunks(420)).toEqual(
      Array.from({ length: 6 }, (_, i) => ({ start: i * 70, end: (i + 1) * 70 }))
    );
  });

  it("covers every line exactly once, in order, within the parallel limit", () => {
    for (let lineCount = 1; lineCount <= 1000; lineCount += 1) {
      const chunks = planSynthesisChunks(lineCount);
      expect(chunks.length).toBeLessThanOrEqual(MAX_PARALLEL_CHUNKS);
      expect(chunks[0].start).toBe(0);
      expect(chunks.at(-1)?.end).toBe(lineCount);
      for (let i = 1; i < chunks.length; i += 1) {
        expect(chunks[i].start).toBe(chunks[i - 1].end);
      }
    }
  });

  it("plans nothing for an empty script", () => {
    expect(planSynthesisChunks(0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bunx vitest run convex/studio/audio/synthesisChunks.test.ts`
Expected: FAIL, because the module `./synthesisChunks` can't be found.

- [ ] **Step 3: Implement**

```ts
/** Plans how an Audio Overview script is split across parallel synthesis actions. */

/** At most this many chunk actions per job: 6 chunks × 5 concurrent lines = 30 TTS requests. */
export const MAX_PARALLEL_CHUNKS = 6;
/** Short scripts don't fan out into tiny chunks. */
export const MIN_LINES_PER_CHUNK = 40;

/** Script lines `[start, end)` synthesized by one chunk action. */
export type SynthesisChunkRange = { start: number; end: number };

/**
 * Splits `lineCount` script lines into ordered, contiguous chunks. Each chunk runs in its own
 * action, so synthesis time and memory per action stay bounded however long the script is.
 */
export function planSynthesisChunks(lineCount: number): SynthesisChunkRange[] {
  if (lineCount <= 0) return [];
  const chunkSize = Math.max(MIN_LINES_PER_CHUNK, Math.ceil(lineCount / MAX_PARALLEL_CHUNKS));
  const chunks: SynthesisChunkRange[] = [];
  for (let start = 0; start < lineCount; start += chunkSize) {
    chunks.push({ start, end: Math.min(lineCount, start + chunkSize) });
  }
  return chunks;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `bunx vitest run convex/studio/audio/synthesisChunks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
bunx @biomejs/biome@2.5.14 format --write convex/studio/audio/synthesisChunks.ts convex/studio/audio/synthesisChunks.test.ts
git add convex/studio/audio/synthesisChunks.ts convex/studio/audio/synthesisChunks.test.ts
git commit -m "feat(studio): plan audio synthesis chunks" -m "Refs #257"
```

---

### Task 2: Join chunk MP3s

**Files:**
- Modify: `convex/_services/ai/mp3.ts` (append after `encodePcmWavToMp3`)
- Test: `convex/_services/ai/mp3.test.ts`

- [ ] **Step 1: Write the failing tests**

Change the import at the top of `mp3.test.ts` to:

```ts
import { concatenateMp3Buffers, encodePcmWavToMp3 } from "./mp3";
```

Append this block after the existing `describe("encodePcmWavToMp3", ...)`:

```ts
describe("concatenateMp3Buffers", () => {
  it("joins chunk MP3s in order", () => {
    const joined = concatenateMp3Buffers([Buffer.from([1, 2, 3]), Buffer.from([4, 5])]);

    expect([...joined]).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects an empty list", () => {
    expect(() => concatenateMp3Buffers([])).toThrow("No MP3 audio to join");
  });

  // Byte-level joining is only valid while the encoder writes bare frames with no header block.
  it("joins encoder output that has no ID3 tag or Xing/Info header", () => {
    const chunk = encodePcmWavToMp3(makeSilentWav(1));

    expect(chunk[0] === 0xff && (chunk[1] & 0xe0) === 0xe0).toBe(true);
    expect(chunk.includes("Xing")).toBe(false);
    expect(chunk.includes("Info")).toBe(false);
    const joined = concatenateMp3Buffers([chunk, chunk]);
    expect(joined.length).toBe(chunk.length * 2);
    expect(joined[chunk.length] === 0xff && (joined[chunk.length + 1] & 0xe0) === 0xe0).toBe(
      true
    );
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `bunx vitest run convex/_services/ai/mp3.test.ts`
Expected: FAIL, because `concatenateMp3Buffers` is not a function.

- [ ] **Step 3: Implement** (append to `mp3.ts`)

```ts
/**
 * Joins MP3s encoded separately by {@link encodePcmWavToMp3}, one per synthesis chunk. lamejs
 * writes bare constant-bitrate frames with no ID3 tag or Xing/Info header, so the files join byte
 * for byte into one valid stream whose duration players compute from the bitrate. Each join adds
 * only the encoder's padding, tens of milliseconds between dialogue lines.
 */
export function concatenateMp3Buffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error("No MP3 audio to join");
  }
  return Buffer.concat(buffers);
}
```

- [ ] **Step 4: Run them to confirm they pass**

Run: `bunx vitest run convex/_services/ai/mp3.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
bunx @biomejs/biome@2.5.14 format --write convex/_services/ai/mp3.ts convex/_services/ai/mp3.test.ts
git add convex/_services/ai/mp3.ts convex/_services/ai/mp3.test.ts
git commit -m "feat(audio): join separately encoded MP3 chunks" -m "Refs #257"
```

---

### Task 3: Synthesis state mutations

**Files:**
- Modify: `convex/studio/jobMutations/audio.ts`
- Test: `convex/studio/jobMutations/audioSynthesis.test.ts`

- [ ] **Step 1: Write the failing tests**

In `audioSynthesis.test.ts`:

1. Change the vitest import to `import { afterEach, describe, expect, test, vi } from "vitest";`.
2. Add these imports:

   ```ts
   import type { Id } from "../../_generated/dataModel";
   import type { AudioSynthesisInput } from "./audio";
   ```

3. Change `runToSynthesis` so it takes the synthesis input:
   - Change its signature to `async function runToSynthesis(t: ReturnType<typeof convexTest>, input: AudioSynthesisInput = synthesisInput)`.
   - In its last mutation call, pass `synthesisInput: input`.

Then append:

```ts
const audio = internal.studio.jobMutations.audio;
const twoChunks = [
  { start: 0, end: 1 },
  { start: 1, end: 2 },
];

async function storeFile(t: ReturnType<typeof convexTest>, bytes: number[]) {
  return t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" })));
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
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `bunx vitest run convex/studio/jobMutations/audioSynthesis.test.ts`
Expected: the new tests FAIL (`audio.initAudioSynthesis` is undefined, so convex-test throws). The existing tests PASS.

- [ ] **Step 3: Implement**

In `convex/studio/jobMutations/audio.ts`:

**(a) Imports.** Add below the existing imports:

```ts
import type { MutationCtx } from "../../_generated/server";
```

**(b) Types, validators and cleanup helper.** Add directly after `export type AudioSynthesisInput = Infer<typeof synthesisInputValidator>;`:

```ts
const synthesisChunkRangeValidator = v.object({ start: v.number(), end: v.number() });

const synthesisChunkResultValidator = v.object({
  /** Absent when every line in the chunk failed to synthesize. */
  storageId: v.optional(v.id("_storage")),
  synthesizedLines: v.number(),
  failedLines: v.number(),
  firstError: v.optional(v.string()),
  latencyMs: v.number(),
});

export type AudioSynthesisChunkResult = Infer<typeof synthesisChunkResultValidator>;

/** `metadata.synthesis`: the chunk plan and each finished chunk's result, keyed by chunk index. */
export type AudioSynthesisState = {
  chunks: Infer<typeof synthesisChunkRangeValidator>[];
  done: Record<string, AudioSynthesisChunkResult>;
  startedAt: number;
};

/** Deletes the chunk MP3s a synthesis stored. A finished or failed job no longer needs them. */
async function deleteSynthesisChunkFiles(ctx: MutationCtx, metadata: unknown): Promise<void> {
  const synthesis = (metadata as { synthesis?: AudioSynthesisState } | undefined)?.synthesis;
  for (const chunk of Object.values(synthesis?.done ?? {})) {
    if (chunk.storageId) await ctx.storage.delete(chunk.storageId);
  }
}
```

**(c) Completion cleanup.** In `saveAudioOverviewResults`, replace

```ts
    // The script handed to synthesis is now in `transcript`.
    const { synthesisInput: _synthesisInput, ...existingMetadata } = audioOverview.metadata || {};
```

with

```ts
    // The script handed to synthesis is now in `transcript`, and the chunk MP3s are joined.
    const {
      synthesisInput: _synthesisInput,
      synthesis: _synthesis,
      ...existingMetadata
    } = audioOverview.metadata || {};
    await deleteSynthesisChunkFiles(ctx, audioOverview.metadata);
```

**(d) Failure cleanup.** In `markAudioOverviewFailed`, replace

```ts
    // Keep the user's settings; drop intermediate map output and the synthesis script, which a
    // failed job no longer needs.
    const {
      mapResults: _mapResults,
      synthesisInput: _synthesisInput,
      ...existingMetadata
    } = audioOverview.metadata || {};
```

with

```ts
    // Keep the user's settings; drop intermediate map output, the synthesis script and the chunk
    // MP3s, which a failed job no longer needs.
    const {
      mapResults: _mapResults,
      synthesisInput: _synthesisInput,
      synthesis: _synthesis,
      ...existingMetadata
    } = audioOverview.metadata || {};
    await deleteSynthesisChunkFiles(ctx, audioOverview.metadata);
```

**(e) New mutations.** Add after `storeAudioOverviewScript`:

```ts
/**
 * Records the synthesis chunk plan (see planSynthesisChunks) before the chunk actions start.
 * Returns false if the row was deleted, is no longer generating, or was already planned, so a
 * repeated planner run can't orphan chunks already stored.
 */
export const initAudioSynthesis = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    chunks: v.array(synthesisChunkRangeValidator),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (
      !audioOverview ||
      audioOverview.status !== "generating" ||
      audioOverview.metadata?.synthesis
    ) {
      return false;
    }

    const synthesis: AudioSynthesisState = { chunks: args.chunks, done: {}, startedAt: Date.now() };
    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        phase: "synthesizing",
        progress: 70,
        currentStep: "Synthesizing audio...",
        synthesis,
      },
    });
    return true;
  },
});

/**
 * Stores one synthesized chunk. Returns `isLast: true` only to the call that completes the plan,
 * so exactly one chunk schedules assembly. A result the job can't use (row deleted or no longer
 * generating, or a chunk recorded twice after a retry) has its file deleted.
 */
export const recordAudioSynthesisChunk = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    chunkIndex: v.number(),
    result: synthesisChunkResultValidator,
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    const synthesis = audioOverview?.metadata?.synthesis as AudioSynthesisState | undefined;
    if (
      !audioOverview ||
      audioOverview.status !== "generating" ||
      !synthesis ||
      synthesis.done[args.chunkIndex] !== undefined
    ) {
      if (args.result.storageId) await ctx.storage.delete(args.result.storageId);
      return { isLast: false };
    }

    const done = { ...synthesis.done, [args.chunkIndex]: args.result };
    const doneCount = Object.keys(done).length;
    const total = synthesis.chunks.length;
    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        progress: 70 + Math.floor((doneCount / total) * 25),
        synthesis: { ...synthesis, done },
      },
    });
    return { isLast: doneCount === total };
  },
});
```

- [ ] **Step 4: Run them to confirm they pass**

Run: `bunx vitest run convex/studio/jobMutations/audioSynthesis.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
bunx @biomejs/biome@2.5.14 format --write convex/studio/jobMutations/audio.ts convex/studio/jobMutations/audioSynthesis.test.ts
git add convex/studio/jobMutations/audio.ts convex/studio/jobMutations/audioSynthesis.test.ts
git commit -m "feat(studio): track audio synthesis chunks and clean up their files" -m "Refs #257"
```

---

### Task 4: Planner, chunk and assemble phases

**Files:**
- Modify: `convex/studio/audio/audioJobPhases.ts` (imports, `CONFIG`, arg types, the whole PHASE 4 section)
- Modify: `convex/studio/audio/job.ts`
- Test: `convex/studio/jobMutations/audioSynthesis.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `audioSynthesis.test.ts`)

```ts
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
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `bunx vitest run convex/studio/jobMutations/audioSynthesis.test.ts`
Expected: the five new tests FAIL. The planner test fails because it finds no `metadata.synthesis` (the old phase calls TTS, which fails with no key), and the others fail because `job.synthesizeAudioOverviewChunk` and `job.assembleAudioOverviewPhase` are undefined.

- [ ] **Step 3: Implement the phases** in `convex/studio/audio/audioJobPhases.ts`

**(a) Imports.**

1. Replace `import { encodePcmWavToMp3 } from "../../_services/ai/mp3.js";` with:

   ```ts
   import { concatenateMp3Buffers, encodePcmWavToMp3 } from "../../_services/ai/mp3.js";
   ```

2. Replace `import type { AudioSynthesisInput } from "../jobMutations/audio";` with:

   ```ts
   import type { AudioSynthesisInput, AudioSynthesisState } from "../jobMutations/audio";
   ```

3. Add:

   ```ts
   import { planSynthesisChunks } from "./synthesisChunks";
   ```

**(b) `CONFIG`.** Replace the `TTS_TIMEOUT_MS: 300_000, // 5 minutes` line with:

```ts
  TTS_TIMEOUT_MS: 300_000, // 5 minutes
  /** Lines each synthesis chunk sends to TTS at once. */
  TTS_BATCH_SIZE: 5,
  /** Delay before a failed synthesis chunk's one retry. */
  SYNTHESIS_CHUNK_RETRY_DELAY_MS: 5_000,
```

**(c) Arg type.** Add after `export type SynthesizeAudioOverviewPhaseArgs = FinalizeAudioOverviewPhaseArgs;`:

```ts
export type SynthesizeAudioOverviewChunkPhaseArgs = SynthesizeAudioOverviewPhaseArgs & {
  chunkIndex: number;
  /** 0 on the first run, 1 on the retry. */
  attempt: number;
};
```

**(d) Replace the PHASE 4 section.** Replace everything from the `// PHASE 4: Synthesize (TTS + Upload + Save)` banner comment to the end of the file with:

```ts
// ============================================================
// PHASE 4: Synthesize — plan chunks and fan out
// ============================================================

/** Marks the job failed in the synthesis phase. The mutation also deletes stored chunk MP3s. */
async function failSynthesisPhase(
  ctx: ActionCtx,
  logger: ReturnType<typeof createJobLogger>,
  audioOverviewId: Id<"audioOverviews">,
  error: unknown
): Promise<void> {
  const errorMeta = createErrorMetadata(error, "synthesis");

  logger.jobError(error, {
    phase: "synthesis",
    errorType: errorMeta.type,
    retryable: errorMeta.retryable,
  });

  await ctx.runMutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
    audioOverviewId,
    error: errorMeta.message,
    metadata: {
      phase: "failed",
      errorPhase: "synthesis",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
      failedAt: Date.now(),
    },
  });
}

/**
 * Plans the synthesis chunks and schedules one action per chunk. Each chunk runs in its own
 * action, so TTS time and memory per action stay bounded however long the script is.
 */
export async function runSynthesizeAudioOverviewPhase(
  ctx: ActionCtx,
  args: SynthesizeAudioOverviewPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId } = args;
  const logger = createJobLogger({ jobType: "audio", jobId: audioOverviewId, notebookId, userId });

  try {
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview) {
      console.log("[AudioJob] Audio overview deleted before synthesis");
      return;
    }

    const synthesisInput = audioOverview.metadata?.synthesisInput as
      | AudioSynthesisInput
      | undefined;
    if (!synthesisInput || synthesisInput.script.length === 0) {
      throw new Error("No dialogue script stored for synthesis");
    }

    const chunks = planSynthesisChunks(synthesisInput.script.length);
    const planned = await ctx.runMutation(
      internal.studio.jobMutations.audio.initAudioSynthesis,
      { audioOverviewId, chunks }
    );
    if (!planned) {
      console.log("[AudioJob] Synthesis already planned, or the job is no longer generating");
      return;
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.synthesizeAudioOverviewChunk, {
        audioOverviewId,
        userId,
        notebookId,
        chunkIndex,
        attempt: 0,
      });
    }
    logger.info("Scheduled synthesis chunks", {
      chunks: chunks.length,
      dialogueLines: synthesisInput.script.length,
    });
  } catch (error) {
    await failSynthesisPhase(ctx, logger, audioOverviewId, error);
    throw error;
  }
}

/**
 * Synthesizes dialogue lines in order, CONFIG.TTS_BATCH_SIZE at a time. A line that fails is
 * skipped and counted. `lineOffset` is the first line's index in the script, for logs.
 */
async function synthesizeDialogueLines(
  lines: DialogueLine[],
  lineOffset: number
): Promise<{ buffers: Buffer[]; failedLines: number; firstError?: string }> {
  const ttsClient = createTogetherTtsClient();
  const buffers: Buffer[] = [];
  let failedLines = 0;
  let firstError: string | undefined;

  for (let i = 0; i < lines.length; i += CONFIG.TTS_BATCH_SIZE) {
    const batch = await Promise.all(
      lines.slice(i, i + CONFIG.TTS_BATCH_SIZE).map(async (line, batchIdx) => {
        try {
          return await synthesizeSpeechToBuffer(ttsClient, {
            model: env.AUDIO_TTS_MODEL,
            input: line.text,
            voice: line.speaker === "host_a" ? VOICES.host_a : VOICES.host_b,
            timeoutMs: CONFIG.TTS_TIMEOUT_MS,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          firstError ??= message;
          failedLines += 1;
          console.log(`[AudioJob] Failed line ${lineOffset + i + batchIdx + 1}: ${message}`);
          return null;
        }
      })
    );
    for (const buffer of batch) {
      if (buffer) buffers.push(buffer);
    }
  }

  return { buffers, failedLines, firstError };
}

/**
 * Synthesizes one chunk of the script, stores it as an MP3 and records it. The chunk that
 * completes the plan schedules assembly. A failed chunk retries once, then fails the job.
 */
export async function runSynthesizeAudioOverviewChunkPhase(
  ctx: ActionCtx,
  args: SynthesizeAudioOverviewChunkPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId, chunkIndex, attempt } = args;
  const logger = createJobLogger({ jobType: "audio", jobId: audioOverviewId, notebookId, userId });

  try {
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview || audioOverview.status !== "generating") {
      console.log(
        `[AudioJob] Skipping synthesis chunk ${chunkIndex}: job deleted or no longer generating`
      );
      return;
    }

    const synthesisInput = audioOverview.metadata?.synthesisInput as
      | AudioSynthesisInput
      | undefined;
    const synthesis = audioOverview.metadata?.synthesis as AudioSynthesisState | undefined;
    const range = synthesis?.chunks[chunkIndex];
    if (!synthesisInput || !synthesis || !range) {
      throw new Error(`No script or plan stored for synthesis chunk ${chunkIndex}`);
    }

    const startTime = Date.now();
    const { buffers, failedLines, firstError } = await synthesizeDialogueLines(
      synthesisInput.script.slice(range.start, range.end),
      range.start
    );
    let storageId: Id<"_storage"> | undefined;
    if (buffers.length > 0) {
      const mp3 = encodePcmWavToMp3(concatenateWavBuffers(buffers));
      storageId = await ctx.storage.store(new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }));
    }
    const latencyMs = Date.now() - startTime;
    console.log(
      `[AudioJob] Synthesis chunk ${chunkIndex + 1}/${synthesis.chunks.length} (lines ${range.start + 1}-${range.end}): ${buffers.length} synthesized, ${failedLines} failed, ${latencyMs} ms`
    );

    const { isLast } = await ctx.runMutation(
      internal.studio.jobMutations.audio.recordAudioSynthesisChunk,
      {
        audioOverviewId,
        chunkIndex,
        result: {
          ...(storageId ? { storageId } : {}),
          synthesizedLines: buffers.length,
          failedLines,
          ...(firstError ? { firstError } : {}),
          latencyMs,
        },
      }
    );
    if (isLast) {
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.assembleAudioOverviewPhase, {
        audioOverviewId,
        userId,
        notebookId,
      });
    }
  } catch (error) {
    if (attempt === 0) {
      console.log(
        `[AudioJob] Synthesis chunk ${chunkIndex} failed, retrying: ${error instanceof Error ? error.message : String(error)}`
      );
      await ctx.scheduler.runAfter(
        CONFIG.SYNTHESIS_CHUNK_RETRY_DELAY_MS,
        internal.studio.audio.job.synthesizeAudioOverviewChunk,
        { ...args, attempt: 1 }
      );
      return;
    }
    await failSynthesisPhase(ctx, logger, audioOverviewId, error);
    throw error;
  }
}

// ============================================================
// PHASE 5: Assemble (join chunk MP3s + Upload + Save)
// ============================================================

export async function runAssembleAudioOverviewPhase(
  ctx: ActionCtx,
  args: SynthesizeAudioOverviewPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId } = args;
  const logger = createJobLogger({ jobType: "audio", jobId: audioOverviewId, notebookId, userId });

  try {
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview || audioOverview.status !== "generating") {
      console.log("[AudioJob] Skipping assembly: job deleted or no longer generating");
      return;
    }

    const synthesisInput = audioOverview.metadata?.synthesisInput as
      | AudioSynthesisInput
      | undefined;
    const synthesis = audioOverview.metadata?.synthesis as AudioSynthesisState | undefined;
    if (!synthesisInput || !synthesis) {
      throw new Error("No script or synthesis results stored for assembly");
    }
    const {
      script: fullDialogueScript,
      title,
      mapSuccessCount,
      mapFailedCount,
      telemetry,
    } = synthesisInput;

    const results = synthesis.chunks.map((_, chunkIndex) => {
      const result = synthesis.done[chunkIndex];
      if (!result) throw new Error(`Synthesis chunk ${chunkIndex} has no result`);
      return result;
    });
    const successCount = results.reduce((sum, result) => sum + result.synthesizedLines, 0);
    if (successCount < fullDialogueScript.length * 0.5) {
      const firstSynthesisError = results.find((result) => result.firstError)?.firstError;
      throw new Error(
        `Too many synthesis failures: ${successCount}/${fullDialogueScript.length} lines synthesized (first error: ${firstSynthesisError ?? "unknown"})`
      );
    }

    const chunkMp3s: Buffer[] = [];
    for (const result of results) {
      if (!result.storageId) continue;
      const blob = await ctx.storage.get(result.storageId);
      if (!blob) throw new Error(`Synthesis chunk audio ${result.storageId} is missing`);
      chunkMp3s.push(Buffer.from(await blob.arrayBuffer()));
    }
    const audioBuffer = concatenateMp3Buffers(chunkMp3s);
    console.log(
      `[AudioJob] Audio synthesis complete: ${successCount} lines in ${results.length} chunks, ${audioBuffer.length} MP3 bytes`
    );

    // Update status for uploading
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: {
        phase: "uploading",
        progress: 95,
        currentStep: "Uploading audio...",
      },
    });

    // Upload to Convex storage
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);

    // Get the standard Convex storage URL first
    const standardUrl = await ctx.storage.getUrl(storageId);

    if (!standardUrl) {
      throw new Error("Failed to get Convex storage URL for audio");
    }

    // For now, use the standard URL while we debug the custom endpoint
    // TODO: Switch to custom /audio/ endpoint once verified working
    const audioUrl = standardUrl;

    console.log(`[AudioJob] Audio uploaded:`, {
      storageId,
      standardUrl,
      customUrl: `${process.env.CONVEX_DEPLOYMENT}/audio/${storageId}`,
    });

    // Build transcript
    const transcript = fullDialogueScript.map((l) => l.text).join("\n");

    // Save results. This also deletes the chunk MP3s.
    await ctx.runMutation(internal.studio.jobMutations.audio.saveAudioOverviewResults, {
      audioOverviewId,
      audioUrl,
      transcript,
      metadata: withStudioTelemetryMetadata(
        {
          title,
          phase: "completed",
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount,
          mapFailedCount,
          dialogueLines: successCount,
        },
        {
          ...telemetry,
          stageSpans: [
            ...(telemetry.stageSpans ?? []),
            { stage: "tts", latencyMs: Date.now() - synthesis.startedAt },
          ],
        }
      ),
    });

    logger.jobComplete({
      title,
      audioUrl,
      transcriptLength: transcript.length,
      mapSuccess: mapSuccessCount,
      mapFailed: mapFailedCount,
    });
  } catch (error) {
    await failSynthesisPhase(ctx, logger, audioOverviewId, error);
    throw error;
  }
}
```

**(e) Registrations** in `convex/studio/audio/job.ts`.

1. Add `runAssembleAudioOverviewPhase` and `runSynthesizeAudioOverviewChunkPhase` to the import from `./audioJobPhases`, in alphabetical order.
2. Append:

```ts
export const synthesizeAudioOverviewChunk = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runSynthesizeAudioOverviewChunkPhase(ctx, args);
  },
});

export const assembleAudioOverviewPhase = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    "use node";
    await runAssembleAudioOverviewPhase(ctx, args);
  },
});
```

- [ ] **Step 4: Run them to confirm they pass**

Run: `bunx vitest run convex/studio/jobMutations/audioSynthesis.test.ts convex/studio/audio convex/_services/ai/mp3.test.ts`
Expected: PASS for every test.

If `ctx.storage.getUrl` returns `null` under convex-test, the assembly test fails with "Failed to get Convex storage URL". In that case, check convex-test's storage support before changing the test. Don't stub production code.

- [ ] **Step 5: Commit**

```bash
bunx @biomejs/biome@2.5.14 format --write convex/studio/audio/audioJobPhases.ts convex/studio/audio/job.ts convex/studio/jobMutations/audioSynthesis.test.ts
git add convex/studio/audio/audioJobPhases.ts convex/studio/audio/job.ts convex/studio/jobMutations/audioSynthesis.test.ts
git commit -m "fix(studio): synthesize audio overviews in parallel chunk actions" -m "Fixes #257"
```

---

### Task 5: Regenerate types and verify

- [ ] **Step 1: Regenerate the Convex API types**

Run: `bunx convex codegen`
Expected: `convex/_generated/api.d.ts` gains `studio/audio/synthesisChunks`. It may also gain other modules missing on `main`, which is fine. If codegen needs a deployment and fails, skip this step: Task 6's `convex dev --once` regenerates the file.

- [ ] **Step 2: Typecheck, lint and test**

Run these one at a time, not in parallel:

```bash
bun run typecheck:convex
bun run typecheck:web
bun run lint
bun run test:convex
```

Expected: every command exits 0, and `test:convex` reports every test passed.

- [ ] **Step 3: Commit the generated types if they changed**

```bash
git add convex/_generated/api.d.ts
git commit -m "chore(convex): regenerate API types" -m "Refs #257"
```

---

### Task 6: Live check on dev (default length, TTS on)

The dev deployment is shared. Say in chat before deploying that dev will run this branch.

- [ ] **Step 1: Deploy this branch to dev**

Run: `bunx convex dev --once`
Expected: `Convex functions ready!`

- [ ] **Step 2: Run the default audio case with TTS**

Run: `bun run eval:rag --case studio-audio-script-default`
Expected:
- The case completes with an audio URL.
- The Convex logs show `Scheduled synthesis chunks`, one `Synthesis chunk i/N` line per chunk, and `Audio synthesis complete: … in N chunks`.
- There are no `Too many synthesis failures` errors.

A ~200-line default script should give 5 chunks of 40.

- [ ] **Step 3: Listen across a chunk join**

Download the MP3 from the eval's audio URL. Play it past the first join. For a 40-line chunk, that's line 40 to 41, roughly 4–6 minutes in. Check that there's no click, skip or duplicated audio, and that the player shows the full duration and can seek.

---

### Task 7: Live check for long episodes (temporary branch with #215)

`main` writes long scripts of only about 230 lines. PR #215 writes up to 350, and more once its cap is raised. On a branch without #243, the script-only cases still run TTS, which this check needs.

- [ ] **Step 1: Build the temporary branch**

```bash
git switch -c tmp/tts-split-with-215
git merge --no-edit origin/feat/audio-script-quality
```

Resolve `convex/_generated/api.d.ts` conflicts, if any, by regenerating the file.

- [ ] **Step 2: Raise #215's cap to 420 lines on this branch only**

In `convex/_agents/audio_overview/scriptContinuation.ts`, set `const MAX_SYNTHESIZABLE_LINES = 420;`. Commit on the temporary branch with the message `tmp: raise cap for live TTS check`.

- [ ] **Step 3: Deploy and run the long case twice**

```bash
bunx convex dev --once
bun run eval:rag --case studio-audio-script-only-long
bun run eval:rag --case studio-audio-script-only-long
```

Expected:
- Both runs complete with audio, for scripts of 350–420 lines.
- The logs show 6 chunks, each finishing in about 3 minutes or less.
- There's no `out of memory` and no action timeout.

Record the line counts, chunk latencies and total TTS time for the PR description.

- [ ] **Step 4: Go back to the feature branch**

```bash
git switch fix/audio-tts-split
```

Keep the temporary branch local. Don't push it. Dev keeps running the temporary build until someone redeploys, so say so in chat.

---

### Task 8: Open the PR

- [ ] **Step 1: Check for duplicates, then push**

```bash
gh pr list --state open --search "tts OR synthesis"
git push -u origin fix/audio-tts-split
```

- [ ] **Step 2: Open the PR**

1. Title: `fix(studio): synthesize audio overviews in parallel chunk actions`.
2. Base the body on `.github/pull_request_template.md`, with:
   - `Fixes #257`;
   - the design summary;
   - the live results from Tasks 6 and 7;
   - a note that #243 edits the same function, so whichever merges second keeps its `skipTts` early return in the planner;
   - a note that #215 can raise `MAX_SYNTHESIZABLE_LINES` after this merges.
3. End the body with the attribution line.

- [ ] **Step 3: Bind the PR and read its CI**

Bind the PR with the ccd_pr tools, and read its CI status once.
