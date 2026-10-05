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
    // A chunk's MP3 can't be shorter than the lines inside it; a broken length would shift
    // every later chunk.
    if (chunk.mp3DurationMs < cursor - chunkStartMs) return null;
    chunkStartMs += chunk.mp3DurationMs;
  }
  return lines;
}
