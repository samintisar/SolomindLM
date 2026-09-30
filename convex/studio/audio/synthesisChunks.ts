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
