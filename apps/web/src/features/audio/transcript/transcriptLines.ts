/** One line of the transcript with the window of audio it is spoken in. */
export interface ReaderLine {
  speaker: "host_a" | "host_b" | null;
  text: string;
  startMs: number;
  endMs: number;
}

export interface ResolvedReaderLines {
  lines: ReaderLine[];
  /** True when the timings are estimated from character counts rather than saved at generation. */
  approximate: boolean;
  /**
   * False only for an estimate made before the duration is known: every line then sits at 0, so
   * no line can be said to be current. Saved lines are always timed.
   */
  timed: boolean;
}

function isSpeaker(value: unknown): value is "host_a" | "host_b" {
  return value === "host_a" || value === "host_b";
}

/** Returns the lines if every one is well formed and starts never go backwards, else null. */
function parseSavedLines(value: unknown): ReaderLine[] | null {
  if (!Array.isArray(value)) return null;

  const lines: ReaderLine[] = [];
  let previousStart = 0;
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const { speaker, text, startMs, endMs } = entry as Record<string, unknown>;
    if (!isSpeaker(speaker) || typeof text !== "string") return null;
    if (typeof startMs !== "number" || typeof endMs !== "number") return null;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    if (startMs < 0 || endMs < startMs || startMs < previousStart) return null;
    previousStart = startMs;
    lines.push({ speaker, text, startMs, endMs });
  }
  return lines;
}

/** Spreads the duration over the non-empty lines in proportion to their character counts. */
export function estimateLines(transcript: string, durationSec: number): ReaderLine[] {
  const texts = transcript
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (texts.length === 0) return [];

  const durationMs = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : 0;
  const totalChars = texts.reduce((sum, text) => sum + text.length, 0);

  let charsBefore = 0;
  return texts.map((text) => {
    const startMs = Math.round((charsBefore / totalChars) * durationMs);
    charsBefore += text.length;
    const endMs = Math.round((charsBefore / totalChars) * durationMs);
    return { speaker: null, text, startMs, endMs };
  });
}

/**
 * The lines the reader shows: the timings saved at generation (`metadata.lines`) when they are
 * valid, otherwise an estimate from the transcript text, flagged `approximate`. Malformed saved
 * lines warn once and fall back; absent ones fall back quietly (older overviews).
 *
 * Wrap the call in `useMemo`: the estimate depends on the audio duration, which is 0 until the
 * audio has loaded, and the result is a new array on every call.
 */
export function resolveReaderLines(
  metadata: unknown,
  transcript: string,
  durationSec: number
): ResolvedReaderLines {
  const raw =
    typeof metadata === "object" && metadata !== null
      ? (metadata as { lines?: unknown }).lines
      : undefined;

  const absent = raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0);
  if (!absent) {
    const saved = parseSavedLines(raw);
    if (saved) return { lines: saved, approximate: false, timed: true };
    console.warn("Audio overview has malformed saved line timings; estimating them instead.");
  }

  const hasDuration = Number.isFinite(durationSec) && durationSec > 0;
  return {
    lines: estimateLines(transcript, durationSec),
    approximate: true,
    timed: hasDuration,
  };
}

/**
 * Index of the line being spoken at `timeMs`: the last line whose start is at or before it, so
 * the silence after a line still belongs to that line. -1 before the first line starts.
 */
export function activeLineIndex(lines: readonly ReaderLine[], timeMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((lines[mid]?.startMs ?? Number.POSITIVE_INFINITY) <= timeMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** The line to highlight now, or -1 when there is none (before the first line, or untimed). */
export function currentLineIndex(resolved: ResolvedReaderLines, timeMs: number): number {
  return resolved.timed ? activeLineIndex(resolved.lines, timeMs) : -1;
}
