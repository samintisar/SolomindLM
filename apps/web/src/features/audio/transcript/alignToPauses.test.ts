import { describe, expect, it } from "vitest";
import {
  alignLinesToPauses,
  alignTranscriptToAudio,
  findPauses,
  type PauseAnalysis,
} from "./alignToPauses";
import { estimateLines } from "./transcriptLines";

const SAMPLE_RATE = 8000;

/** Small seeded PRNG (mulberry32), so every synthetic file is the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Synthetic {
  samples: Float32Array;
  transcript: string;
  /** When each line's first sound starts, in ms. */
  lineStarts: number[];
  /** The silences between lines. */
  joins: { startMs: number; endMs: number }[];
}

interface SynthOptions {
  lines?: number;
  seed?: number;
  /** Both hosts speak at the same pitch, so only pause length and position are left. */
  sameVoice?: boolean;
  /** Per-sentence speaking-rate jitter, as a fraction. */
  jitter?: number;
  /** Pause lengths in ms: between lines, between sentences, and at commas (up to `commas`). */
  joinMs?: [number, number];
  sentenceMs?: [number, number];
  commaMs?: [number, number];
  commas?: number;
}

/**
 * A stand-in for a two-host TTS overview: harmonic "voiced" bursts at about 210 Hz (host 1) and
 * 115 Hz (host 2), amplitude-modulated like syllables, with per-voice speaking rates, ±15% jitter
 * and a slow tempo drift so a character-count estimate is many seconds off by mid-file. By
 * default, inside a line commas pause 150-250 ms and sentence ends 400-600 ms; joins between
 * lines are 500-900 ms, so pause length alone cannot tell them apart. Lines 20 and 41 repeat the
 * previous speaker, so not every join changes voice.
 */
function synthesize({
  lines = 60,
  seed = 7,
  sameVoice = false,
  jitter = 0.15,
  joinMs = [500, 900],
  sentenceMs = [400, 600],
  commaMs = [150, 250],
  commas: maxCommas = 2,
}: SynthOptions = {}): Synthetic {
  const rand = random(seed);
  const between = (low: number, high: number) => low + rand() * (high - low);

  type Segment = { kind: "voice"; ms: number; f0: number } | { kind: "silence"; ms: number };
  const segments: Segment[] = [{ kind: "silence", ms: 300 }];
  const texts: string[] = [];
  const lineStarts: number[] = [];
  const joins: { startMs: number; endMs: number }[] = [];
  let clock = 300;
  let speaker = 0;

  for (let line = 0; line < lines; line++) {
    if (line > 0 && line !== 20 && line !== 41) speaker = 1 - speaker;
    const f0 = sameVoice ? 160 : speaker === 0 ? 210 : 115;
    const msPerChar = speaker === 0 ? 62 : 72;
    // Slower at the start and faster at the end: the estimate drifts by seconds mid-file.
    const tempo = 1.12 - (0.24 * line) / (lines - 1);

    if (line > 0) {
      const join = between(...joinMs);
      segments.push({ kind: "silence", ms: join });
      joins.push({ startMs: clock, endMs: clock + join });
      clock += join;
    }
    lineStarts.push(clock);

    const sentences: string[] = [];
    const sentenceCount = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < sentenceCount; s++) {
      if (s > 0) {
        const pause = between(...sentenceMs);
        segments.push({ kind: "silence", ms: pause });
        clock += pause;
      }
      const chars = Math.round(between(30, 100));
      sentences.push(`${"word ".repeat(Math.ceil(chars / 5)).slice(0, chars - 1)}.`);
      const commas = Math.floor(rand() * (maxCommas + 1));
      const voicedMs = chars * msPerChar * tempo * between(1 - jitter, 1 + jitter);
      for (let part = 0; part <= commas; part++) {
        if (part > 0) {
          const comma = between(...commaMs);
          segments.push({ kind: "silence", ms: comma });
          clock += comma;
        }
        const ms = voicedMs / (commas + 1);
        segments.push({ kind: "voice", ms, f0 });
        clock += ms;
      }
    }
    texts.push(sentences.join(" "));
  }
  segments.push({ kind: "silence", ms: 500 });

  const total = segments.reduce(
    (sum, segment) => sum + Math.round((segment.ms * SAMPLE_RATE) / 1000),
    0
  );
  const samples = new Float32Array(total);
  let offset = 0;
  let phase = 0;
  for (const segment of segments) {
    const count = Math.round((segment.ms * SAMPLE_RATE) / 1000);
    if (segment.kind === "silence") {
      for (let n = 0; n < count; n++) samples[offset + n] = (rand() - 0.5) * 0.001;
    } else {
      const wobble = rand() * 6.28;
      for (let n = 0; n < count; n++) {
        const t = n / SAMPLE_RATE;
        const f = segment.f0 * (1 + 0.08 * Math.sin(2 * Math.PI * 0.7 * t + wobble));
        phase += (2 * Math.PI * f) / SAMPLE_RATE;
        const syllable = 0.35 + 0.65 * Math.abs(Math.sin(2 * Math.PI * 3.5 * t + wobble));
        const edge = Math.min(1, n / 80, (count - n) / 80);
        const voiced = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.33 * Math.sin(3 * phase);
        samples[offset + n] = edge * (0.3 * syllable * voiced + (rand() - 0.5) * 0.04);
      }
    }
    offset += count;
  }

  return { samples, transcript: texts.join("\n"), lineStarts, joins };
}

function startErrors(starts: number[], truth: number[]): number[] {
  return truth.map((ms, i) => Math.abs((starts[i] ?? Number.NaN) - ms));
}

const voiced = synthesize();
const sameVoice = synthesize({ sameVoice: true, seed: 11 });
/** Shaped like the pauses measured in a real 13-minute overview: many short ones, wide overlap. */
const realShaped: SynthOptions = {
  jitter: 0.2,
  joinMs: [400, 1000],
  sentenceMs: [350, 650],
  commaMs: [120, 350],
  commas: 4,
};

describe("findPauses", () => {
  it("finds every join between lines, and none in the leading or trailing silence", () => {
    const analysis = findPauses(voiced.samples, SAMPLE_RATE);
    for (const join of voiced.joins) {
      const match = analysis.pauses.find(
        (pause) =>
          Math.abs(pause.startMs - join.startMs) <= 40 && Math.abs(pause.endMs - join.endMs) <= 40
      );
      expect(match, `join at ${Math.round(join.startMs)} ms`).toBeDefined();
    }
    expect(Math.abs(analysis.soundStartMs - 300)).toBeLessThanOrEqual(40);
    expect(analysis.pauses[0]?.startMs).toBeGreaterThan(analysis.soundStartMs);
    const last = analysis.pauses.at(-1);
    expect(last?.endMs).toBeLessThan(analysis.soundEndMs);
  });

  it("scores a change of voice high and a pause inside a line low", () => {
    const analysis = findPauses(voiced.samples, SAMPLE_RATE);
    const joinStarts = new Set(voiced.joins.map((join) => Math.round(join.startMs / 20)));
    const isJoin = (startMs: number) =>
      [-1, 0, 1].some((d) => joinStarts.has(Math.round(startMs / 20) + d));
    // Joins 20 and 41 keep the same speaker.
    const sameSpeakerJoins = new Set([19, 40].map((i) => Math.round(voiced.joins[i].startMs / 20)));
    const changes: number[] = [];
    const inside: number[] = [];
    for (const pause of analysis.pauses) {
      const frame = Math.round(pause.startMs / 20);
      if ([-1, 0, 1].some((d) => sameSpeakerJoins.has(frame + d))) continue;
      (isJoin(pause.startMs) ? changes : inside).push(pause.voiceChange);
    }
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean(changes)).toBeGreaterThan(0.8);
    expect(mean(inside)).toBeLessThan(0.2);
  });

  it("keeps pause times exact at a rate whose 20 ms frames are not whole samples", () => {
    const rate = 11025; // 220.5 samples per 20 ms
    const samples = new Float32Array(rate * 120);
    for (let n = 0; n < samples.length; n++) {
      const t = n / rate;
      samples[n] = t >= 100 && t < 100.5 ? 0 : 0.3 * Math.sin(2 * Math.PI * 150 * t);
    }
    const { pauses } = findPauses(samples, rate);
    expect(pauses).toHaveLength(1);
    expect(Math.abs((pauses[0]?.startMs ?? 0) - 100_000)).toBeLessThanOrEqual(40);
    expect(Math.abs((pauses[0]?.endMs ?? 0) - 100_500)).toBeLessThanOrEqual(40);
  });

  it("finds no sound in silence or in an empty input", () => {
    expect(findPauses(new Float32Array(SAMPLE_RATE * 5), SAMPLE_RATE)).toEqual({
      pauses: [],
      soundStartMs: 0,
      soundEndMs: 0,
    });
    expect(findPauses(new Float32Array(0), SAMPLE_RATE)).toEqual({
      pauses: [],
      soundStartMs: 0,
      soundEndMs: 0,
    });
  });
});

describe("alignTranscriptToAudio", () => {
  it("recovers every line start of a 60-line, ten-minute file within 150 ms", () => {
    const started = performance.now();
    const lines = alignTranscriptToAudio(voiced.transcript, voiced.samples, SAMPLE_RATE);
    const elapsed = performance.now() - started;
    expect(lines).not.toBeNull();
    const errors = startErrors(lines?.map((line) => line.startMs) ?? [], voiced.lineStarts);
    const within = errors.filter((error) => error <= 150).length;
    console.info(
      `[alignToPauses] voice cue: ${within}/${errors.length} starts within 150 ms, worst ${Math.round(Math.max(...errors))} ms; ` +
        `${Math.round(voiced.samples.length / SAMPLE_RATE)} s analysed in ${Math.round(elapsed)} ms`
    );
    expect(within).toBe(errors.length);
    // A rough guard against a slow path, not a benchmark: the real target is well under 300 ms.
    expect(elapsed).toBeLessThan(3000);
  });

  it("corrects an estimate that is seconds off by mid-file", () => {
    const durationSec = voiced.samples.length / SAMPLE_RATE;
    const estimate = estimateLines(voiced.transcript, durationSec);
    const estimateErrors = startErrors(
      estimate.map((line) => line.startMs),
      voiced.lineStarts
    );
    expect(Math.max(...estimateErrors)).toBeGreaterThan(3000);

    const lines = alignLinesToPauses(estimate, findPauses(voiced.samples, SAMPLE_RATE));
    const errors = startErrors(lines?.map((line) => line.startMs) ?? [], voiced.lineStarts);
    expect(Math.max(...errors)).toBeLessThanOrEqual(150);
  });

  it("still recovers most line starts when both hosts share a voice", () => {
    const lines = alignTranscriptToAudio(sameVoice.transcript, sameVoice.samples, SAMPLE_RATE);
    expect(lines).not.toBeNull();
    const errors = startErrors(lines?.map((line) => line.startMs) ?? [], sameVoice.lineStarts);
    const within = errors.filter((error) => error <= 150).length;
    console.info(`[alignToPauses] same voice: ${within}/${errors.length} starts within 150 ms`);
    expect(within / errors.length).toBeGreaterThanOrEqual(0.85);
  });

  // Synthesises and analyses two ten-minute files of its own, so it is the slowest test here. A
  // shorter file would be faster but too easy: at 30-40 lines the same-voice case aligns every
  // line, and the bound below would stop measuring anything. Pitch tracking dominates and V8
  // coverage slows it about eightfold (near 5 s in CI), hence a timeout above Vitest's 5 s default.
  it("with the real pause mix, aligns every start with the voice cue and most without", () => {
    const accuracy = (options: SynthOptions) => {
      const synthetic = synthesize({ ...realShaped, ...options });
      const lines = alignTranscriptToAudio(synthetic.transcript, synthetic.samples, SAMPLE_RATE);
      const errors = startErrors(lines?.map((line) => line.startMs) ?? [], synthetic.lineStarts);
      return errors.filter((error) => error <= 150).length / errors.length;
    };
    const voiceCue = accuracy({ seed: 5 });
    const noVoiceCue = accuracy({ seed: 5, sameVoice: true });
    console.info(
      `[alignToPauses] real pause mix: ${Math.round(voiceCue * 100)}% with the voice cue, ${Math.round(noVoiceCue * 100)}% without`
    );
    expect(voiceCue).toBe(1);
    expect(noVoiceCue).toBeGreaterThanOrEqual(0.85);
  }, 20_000);

  it("keeps each line's text and speaker and ends lines where the next pause starts", () => {
    const estimate = estimateLines(voiced.transcript, voiced.samples.length / SAMPLE_RATE).map(
      (line, i) => ({ ...line, speaker: i % 2 === 0 ? ("host_a" as const) : ("host_b" as const) })
    );
    const analysis = findPauses(voiced.samples, SAMPLE_RATE);
    const lines = alignLinesToPauses(estimate, analysis);
    expect(lines?.map((line) => [line.speaker, line.text])).toEqual(
      estimate.map((line) => [line.speaker, line.text])
    );
    expect(lines?.[0]?.startMs).toBe(analysis.soundStartMs);
    expect(lines?.at(-1)?.endMs).toBe(analysis.soundEndMs);
    for (let i = 1; i < (lines?.length ?? 0); i++) {
      const previous = lines?.[i - 1];
      const line = lines?.[i];
      expect(previous && line && previous.endMs <= line.startMs).toBe(true);
    }
  });

  it("returns null for silence and for an empty input", () => {
    expect(
      alignTranscriptToAudio("One.\nTwo.", new Float32Array(SAMPLE_RATE * 5), SAMPLE_RATE)
    ).toBeNull();
    expect(alignTranscriptToAudio("One.\nTwo.", new Float32Array(0), SAMPLE_RATE)).toBeNull();
    expect(alignTranscriptToAudio("", voiced.samples, SAMPLE_RATE)).toBeNull();
  });
});

describe("alignLinesToPauses", () => {
  const estimate = estimateLines("a\nb\nc\nd\ne", 50);

  it("returns null when there are fewer pauses than boundaries", () => {
    const analysis: PauseAnalysis = {
      soundStartMs: 0,
      soundEndMs: 50_000,
      pauses: [
        { startMs: 10_000, endMs: 10_600, voiceChange: 1 },
        { startMs: 20_000, endMs: 20_600, voiceChange: 1 },
        { startMs: 30_000, endMs: 30_600, voiceChange: 1 },
      ],
    };
    expect(alignLinesToPauses(estimate, analysis)).toBeNull();
  });

  it("returns null when the only pauses are far from where the lines should break", () => {
    const analysis: PauseAnalysis = {
      soundStartMs: 0,
      soundEndMs: 50_000,
      pauses: [0, 1, 2, 3].map((i) => ({
        startMs: 45_000 + i * 1000,
        endMs: 45_600 + i * 1000,
        voiceChange: 1,
      })),
    };
    expect(alignLinesToPauses(estimate, analysis)).toBeNull();
  });

  it("aligns lines to the pauses near their estimated breaks", () => {
    const analysis: PauseAnalysis = {
      soundStartMs: 200,
      soundEndMs: 50_000,
      pauses: [
        { startMs: 4_000, endMs: 4_200, voiceChange: 0 },
        { startMs: 11_000, endMs: 11_700, voiceChange: 1 },
        { startMs: 21_500, endMs: 22_200, voiceChange: 1 },
        { startMs: 25_000, endMs: 25_200, voiceChange: 0 },
        { startMs: 29_000, endMs: 29_800, voiceChange: 1 },
        { startMs: 41_000, endMs: 41_600, voiceChange: 1 },
      ],
    };
    expect(alignLinesToPauses(estimate, analysis)?.map((line) => line.startMs)).toEqual([
      200, 11_700, 22_200, 29_800, 41_600,
    ]);
  });

  it("spans the sound with a single line", () => {
    const analysis: PauseAnalysis = { soundStartMs: 100, soundEndMs: 9_000, pauses: [] };
    expect(alignLinesToPauses(estimateLines("Only line.", 10), analysis)).toEqual([
      { speaker: null, text: "Only line.", startMs: 100, endMs: 9_000 },
    ]);
  });
});
