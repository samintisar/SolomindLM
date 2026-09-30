# Audio Overview TTS Split Design

**Date:** 2026-09-30
**Status:** Approved for implementation planning
**Tracking issue:** [samintisar/SolomindLM#257](https://github.com/samintisar/SolomindLM/issues/257)

## Goal

Make Audio Overview synthesis finish for any script length, and make long episodes finish sooner.

Today `runSynthesizeAudioOverviewPhase` (`convex/studio/audio/audioJobPhases.ts`) does all of this in one Convex action:

1. Synthesizes every script line, 5 lines at a time.
2. Joins the per-line WAVs.
3. Encodes one MP3 and stores it.

Time and memory both grow with the number of lines. On dev:

- 288–350 lines hit the 10-minute action limit when Together TTS was slow.
- 440 lines ran out of the 512 MB memory limit. Peak memory is about 3× the WAV size.

A killed action never reaches its `catch`, so the job sits in `generating` until the stuck-job sweeper fails it, 15 minutes after its last update. PR #215 caps scripts at 350 lines until this is fixed.

## Scope

### Included

- Split synthesis into parallel **chunk actions** and one **assemble action**, following the fan-out-and-count pattern the map phase already uses.
- Each chunk encodes its own MP3. The assemble action joins the chunk MP3 bytes. No action ever holds a whole-episode WAV.
- Retry a chunk that fails, then fail the job. Delete chunk files after assembly or when the job fails.
- Progress updates while chunks finish.

### Not included

- Raising PR #215's `MAX_SYNTHESIZABLE_LINES`. That's a follow-up in #215 after this merges.
- Adopting `@convex-dev/workflow` for audio. It was considered and rejected: no other studio job uses it, and it's a bigger change than the problem needs.
- Changing the voices, the TTS model, the MP3 bitrate or the transcript.
- Recovering chunks the platform kills (out of memory or past the action limit). Chunks are sized so this shouldn't happen, and the existing sweeper still covers it.

## Design

### Flow

```
finalize ──▶ synthesize (planner) ──fan-out──▶ chunk 0 … chunk N-1 ──(last to record)──▶ assemble
```

1. **Planner.** `synthesizeAudioOverviewPhase` keeps its name and entry point, so finalize and the stuck-job sweeper are unchanged. It now:
   - reads the stored script;
   - plans the chunks;
   - writes the chunk plan to `metadata`;
   - schedules every chunk action with `runAfter(0)`;
   - returns.

   It does no TTS itself.
2. **Chunk action** `synthesizeAudioOverviewChunk({ audioOverviewId, chunkIndex, attempt })`:
   - Reads the row and returns early if the row is gone or its status isn't `generating`. That covers the job being deleted or already failed.
   - Synthesizes its lines as today (5 concurrent requests, per-line timeout, a failed line is skipped).
   - Joins its own WAVs and encodes one MP3 with the existing `concatenateWavBuffers` and `encodePcmWavToMp3`.
   - Stores the MP3 and calls `recordAudioSynthesisChunk`.
   - If that mutation reports this was the last chunk, schedules the assemble action.
3. **Assemble action** `assembleAudioOverviewPhase({ audioOverviewId })`:
   - Checks the failed-line total against the existing rule: the job fails when fewer than 50% of lines are synthesized.
   - Reads the chunk MP3s in order, joins them and stores the final MP3.
   - Deletes the chunk files and saves the results as today: `audioUrl`, transcript, title, telemetry with a `tts` stage span.

### Chunk planning

This is a pure function in a new `convex/studio/audio/synthesisChunks.ts`, next to the phase code:

```ts
planSynthesisChunks(lineCount: number): { start: number; end: number }[]
// chunkSize = max(MIN_LINES_PER_CHUNK, ceil(lineCount / MAX_PARALLEL_CHUNKS))
```

The `CONFIG` values:

| Constant | Value | Why |
|---|---|---|
| `MAX_PARALLEL_CHUNKS` | 6 | Keeps at most 6 × 5 = 30 TTS requests in flight to Together. |
| `MIN_LINES_PER_CHUNK` | 40 | Short episodes don't fan out into tiny chunks. |

For example, 100 lines give 3 chunks of up to 40, and 420 lines give 6 chunks of 70. A 70-line chunk takes about 1.5–2 minutes and holds about 25 MB of WAV, well inside both limits.

### Joining the MP3s

Each chunk's MP3 is plain constant-bitrate (CBR) frames from lamejs. lamejs doesn't write an ID3 tag or a Xing/Info header, so the chunk files can be joined byte for byte into a valid MP3, and browsers compute its duration from the bitrate.

Each chunk's encoder adds padding and priming delay, about 50 ms at each join. Joins fall between dialogue lines, which already have gaps, so it isn't audible.

The helper is `concatenateMp3Buffers(buffers: Buffer[]): Buffer`, in `convex/_services/ai/mp3.ts`. It rejects an empty list. A test checks that each chunk starts with an MP3 frame sync and has no `Xing`/`Info` header, which pins the assumption above.

Peak memory in the assemble action is the chunk MP3s plus the joined copy. A 45-minute episode at 64 kbps is about 22 MB, so that's roughly 50 MB.

### State

Chunk state goes in `audioOverviews.metadata`, like `mapResults` does. `metadata` is `v.any()`, so the schema doesn't change.

```ts
metadata.synthesis = {
  chunks: { start: number; end: number }[];          // the plan
  done: Record<number, {
    storageId: Id<"_storage">;
    lines: number;             // lines synthesized
    failedLines: number;
    firstError?: string;
    latencyMs: number;
  }>;
  startedAt: number;           // for the tts stage span
};
```

Three mutations in `convex/studio/jobMutations/audio.ts` manage it:

- **`initAudioSynthesis`.** Writes the plan, `phase: "synthesizing"` and progress 60.
- **`recordAudioSynthesisChunk`.** Stores one chunk's result, sets progress to `60 + 30 × done / total`, and bumps `updatedAt`. It returns `{ isLast }`, which is true only for the call that fills the last missing index. Mutations are serialized, so exactly one chunk schedules assembly.
  - If a retried chunk records an index that is already done, the new file is deleted and `isLast` is false.
  - If the row is gone or no longer `generating`, the file is deleted and `isLast` is false.
- **Cleanup on completion and failure.** `saveAudioOverviewResults` and `markAudioOverviewFailed` already drop `synthesisInput`. They now also drop `synthesis`, and delete every chunk storage ID listed in `synthesis.done`.

### Errors

| Failure | Behaviour |
|---|---|
| One line's TTS call fails | The line is skipped and counted, as today. |
| More than 50% of lines fail across all chunks | Assemble fails the job with today's message, including the first error. |
| A chunk action throws (TTS client, encode, store) on attempt 0 | The chunk schedules itself again with `attempt: 1` after 5 s. |
| A chunk action throws on attempt 1 | `markAudioOverviewFailed` runs with `errorPhase: "synthesis"`, deleting any stored chunks. Other chunks see the row isn't `generating` and stop. |
| Assemble throws | `markAudioOverviewFailed`, as today. |
| The platform kills a chunk | No retry. The job is failed by the stuck-job sweeper 15 minutes after its last update, as today. Chunk sizing makes this unlikely. |
| The job is deleted mid-synthesis | Chunks and assemble return early. Storage for chunks already recorded is orphaned, the same as other studio files on delete today. |

### Script-only evals (#243)

#243 makes the synthesis phase skip TTS when `metadata.skipTts` is set, and it edits the same function. Whichever PR merges second keeps that early return in the planner, before any chunks are planned.

## Testing

- **Unit** (`synthesisChunks.test.ts`):
  - chunk boundaries for 1, 40, 41, 100, 240 and 420 lines;
  - never more than `MAX_PARALLEL_CHUNKS`;
  - covers every line exactly once.
- **Unit** (`mp3.test.ts`):
  - `concatenateMp3Buffers` keeps chunk order and byte length;
  - rejects an empty list;
  - lamejs output starts with frame sync and has no Xing/Info header.
- **`convex-test`** (`audioSynthesis.test.ts`):
  - `initAudioSynthesis` writes the plan;
  - `recordAudioSynthesisChunk` returns `isLast` exactly once, whatever order the chunks finish in;
  - a duplicate record deletes its file and isn't last;
  - a record on a failed row deletes its file;
  - completion and failure remove `synthesis` and delete the chunk files.
- **Live** (dev, TTS on):
  - one default run on this branch alone;
  - one long run on a temporary branch that combines this with #215, with the cap raised to 420 lines. `main` alone writes long scripts of about 230 lines, which don't show the old failure;
  - check the logs for the chunk fan-out, per-chunk latency and assembly;
  - listen to one output across a chunk join.

## Rollout

- No schema or migration change, and no new env var.
- Jobs in flight at deploy time are still in the old single-action synthesis, which keeps running to completion because it's one action invocation. New jobs use the new flow.
- After this merges, #215 can raise `MAX_SYNTHESIZABLE_LINES` and rerun its long evals with TTS on.
