import { estimateLines, type ReaderLine } from "./transcriptLines";

/**
 * Aligns an older overview's transcript to its audio. Those overviews saved no line timings, and
 * a character-count estimate drifts by seconds over a long file. Every line was synthesised on
 * its own, so the joins between lines are silences; but so are sentence ends inside a line, and
 * they can be just as long. Three cues pick the joins:
 *
 * 1. pause length: joins tend to be among the longest silences;
 * 2. position: each line's length should roughly follow its character count, so consecutive
 *    breaks should be about as far apart as the estimate says, and none far from its estimate;
 * 3. voice: the hosts usually alternate and their voices differ in pitch, so a large pitch change
 *    across a pause marks a join. A bonus, not a rule: a host can speak two lines in a row.
 *
 * Pure: samples in, timings out, no DOM.
 */

interface Pause {
  startMs: number;
  endMs: number;
  /** 0 to 1: how clearly the speaking pitch changes across the pause (0 when unknown). */
  voiceChange: number;
}

export interface PauseAnalysis {
  /** Silences of at least 120 ms between the first and last sound, in order. */
  pauses: Pause[];
  /** First and last sound; both 0 when there is no sound at all. */
  soundStartMs: number;
  soundEndMs: number;
}

const FRAME_MS = 20;
const MIN_PAUSE_FRAMES = 6; // 120 ms
/** Silence is below this fraction of the 95th-percentile frame loudness... */
const SILENCE_FRACTION = 0.04;
/** ...and always below this RMS, so digital silence and dither never count as sound. */
const SILENCE_FLOOR = 5e-4;

/** Pitch is tracked on audio decimated to about this rate: plenty for a speaking voice. */
const PITCH_RATE = 4000;
const PITCH_WINDOW_MS = 32;
const PITCH_HOP_MS = 40;
const MIN_F0 = 70;
const MAX_F0 = 400;
/** Below this normalised autocorrelation a frame is treated as unvoiced. */
const VOICING = 0.5;
/** How far, and for how many voiced frames, to look on each side of a pause. */
const VOICE_REACH_MS = 1500;
const VOICE_FRAMES = 10;
const MIN_VOICE_FRAMES = 3;
/** Pitch ratios in octaves: below the first is the same voice, above the second a clear change. */
const SAME_VOICE_OCTAVES = 0.25;
const CHANGED_VOICE_OCTAVES = 0.6;

function percentile(values: Float32Array, fraction: number): number {
  const sorted = values.slice().sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Pitch at sparse frames of the decimated signal, computed on demand and memoised: only frames
 * near a pause are ever needed. 0 means unvoiced.
 */
function createPitchTrack(samples: Float32Array, sampleRate: number, silenceRms: number) {
  const factor = Math.max(1, Math.round(sampleRate / PITCH_RATE));
  const rate = sampleRate / factor;
  const signal = new Float32Array(Math.floor(samples.length / factor));
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[i * factor + k] ?? 0;
    signal[i] = sum / factor;
  }

  const window = Math.round((PITCH_WINDOW_MS / 1000) * rate);
  const hop = Math.round((PITCH_HOP_MS / 1000) * rate);
  const hopMs = (hop * 1000) / rate;
  const windowMs = (window * 1000) / rate;
  const minLag = Math.max(2, Math.floor(rate / MAX_F0));
  const maxLag = Math.ceil(rate / MIN_F0);
  const frameCount = Math.max(0, Math.floor((signal.length - window - maxLag - 1) / hop) + 1);
  const pitch = new Float32Array(frameCount).fill(Number.NaN);
  const correlation = new Float32Array(maxLag + 2);

  const compute = (frame: number): number => {
    const start = frame * hop;
    let energy = 0;
    for (let n = 0; n < window; n++) {
      const x = signal[start + n] ?? 0;
      energy += x * x;
    }
    if (energy / window < silenceRms * silenceRms * 4) return 0;

    // Energy of the lagged window, slid along one sample per lag.
    let lagged = 0;
    for (let n = 0; n < window; n++) {
      const x = signal[start + minLag - 1 + n] ?? 0;
      lagged += x * x;
    }
    let best = 0;
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      if (lag >= minLag) {
        const out = signal[start + lag - 1] ?? 0;
        const into = signal[start + lag - 1 + window] ?? 0;
        lagged += into * into - out * out;
      }
      let dot = 0;
      for (let n = 0; n < window; n++)
        dot += (signal[start + n] ?? 0) * (signal[start + n + lag] ?? 0);
      const r = lagged > 0 ? dot / Math.sqrt(energy * lagged) : 0;
      correlation[lag] = r;
      if (lag >= minLag && lag <= maxLag && r > best) best = r;
    }
    if (best < VOICING) return 0;
    // The shortest strong period, so a subharmonic (an octave low) does not win.
    for (let lag = minLag; lag <= maxLag; lag++) {
      const r = correlation[lag] ?? 0;
      if (
        r >= 0.85 * best &&
        r >= (correlation[lag - 1] ?? 0) &&
        r >= (correlation[lag + 1] ?? 0)
      ) {
        return rate / lag;
      }
    }
    return 0;
  };

  const at = (frame: number): number => {
    const cached = pitch[frame];
    if (cached === undefined) return 0;
    if (Number.isNaN(cached)) {
      const value = compute(frame);
      pitch[frame] = value;
      return value;
    }
    return cached;
  };

  /** Up to VOICE_FRAMES voiced pitches walking away from `fromMs` (backwards or forwards). */
  const pitchesNear = (fromMs: number, direction: -1 | 1): number[] => {
    const found: number[] = [];
    // Frames lie entirely on the far side of `fromMs`.
    let frame = direction < 0 ? Math.floor((fromMs - windowMs) / hopMs) : Math.ceil(fromMs / hopMs);
    while (frame >= 0 && frame < frameCount && found.length < VOICE_FRAMES) {
      const frameMs = frame * hopMs;
      const distance = direction < 0 ? fromMs - (frameMs + windowMs) : frameMs - fromMs;
      if (distance > VOICE_REACH_MS) break;
      const value = at(frame);
      if (value > 0) found.push(value);
      frame += direction;
    }
    return found;
  };

  return (pause: { startMs: number; endMs: number }): number => {
    const before = pitchesNear(pause.startMs, -1);
    const after = pitchesNear(pause.endMs, 1);
    if (before.length < MIN_VOICE_FRAMES || after.length < MIN_VOICE_FRAMES) return 0;
    const octaves = Math.abs(Math.log2(median(before) / median(after)));
    const score = (octaves - SAME_VOICE_OCTAVES) / (CHANGED_VOICE_OCTAVES - SAME_VOICE_OCTAVES);
    return Math.min(1, Math.max(0, score));
  };
}

/**
 * Finds the silences in decoded mono audio: 20 ms frames whose loudness falls below a threshold
 * set by the recording itself, in runs of at least 120 ms. Leading and trailing silence are not
 * pauses. Each pause is scored for a change of voice across it.
 */
export function findPauses(samples: Float32Array, sampleRate: number): PauseAnalysis {
  const none: PauseAnalysis = { pauses: [], soundStartMs: 0, soundEndMs: 0 };
  const frameLength = Math.round((sampleRate * FRAME_MS) / 1000);
  const frameCount = frameLength > 0 ? Math.floor(samples.length / frameLength) : 0;
  if (frameCount === 0) return none;
  // The real frame length: rounding to whole samples must not drift over a long file.
  const frameMs = (frameLength * 1000) / sampleRate;

  const rms = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    const start = frame * frameLength;
    for (let n = 0; n < frameLength; n++) {
      const x = samples[start + n] ?? 0;
      sum += x * x;
    }
    rms[frame] = Math.sqrt(sum / frameLength);
  }

  const threshold = Math.max(SILENCE_FLOOR, SILENCE_FRACTION * percentile(rms, 0.95));
  let first = -1;
  let last = -1;
  for (let frame = 0; frame < frameCount; frame++) {
    if ((rms[frame] ?? 0) >= threshold) {
      if (first < 0) first = frame;
      last = frame;
    }
  }
  if (first < 0) return none;

  const voiceChange = createPitchTrack(samples, sampleRate, threshold);
  const pauses: Pause[] = [];
  let runStart = -1;
  for (let frame = first; frame <= last; frame++) {
    const silent = (rms[frame] ?? 0) < threshold;
    if (silent && runStart < 0) runStart = frame;
    if (!silent && runStart >= 0) {
      if (frame - runStart >= MIN_PAUSE_FRAMES) {
        const pause = { startMs: runStart * frameMs, endMs: frame * frameMs };
        pauses.push({ ...pause, voiceChange: voiceChange(pause) });
      }
      runStart = -1;
    }
  }

  return { pauses, soundStartMs: first * frameMs, soundEndMs: (last + 1) * frameMs };
}

/** Weights of the alignment cost; tuned on synthetic two-voice files (see the test). */
const WEIGHTS = {
  /**
   * Distance of a break from its estimate, in average line lengths, squared. Only a tie-break:
   * the estimate can drift by more than a line, and a strong pull towards it shifts every break
   * by one. The search window below bounds the drift instead.
   */
  distance: 0.005,
  /** A line's length off its character-count expectation, in units of its slack, squared. */
  lineLength: 0.4,
  /** Pause length relative to the typical join (capped at 1.5). */
  pauseLength: 1,
  /** Change of voice across the pause (0 to 1). */
  voice: 1.5,
} as const;
/** A break is never looked for further than this many average line lengths from its estimate... */
const SEARCH_LINES = 4;
/** ...and the alignment is rejected when breaks sit this far from their estimates on average. */
const IMPLAUSIBLE_LINES = 2;

/**
 * Times the lines by choosing one pause for each break between lines, in order and each pause at
 * most once, by dynamic programming over (break, pause). Lines run from the end of one chosen
 * pause to the start of the next; the first starts at the first sound, the last ends at the last.
 *
 * Only the lines' text and speakers are used: the expected breaks come from character counts
 * spread over the sound. Returns null when there are not enough pauses or the best alignment
 * strays implausibly far from the estimate.
 */
export function alignLinesToPauses(
  lines: readonly ReaderLine[],
  analysis: PauseAnalysis
): ReaderLine[] | null {
  const { pauses, soundStartMs, soundEndMs } = analysis;
  const lineCount = lines.length;
  const span = soundEndMs - soundStartMs;
  if (lineCount === 0 || span <= 0) return null;
  if (lineCount === 1) {
    const only = lines[0] as ReaderLine;
    return [{ speaker: only.speaker, text: only.text, startMs: soundStartMs, endMs: soundEndMs }];
  }

  const breaks = lineCount - 1;
  const pauseCount = pauses.length;
  if (pauseCount < breaks) return null;

  // Expected position of each line start (index lineCount is the end of the sound).
  const totalChars = lines.reduce((sum, line) => sum + Math.max(1, line.text.length), 0);
  const expected = new Float64Array(lineCount + 1);
  let chars = 0;
  for (let i = 0; i <= lineCount; i++) {
    expected[i] = soundStartMs + (span * chars) / totalChars;
    chars += Math.max(1, lines[i]?.text.length ?? 0);
  }
  const averageLine = span / lineCount;

  const mids = pauses.map((pause) => (pause.startMs + pause.endMs) / 2);
  const lengths = pauses.map((pause) => pause.endMs - pause.startMs);
  // The typical join: the median of the longest `breaks` pauses.
  const typicalJoin = median([...lengths].sort((a, b) => b - a).slice(0, breaks)) || 1;
  const reward = pauses.map(
    (pause, j) =>
      WEIGHTS.pauseLength * Math.min(1.5, (lengths[j] ?? 0) / typicalJoin) +
      WEIGHTS.voice * pause.voiceChange
  );

  // A line's length should follow its characters, give or take a fifth plus 0.8 s of pauses.
  const lineLengthCost = (line: number, fromMs: number, toMs: number): number => {
    const want = (expected[line + 1] ?? 0) - (expected[line] ?? 0);
    const slack = 0.2 * want + 800;
    const off = (toMs - fromMs - want) / slack;
    return WEIGHTS.lineLength * off * off;
  };

  // Candidates for each break: pauses within SEARCH_LINES of its estimate (pause indices, sorted).
  const candidates: number[][] = [];
  for (let b = 0; b < breaks; b++) {
    const target = expected[b + 1] ?? 0;
    const list: number[] = [];
    for (let j = 0; j < pauseCount; j++) {
      if (Math.abs((mids[j] ?? 0) - target) <= SEARCH_LINES * averageLine) list.push(j);
    }
    if (list.length === 0) return null;
    candidates.push(list);
  }

  // cost[b][c]: the cheapest alignment of breaks 0..b with break b at candidates[b][c].
  const cost: Float64Array[] = [];
  const from: Int32Array[] = [];
  for (let b = 0; b < breaks; b++) {
    const list = candidates[b] as number[];
    const target = expected[b + 1] ?? 0;
    const here = new Float64Array(list.length).fill(Number.POSITIVE_INFINITY);
    const back = new Int32Array(list.length).fill(-1);
    for (let c = 0; c < list.length; c++) {
      const j = list[c] as number;
      const mid = mids[j] ?? 0;
      const distance = (mid - target) / averageLine;
      const unary = WEIGHTS.distance * distance * distance - (reward[j] ?? 0);
      if (b === 0) {
        here[c] = unary + lineLengthCost(0, soundStartMs, mid);
        continue;
      }
      const previous = candidates[b - 1] as number[];
      const previousCost = cost[b - 1] as Float64Array;
      for (let p = 0; p < previous.length; p++) {
        const k = previous[p] as number;
        if (k >= j) break;
        const total =
          (previousCost[p] ?? Number.POSITIVE_INFINITY) +
          lineLengthCost(b, mids[k] ?? 0, mid) +
          unary;
        if (total < (here[c] ?? Number.POSITIVE_INFINITY)) {
          here[c] = total;
          back[c] = p;
        }
      }
    }
    cost.push(here);
    from.push(back);
  }

  const lastList = candidates[breaks - 1] as number[];
  const lastCost = cost[breaks - 1] as Float64Array;
  let bestTotal = Number.POSITIVE_INFINITY;
  let best = -1;
  for (let c = 0; c < lastList.length; c++) {
    const total =
      (lastCost[c] ?? Number.POSITIVE_INFINITY) +
      lineLengthCost(lineCount - 1, mids[lastList[c] as number] ?? 0, soundEndMs);
    if (total < bestTotal) {
      bestTotal = total;
      best = c;
    }
  }
  if (best < 0 || !Number.isFinite(bestTotal)) return null;

  const chosen = new Array<number>(breaks);
  for (let b = breaks - 1, c = best; b >= 0; b--) {
    chosen[b] = (candidates[b] as number[])[c] as number;
    c = (from[b] as Int32Array)[c] ?? -1;
  }

  let drift = 0;
  for (let b = 0; b < breaks; b++) {
    drift += Math.abs((mids[chosen[b] as number] ?? 0) - (expected[b + 1] ?? 0)) / averageLine;
  }
  if (drift / breaks > IMPLAUSIBLE_LINES) return null;

  return lines.map((line, i) => ({
    speaker: line.speaker,
    text: line.text,
    startMs: i === 0 ? soundStartMs : (pauses[chosen[i - 1] as number]?.endMs ?? 0),
    endMs: i === lineCount - 1 ? soundEndMs : (pauses[chosen[i] as number]?.startMs ?? 0),
  }));
}

/** Splits the transcript into lines and times them against decoded mono audio. */
export function alignTranscriptToAudio(
  transcript: string,
  samples: Float32Array,
  sampleRate: number
): ReaderLine[] | null {
  const lines = estimateLines(transcript, samples.length / sampleRate);
  if (lines.length === 0) return null;
  return alignLinesToPauses(lines, findPauses(samples, sampleRate));
}
