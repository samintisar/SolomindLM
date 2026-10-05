# Studio Audio "Reader" with real transcript sync (PR 4 of #264, fixes #361) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fix #361, where the transcript never follows the audio, by saving real per-line timings at generation time. Then give the audio overview the "Reader" layout the user chose:
- the transcript reads like live lyrics;
- a floating three-row player card sits below it, with a waveform scrubber, podcast-style ±10 skip buttons and a rolling speed pill.

**Architecture:**
- **Backend** (`convex/`):
  - Each synthesis chunk already makes one WAV per script line. It now records each successful line's duration, from the PCM length, and the decoded length of the chunk's MP3, from its frame headers.
  - The assemble phase turns those into `metadata.lines: { speaker, text, startMs, endMs }[]` with a pure, unit-tested builder. Failed lines are left out.
  - There is no schema change: `metadata` is `v.any()`, and the new chunk-result fields are optional, so jobs already in flight still finish.
- **Frontend** (`apps/web/src/features/audio/`):
  - A pure `transcriptLines.ts` reads `metadata.lines`, checks it, and falls back to timings estimated from character counts for older overviews or malformed data. In the fallback the player shows an "Approximate sync" note.
  - New pieces: `TranscriptReader`, `WaveformScrubber`, `SkipButton`, `PlayButton` and `SpeedPill`.
  - `AudioPlayer` is rewritten around them. `MiniAudioPlayer` reuses the controls.

**Tech Stack:**
- **Convex:** Node actions. `"use node"` files under `convex/_services/ai` and `convex/studio/audio`.
- **Testing:** Vitest plus `convex-test`.
- **Web:** React 19, Tailwind v4, `tw-animate-css` and shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md` §4, plus "Error handling → Audio" and "Testing". **Mockup:** `.superpowers/brainstorm/*/content/audio-v5.html`, option B "Reader".

**Working directory:** worktree `.worktrees/studio`, branch `feature/studio-audio` (from `origin/main`). Commands:
- **From the root:**
  - `bun run typecheck:web`, `bun run typecheck:convex`
  - `bun run test:convex -- <path>` (vitest for `convex/`)
  - `bun run lint`
- **From `apps/web`:** `bun run test <path>`, `npx eslint <path>`.

**Rules:**
- **No deploys:** never run `npx convex deploy`, `npx convex dev` or `bun x convex dev`. Convex code reaches the dev deployment only after merge, or when the user asks.
- **No credits:** never generate an audio overview (it spends credits).
- **Design lint:** `src/features/audio/**/*.tsx` is already in `MIGRATED`, so every touched `.tsx` there must have 0 design-lint findings. The rules (see `.agents/skills/shadcn/SKILL.md`):
  - primitives get layout-only classes;
  - no palette colours;
  - no arbitrary values (`[...]`);
  - no `dark:`;
  - no thick or loud borders, and no border on a raw `<button>`;
  - `style` may only set CSS custom properties.
- **Reduced motion (PR 1 policy):** `tw-animate-css` enter and exit motion becomes a fade on its own. Any other movement, such as a transform transition, smooth scrolling or the skip-button twist, needs an explicit `motion-reduce:` guard.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `convex/_services/ai/mp3.ts` (+ `mp3.test.ts`) | Modify | `getMp3DurationMs(buffer)`: decoded length from MPEG audio frame headers |
| `convex/studio/audio/transcriptLines.ts` (+ `.test.ts`) | Create | `buildTranscriptLines(script, chunkResults)`: pure offsets builder |
| `convex/studio/jobMutations/audio.ts` | Modify | Chunk result validator gains optional `lineTimings` and `mp3DurationMs` |
| `convex/studio/audio/audioJobPhases.ts` | Modify | Chunk phase records timings; assemble phase saves `metadata.lines` |
| `convex/studio/jobMutations/audio.test.ts` (create or extend) | Test | `saveAudioOverviewResults` keeps `metadata.lines` and drops the synthesis scratch |
| `apps/web/src/features/audio/transcript/transcriptLines.ts` (+ test) | Create | `resolveReaderLines`, `estimateLines`, `activeLineIndex` |
| `apps/web/src/features/audio/hooks/useAudioPlayer.ts` | Modify | Rates become 1, 1.25, 1.5 and 2 |
| `apps/web/src/features/audio/components/controls/*.tsx` (+ tests) | Create | `SkipButton`, `PlayButton`, `SpeedPill`, `WaveformScrubber` |
| `apps/web/src/features/audio/components/TranscriptReader.tsx` (+ test) | Create | Lyrics-style transcript: follow, seek on click, "Follow along" |
| `apps/web/src/features/audio/components/AudioPlayer.tsx` (+ test) | Rewrite | Reader layout and floating three-row card, keyboard shortcuts |
| `apps/web/src/features/audio/components/MiniAudioPlayer.tsx` | Modify | Shared controls |
| `apps/web/src/features/studio/components/ActiveNoteView.tsx` | Modify | Pass `metadata` to `AudioPlayer` |
| `apps/web/src/index.css` | Modify | `@utility audio-bar` (bar height) and `@utility reader-fade` (mask) |

---

### Task 1: Backend: save per-line timings (#361)

**Files:** `mp3.ts` and its test, a new `transcriptLines.ts` and its test, `jobMutations/audio.ts` and its test, and `audioJobPhases.ts`.

- [ ] **Step 1: Write the failing test for `getMp3DurationMs`.** In `convex/_services/ai/mp3.test.ts`, reuse `makeSilentWav`:

```ts
describe("getMp3DurationMs", () => {
  it("measures the decoded length of an encoded MP3", () => {
    const ms = getMp3DurationMs(encodePcmWavToMp3(makeSilentWav(2)));
    // LAME adds encoder delay and end padding (a few frames at most).
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThan(2200);
  });

  it("adds up across joined MP3s", () => {
    const a = encodePcmWavToMp3(makeSilentWav(1));
    const b = encodePcmWavToMp3(makeSilentWav(1.5));
    expect(getMp3DurationMs(concatenateMp3Buffers([a, b]))).toBeCloseTo(
      getMp3DurationMs(a) + getMp3DurationMs(b),
      5
    );
  });

  it("returns 0 for bytes with no MPEG frames", () => {
    expect(getMp3DurationMs(Buffer.from("not audio at all"))).toBe(0);
  });
});
```

Run: `bun run test:convex -- convex/_services/ai/mp3.test.ts`. Expected: FAIL, because `getMp3DurationMs` doesn't exist yet.

- [ ] **Step 2: Implement `getMp3DurationMs`** in `mp3.ts`:

```ts
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
/** Sample rates by version bits: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5 (1 is reserved). */
const SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/**
 * Decoded length of an MP3 stream in milliseconds, counted from its Layer III frame headers.
 * This is what a player's clock reaches at the end of the file, encoder delay and padding
 * included, so it is the right offset for whatever audio is joined after it.
 */
export function getMp3DurationMs(buffer: Buffer): number {
  let offset = 0;
  let samples = 0;
  let sampleRate = 0;
  while (offset + 4 <= buffer.length) {
    const b1 = buffer[offset + 1];
    const b2 = buffer[offset + 2];
    if (buffer[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const version = (b1 >> 3) & 0x3;
    const layer = (b1 >> 1) & 0x3;
    const bitrateIndex = b2 >> 4;
    const rateIndex = (b2 >> 2) & 0x3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset += 1;
      continue;
    }
    const isMpeg1 = version === 3;
    const kbps = (isMpeg1 ? MPEG1_L3_KBPS : MPEG2_L3_KBPS)[bitrateIndex];
    const rate = SAMPLE_RATES[version][rateIndex];
    const samplesPerFrame = isMpeg1 ? 1152 : 576;
    const padding = (b2 >> 1) & 0x1;
    const frameLength = Math.floor(((samplesPerFrame / 8) * kbps * 1000) / rate) + padding;
    if (frameLength <= 4) {
      offset += 1;
      continue;
    }
    samples += samplesPerFrame;
    sampleRate = rate;
    offset += frameLength;
  }
  return sampleRate > 0 ? (samples / sampleRate) * 1000 : 0;
}
```

Run the test again. Expected: PASS (3).

- [ ] **Step 3: Write the failing test for the builder.** Create `convex/studio/audio/transcriptLines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTranscriptLines } from "./transcriptLines";

const script = [
  { speaker: "host_a" as const, text: "Hello" },
  { speaker: "host_b" as const, text: "Hi there" },
  { speaker: "host_a" as const, text: "This line failed" },
  { speaker: "host_b" as const, text: "Second chunk" },
];

describe("buildTranscriptLines", () => {
  it("places lines by their durations and each chunk after the previous chunk's MP3", () => {
    const lines = buildTranscriptLines(script, [
      { storageId: "a", lineTimings: [{ index: 0, durationMs: 1000 }, { index: 1, durationMs: 1500 }], mp3DurationMs: 2600 },
      { storageId: "b", lineTimings: [{ index: 3, durationMs: 800 }], mp3DurationMs: 900 },
    ]);
    expect(lines).toEqual([
      { speaker: "host_a", text: "Hello", startMs: 0, endMs: 1000 },
      { speaker: "host_b", text: "Hi there", startMs: 1000, endMs: 2500 },
      { speaker: "host_b", text: "Second chunk", startMs: 2600, endMs: 3400 },
    ]);
  });

  it("leaves out failed lines and chunks with no audio", () => {
    const lines = buildTranscriptLines(script, [
      { lineTimings: [], mp3DurationMs: 0 },
      { storageId: "b", lineTimings: [{ index: 3, durationMs: 800 }], mp3DurationMs: 900 },
    ]);
    expect(lines).toEqual([{ speaker: "host_b", text: "Second chunk", startMs: 0, endMs: 800 }]);
  });

  it("returns null when a chunk with audio has no timings (a job started before this change)", () => {
    expect(buildTranscriptLines(script, [{ storageId: "a" }])).toBeNull();
  });

  it("returns null when a timing points outside the script", () => {
    expect(
      buildTranscriptLines(script, [{ storageId: "a", lineTimings: [{ index: 9, durationMs: 1 }], mp3DurationMs: 1 }])
    ).toBeNull();
  });
});
```

Run: `bun run test:convex -- convex/studio/audio/transcriptLines.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement `convex/studio/audio/transcriptLines.ts`.** It must NOT be `"use node"` and must import nothing Node-only. It is a plain helper module with no Convex functions.

```ts
import type { DialogueLine } from "../../_agents/audio_overview/state";

export interface TranscriptLine {
  speaker: DialogueLine["speaker"];
  text: string;
  startMs: number;
  endMs: number;
}

export interface ChunkTimings {
  /** Absent when every line in the chunk failed, so the chunk adds no audio. */
  storageId?: unknown;
  lineTimings?: { index: number; durationMs: number }[];
  mp3DurationMs?: number;
}

/**
 * Times each synthesized line in the joined audio. Lines play back to back inside a chunk's MP3,
 * and each chunk starts where the previous chunk's decoded MP3 ended. Returns null when timings
 * are missing (a job that started before timings were recorded) or inconsistent.
 */
export function buildTranscriptLines(
  script: DialogueLine[],
  chunks: ChunkTimings[]
): TranscriptLine[] | null {
  const lines: TranscriptLine[] = [];
  let chunkStartMs = 0;
  for (const chunk of chunks) {
    if (!chunk.storageId) continue;
    if (!chunk.lineTimings || chunk.mp3DurationMs === undefined) return null;
    let cursor = chunkStartMs;
    for (const timing of chunk.lineTimings) {
      const line = script[timing.index];
      if (!line || !(timing.durationMs >= 0)) return null;
      const startMs = Math.round(cursor);
      cursor += timing.durationMs;
      lines.push({ speaker: line.speaker, text: line.text, startMs, endMs: Math.round(cursor) });
    }
    chunkStartMs += chunk.mp3DurationMs;
  }
  return lines;
}
```

Run the test. Expected: PASS (4).

- [ ] **Step 5: Record the timings.**
  - **Validator.** In `convex/studio/jobMutations/audio.ts`, add these to `synthesisChunkResultValidator`:

```ts
  /** One entry per synthesized line, in script order: absolute script index and WAV duration. */
  lineTimings: v.optional(v.array(v.object({ index: v.number(), durationMs: v.number() }))),
  /** Decoded length of this chunk's MP3, from its frame headers. */
  mp3DurationMs: v.optional(v.number()),
```

  - **Synthesis.** In `audioJobPhases.ts`, `synthesizeDialogueLines` also returns `lineTimings`. For each successful buffer, record `{ index: lineOffset + i + batchIdx, durationMs: getPcmWavDurationSeconds(buffer) * 1000 }`, keeping the same order as `buffers`. Import `getPcmWavDurationSeconds` from `../../_services/ai/wav.js` and `getMp3DurationMs` from `../../_services/ai/mp3.js`.
  - **Chunk phase.** In `runSynthesizeAudioOverviewChunkPhase`, after encoding, compute `mp3DurationMs = getMp3DurationMs(mp3)`. Pass `lineTimings` and `mp3DurationMs` in `result`. When `buffers.length === 0`, pass `lineTimings: []` and `mp3DurationMs: 0`.
  - **Assemble phase.** In `runAssembleAudioOverviewPhase`:
    - Compute `const lines = buildTranscriptLines(fullDialogueScript, results);`.
    - Add `...(lines ? { lines } : {})` to the `metadata` object passed to `saveAudioOverviewResults`.
    - Log when `lines` is null: `console.log("[AudioJob] No line timings; transcript sync will be estimated")`.

- [ ] **Step 6: The `convex-test` for saving.**
  - Check for `convex/studio/jobMutations/audio.test.ts`; if it doesn't exist, find an existing `convex-test` file to copy its setup (for example `grep -rln "convexTest" convex | head`).
  - Write a test that inserts an `audioOverviews` row in `generating` status, with `metadata: { synthesisInput: {…}, synthesis: { chunks: [], done: {}, startedAt: 0 } }` and the required fields. Read the schema in `convex/schema.ts`.
  - Run `internal.studio.jobMutations.audio.saveAudioOverviewResults` with `metadata: { title: "T", lines: [{ speaker: "host_a", text: "Hi", startMs: 0, endMs: 900 }] }`.
  - Assert that the saved row's `metadata.lines` equals what was passed, and that `metadata.synthesisInput` and `metadata.synthesis` are gone.

  Run it. Expected: PASS. If it fails because the mutation drops unknown metadata keys, fix the mutation so it keeps `lines`.

- [ ] **Step 7: Run the checks.**
  - `bun run typecheck:convex`
  - `bun run test:convex -- convex/_services/ai convex/studio/audio convex/studio/jobMutations`
  - `bun run lint`

  Two `ChatAgent.globalRerank` tests fail locally when `TOGETHER_AI_API_KEY` is missing. That's unrelated, so ignore them if you run the whole suite.

- [ ] **Step 8: Commit.** `fix(studio): audio overviews save per-line timings so the transcript can follow the audio (#361)`

---

### Task 2: Frontend reader lines and playback rates

**Files:**
- Create: `apps/web/src/features/audio/transcript/transcriptLines.ts` and its test.
- Modify: `hooks/useAudioPlayer.ts`, and its test if one exists.

- [ ] **Step 1: Write the failing tests** (`transcriptLines.test.ts`):
  - **`resolveReaderLines(metadata, transcript, durationSec)`:**
    - With valid `metadata.lines`, it returns `{ lines, approximate: false }` with those lines.
    - With no `metadata.lines`, it splits `transcript` on newlines, trims and drops empty lines. It spreads `durationSec * 1000` in proportion to each line's character count, so the first line starts at 0 and the last ends at the duration. It sets `speaker: null` and `approximate: true`.
    - With malformed `metadata.lines` (a negative time, `endMs < startMs`, starts going backwards, a non-string text, or an unknown speaker), it falls back to the estimate and calls `console.warn` once. Spy on it.
    - With duration 0 (not loaded yet), the estimated lines all have `startMs: 0` and `endMs: 0`. No crash.
    - An empty transcript gives `lines: []`.
  - **`activeLineIndex(lines, timeMs)`:**
    - −1 before the first line's start;
    - the index of the last line whose `startMs <= timeMs`, using a binary search;
    - the gap after a line counts as that line;
    - past the end, the last line.

- [ ] **Step 2: Implement.**
  - **Types:** `export interface ReaderLine { speaker: "host_a" | "host_b" | null; text: string; startMs: number; endMs: number }`.
  - **`useMemo`:** callers wrap `resolveReaderLines` in `useMemo`. Note this in its doc comment, along with the fact that the fallback depends on duration.
  - **Rates:** in `hooks/useAudioPlayer.ts`, change `PLAYBACK_RATES` to `[1, 1.25, 1.5, 2] as const`. The spec cycles 1×, 1.25×, 1.5× and 2×. If a rate outside the list is somehow current, `cyclePlaybackRate` must go to 1: check the `indexOf === -1` path.
  - **Export:** export `PLAYBACK_RATES`, because `SpeedPill`'s test uses it.

- [ ] **Step 3: Run the tests.** Expected: PASS. Then run `typecheck:web`.
- [ ] **Step 4: Commit.** `feat(audio): reader lines from saved timings, estimated for older overviews`

---

### Task 3: Player controls

**Files:**
- Create in `apps/web/src/features/audio/components/controls/`: `SkipButton.tsx`, `PlayButton.tsx`, `SpeedPill.tsx`, `WaveformScrubber.tsx`, and tests for `SpeedPill` and `WaveformScrubber`.
- Modify: `apps/web/src/index.css`.

**`index.css`.** Next to the `studio-*` utilities, add:

```css
/* One waveform bar; its height comes from --audio-bar (style may only set custom properties). */
@utility audio-bar {
  height: var(--audio-bar, 50%);
}
/* Fades a scrolling transcript out at the top and bottom. */
@utility reader-fade {
  mask-image: linear-gradient(transparent, #000 18%, #000 75%, transparent);
}
```

**`SkipButton`** (`{ direction: "back" | "forward"; onSkip: () => void; disabled?: boolean; size?: "default" | "sm" }`):
- **Element:** a raw `<button type="button">` with a local `cva`, styled like `practice/QuizOption.tsx`. It is round and transparent, with `hover:bg-muted`, a focus-visible ring and no border.
- **Labels:** `aria-label` is "Back 10 seconds" or "Forward 10 seconds". `title` is the same text.
- **Icon:** the mockup's SVG, a circular arrow drawn with `viewBox="0 0 24 24"` and paths `M4.5 12a7.5 7.5 0 1 0 2.2-5.3` and `M4 3.8v3.4h3.4`. It is mirrored with `-scale-x-100` for forward, and the number "10" is centred over it in a tiny bold sans font.
- **Twist on press:** on the svg wrapper, add `transition-transform duration-150 ease-out` with `group-active:-rotate-12 group-active:scale-90` for back, or `group-active:rotate-12 group-active:scale-90` for forward. Add `motion-reduce:group-active:rotate-0 motion-reduce:group-active:scale-100`. The button gets `group`.
- **Sizes:** default is `size-10` with a 28px icon; `sm` is `size-8` with a 22px icon.

**`PlayButton`** (`{ isPlaying; onToggle; disabled; size? }`):
- **Element:** a raw round `<button>`, `bg-primary text-primary-foreground shadow-md`, with hover `scale-105` and active `scale-95`. Add `motion-reduce:` resets.
- **Sizes:** `size-12` by default, or `size-9` for `sm`.
- **Content:** `aria-label` is "Pause" or "Play". The icon is lucide `Play` or `Pause`; `Play` gets `ml-0.5` for optical centring.

**`SpeedPill`** (`{ rate: number; onCycle: () => void; disabled?: boolean }`):
- **Element:** a raw `<button>` with `data-active={rate !== 1}`. It is `rounded-full h-7 min-w-12 px-2 font-sans text-xs font-semibold tabular-nums`. Inactive it is `bg-muted text-foreground`; with `data-[active=true]:` it becomes `bg-primary text-primary-foreground`.
- **Label:** `aria-label={`Playback speed ${label}`}`, for example "Playback speed 1.25×".
- **Rolling number:** an inner `relative h-4 overflow-hidden` span holds `<span key={rate} className="block animate-in fade-in slide-in-from-bottom-full duration-300">{label}</span>`. The key change replays the roll, and reduced motion turns it into a fade through the global policy.
- **Label format:** `${rate}×`, giving 1×, 1.25×, 1.5× and 2×.

**`WaveformScrubber`** (`{ seed: string; currentTime: number; duration: number; onSeek: (seconds: number) => void; disabled?: boolean; bars?: number }`):
- **Bars:** 64 by default.
  - Heights are deterministic for the seed: hash `seed` to a number, then use `20 + |sin(i * 1.7 + h) * 50 + sin(i * 0.37 + h) * 30|`, clamped to 12–100.
  - The waveform is decorative. Note that in a doc comment: no audio analysis.
  - Each bar is `<span aria-hidden className={cn("audio-bar flex-1 rounded-xs", played ? "bg-primary" : "bg-foreground/15")} style={{ "--audio-bar": `${h}%` }} />`, where `played` is `i / bars < currentTime / duration`.
- **Slider semantics:** the row `<div role="slider" tabIndex={disabled ? -1 : 0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(currentTime)} aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`} aria-disabled={disabled}>`, with classes `flex h-9 items-center gap-0.5 cursor-pointer touch-none outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-md`.
- **Pointer:**
  - `onPointerDown` captures the pointer and seeks to `(clientX - rect.left) / rect.width * duration`.
  - `onPointerMove` seeks while captured.
  - `onPointerUp` releases.
- **Keys:**
  - ArrowLeft and ArrowRight go −10 / +10 seconds.
  - Home goes to 0 and End to `duration`.
  - Call `preventDefault`, and `stopPropagation` too, so the player's global arrow handler doesn't skip twice.
- **Times:** a row below shows `formatAudioTime(currentTime)` and `formatAudioTime(duration)`, `flex justify-between font-sans text-xs tabular-nums text-muted-foreground`.

**Tests:**
- **`SpeedPill`:**
  - it shows "1×" with `data-active="false"` and "1.5×" with `data-active="true"`;
  - a click calls `onCycle`;
  - the name matches "Playback speed 1.5×".
- **`WaveformScrubber`:**
  - it has `role="slider"` with `aria-valuetext` "0:30 of 2:00";
  - ArrowRight calls `onSeek(40)` from 30, and Home calls `onSeek(0)`;
  - a pointer-down at 25% of a mocked `getBoundingClientRect` (left 0, width 200, clientX 50) seeks to 30 with duration 120. jsdom lacks `setPointerCapture`, so guard the call with `?.`.
  - disabled does nothing.

**Checks and commit:**
- [ ] Run the tests, then `npx eslint src/features/audio`, expecting 0, then `typecheck:web`.
- [ ] Commit: `feat(audio): podcast skip buttons, play button, rolling speed pill, waveform scrubber`.

---

### Task 4: `TranscriptReader` and the Reader `AudioPlayer`

**Files:**
- Create: `TranscriptReader.tsx` and its test.
- Rewrite: `AudioPlayer.tsx`, and create its test.
- Modify: `apps/web/src/features/studio/components/ActiveNoteView.tsx`.

**`TranscriptReader`** (`{ lines: ReaderLine[]; activeIndex: number; isPlaying: boolean; approximate: boolean; onSeek: (ms: number) => void }`):

- **Scroll container:** `relative min-h-0 flex-1 overflow-y-auto reader-fade px-6`, with top and bottom spacer divs (`h-32` and `h-48`, `aria-hidden`) so the first and last lines can reach the centre.
- **Lines:**
  - Each line is a `<button type="button" aria-current={i === activeIndex ? "true" : undefined} onClick={() => onSeek(line.startMs)}>`, styled `block w-full origin-left py-2 text-left outline-hidden transition duration-500 ease-out focus-visible:ring-2 focus-visible:ring-ring rounded-md`.
  - Active: `opacity-100 scale-100`. Past: `opacity-45 scale-95`. Upcoming: `opacity-30 scale-95`. Hover: `hover:opacity-60`.
  - Add `motion-reduce:scale-100`, because the scale is movement.
  - Check that `opacity-45` exists in Tailwind v4: any integer opacity works. If lint flags it, use `opacity-40`.
- **Speaker label:**
  - `block font-sans text-xs font-semibold uppercase tracking-wide`.
  - Host 1 (`host_a`) is `text-studio-audio` and Host 2 (`host_b`) is `text-primary`.
  - `speaker: null` shows no label.
- **Text:** `font-serif text-xl font-semibold leading-snug text-foreground md:text-2xl`.
- **Following.** A `following` state starts true.
  - When `activeIndex` changes and `following` is true, centre that line inside the container:
    - `container.scrollTo({ top: el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2, behavior: reduceMotion ? "auto" : "smooth" })`;
    - get `reduceMotion` from `useReducedMotion()` (`motion/react`);
    - do NOT use `scrollIntoView`, because it scrolls ancestors too.
  - Manual scroll while `isPlaying` sets `following = false`. Detect it with `wheel`, `touchmove`, and `keydown` for PageUp, PageDown, ArrowUp, ArrowDown, Home and End on the container. Don't use the `scroll` event: programmatic scrolls fire it too.
  - While not following, a floating `<Button size="sm" variant="secondary" className="absolute bottom-4 left-1/2 -translate-x-1/2">` labelled "Follow along", with a `<ArrowDown />` icon, appears with `animate-in fade-in slide-in-from-bottom-2`. Clicking it sets `following = true` and re-centres at once.
    - If lint flags the positioning classes on `Button`, wrap it in an absolutely positioned `div`.
  - Seeking by clicking a line also sets `following = true`.
- **Approximate note:** when `approximate`, show a small `Badge variant="secondary"` "Approximate sync" pinned at the top (`absolute top-2 right-4`, or in a wrapper). Give it a `title` of "Timings are estimated for this older overview".
- **Empty:** with no lines, show `Empty` with the title "No transcript".

**`AudioPlayer`** (props: the current ones plus `metadata?: Record<string, unknown>`):

- **Kept:**
  - `useResolvedAudioPlaybackUrl` and `useAudioPlayer`;
  - the hidden `<audio>`;
  - the loading, unavailable and error states, with their wording;
  - the mobile back bar, now a `Button variant="ghost" size="icon-sm"` labelled "Back to Studio";
  - the Download link.
- **Lines:** `const { lines, approximate } = useMemo(() => resolveReaderLines(metadata, transcript ?? "", duration), [metadata, transcript, duration]);` and `activeIndex = activeLineIndex(lines, currentTime * 1000)`.
- **Layout:** the root is `relative flex h-full flex-col`. It holds the `TranscriptReader` (flex-1), then the floating card: `<div className="mx-3 mb-3 shrink-0 space-y-2 rounded-2xl bg-card p-3 shadow-lg ring-1 ring-hairline">`.
  1. **Top row:**
     - the title (`truncate font-display text-sm font-semibold`);
     - under it, the subtitle `${typeLabel} · 2 hosts` in `text-xs text-muted-foreground`. `typeLabel` comes from `metadata.audioType`: `deep_dive` gives "Deep dive", `brief` gives "Brief", `critique` gives "Critique", `debate` gives "Debate", and anything else gives "Audio overview". Check the real `audioType` values with `grep -rn "audioType" convex/_agents/audio_overview | head`.
     - on the right, the `SpeedPill`, then the Download icon link as a `Button variant="ghost" size="icon-sm" asChild` around the `<a download>`, labelled "Download audio".
  2. **Scrubber:** `WaveformScrubber`, seeded with `audioOverviewId ?? audioUrl`.
  3. **Transport:** `flex items-center justify-center gap-4` with `SkipButton` back (`skipBy(-10)`), `PlayButton` and `SkipButton` forward (`skipBy(10)`).
- **Keyboard** (window `keydown`):
  - Space or `k` toggles play. ArrowLeft and ArrowRight skip −10 and +10.
  - **Ignore:**
    - modifier keys, `repeat` and `defaultPrevented`;
    - targets inside `input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog']`;
    - for Space, targets inside `button, a, [role='button'], [role='slider']`;
    - for the arrows, `[role='slider']`, because the scrubber handles those itself.
  - Only act when the player root is visible. Use a `rootRef` and the `checkVisibility()` guard used in `StudyMode.tsx`: the notebook keeps a second, CSS-hidden Studio panel.
  - Use `useEffectEvent` with a once-only `useEffect` for the listener, as `StudyMode` does.
- **`ActiveNoteView`:** for the `audioOverview` case, pass `metadata={activeNote.metadata}`. The legacy `audio` note case passes nothing and gets the estimate.

**Tests:**
- **`TranscriptReader.test.tsx`:**
  - the active line has `aria-current="true"`;
  - a click calls `onSeek(startMs)`;
  - with `isPlaying`, a `wheel` event on the container shows "Follow along", and clicking it hides it;
  - `approximate` shows "Approximate sync";
  - a null speaker shows no label.
  - Mock `motion/react`'s `useReducedMotion` if needed, and stub `HTMLElement.prototype.scrollTo`.
- **`AudioPlayer.test.tsx`:**
  - Mock `useResolvedAudioPlaybackUrl` to return a URL.
  - Stub `HTMLMediaElement.prototype.play` (resolved promise) and `pause`.
  - With `metadata.lines` it renders the lines as buttons, and clicking the second line sets `audio.currentTime` to its `startMs / 1000`. Find the `<audio>` with `container.querySelector("audio")`.
  - Space on `document.body` calls `play`.
  - The skip buttons are named "Back 10 seconds" and "Forward 10 seconds".
- [ ] Run the tests, then `npx eslint src/features/audio src/features/studio/components/ActiveNoteView.tsx` (expect 0 problems in the audio files), then `typecheck:web`.
- [ ] Commit: `feat(audio): the transcript reads like lyrics and follows the audio; floating three-row player (#361)`

---

### Task 5: `MiniAudioPlayer` on the shared controls

- **Keep:** the props, the autoplay effect, and the loading, unavailable and error states with their wording.
- **Swap the markup:**
  - **Top row:** the title, then `SpeedPill`, then the icon Buttons for Download, Expand ("Expand player") and Close ("Close player"). Use `Button variant="ghost" size="icon-sm"` with `aria-label`s, and `asChild` for the download link.
  - **Middle row:** `WaveformScrubber` (`bars={48}`).
  - **Bottom row:** centred `SkipButton size="sm"` back, `PlayButton size="sm"`, and `SkipButton size="sm"` forward. Skips are ±10 seconds.
  - **Container:** `w-full bg-card shadow-lg ring-1 ring-hairline animate-in fade-in slide-in-from-bottom-4 duration-300`. Drop the `border-t`.
- **Test:** add `MiniAudioPlayer.test.tsx`:
  - visible renders the shared controls by name;
  - Close calls `onClose`;
  - hidden renders nothing.
- [ ] Run the tests, then `npx eslint src/features/audio` (expect 0), then `typecheck:web`.
- [ ] Commit: `feat(audio): mini player shares the new controls`

---

### Task 6: Gates and PR (controller)

- **Baseline:** `bun run --cwd apps/web lint:design:update`. The audio files are already in `MIGRATED`, so expect no change, or a drop.
- **Gates:** `typecheck:web`, `typecheck:convex`, `lint`, `lint:design`, web tests, `test:convex` (the two `ChatAgent.globalRerank` tests fail locally when `TOGETHER_AI_API_KEY` is missing), `knip`, and `playwright test --list`.
- **Visual check.** In the browser pane, open an existing audio overview: it gets the estimated sync and the "Approximate sync" note. Check:
  - play, pause and seeking by clicking a line;
  - the scrubber, by click and keys;
  - the skip twist and the speed pill roll;
  - "Follow along";
  - phone width;
  - the mini player.

  Real saved timings need a new generation, which costs credits, after the Convex code reaches the dev deployment. Ask the user before doing either.
- **PR:**
  - title: `feat(studio): audio overview reads like lyrics and follows the audio (#264, 4/8)`;
  - the body includes `Fixes #361` and `Part of #264`;
  - ask before merging.
