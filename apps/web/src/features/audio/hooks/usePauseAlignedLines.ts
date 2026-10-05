import { useEffect, useState } from "react";
import { alignTranscriptToAudio } from "../transcript/alignToPauses";
import type { ReaderLine } from "../transcript/transcriptLines";

export interface PauseAlignment {
  /** The transcript lines timed to the audio's pauses, once aligned. */
  lines: ReaderLine[] | null;
  status: "idle" | "aligning" | "aligned" | "failed";
}

/** 8 kHz is plenty to find pauses and pitch, and keeps 13 minutes to about 25 MB of samples. */
const DECODE_RATE = 8000;
/** For browsers whose OfflineAudioContext refuses 8 kHz. */
const FALLBACK_RATE = 22050;

const IDLE: PauseAlignment = { lines: null, status: "idle" };
const ALIGNING: PauseAlignment = { lines: null, status: "aligning" };
const FAILED: PauseAlignment = { lines: null, status: "failed" };

/** Finished alignments by audio URL; null when the audio decoded but would not align. */
const finished = new Map<string, ReaderLine[] | null>();

interface Job {
  promise: Promise<ReaderLine[] | null>;
  controller: AbortController;
  users: number;
}
/** Alignments in flight, shared by every player of the same audio (the notebook mounts two). */
const inFlight = new Map<string, Job>();

async function decode(data: ArrayBuffer): Promise<{ samples: Float32Array; sampleRate: number }> {
  let context: OfflineAudioContext;
  try {
    context = new OfflineAudioContext(1, 1, DECODE_RATE);
  } catch {
    context = new OfflineAudioContext(1, 1, FALLBACK_RATE);
  }
  const buffer = await context.decodeAudioData(data);
  return { samples: buffer.getChannelData(0), sampleRate: buffer.sampleRate };
}

async function align(
  url: string,
  transcript: string,
  signal: AbortSignal
): Promise<ReaderLine[] | null> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Audio request failed with HTTP ${response.status}`);
  const { samples, sampleRate } = await decode(await response.arrayBuffer());
  signal.throwIfAborted();
  return alignTranscriptToAudio(transcript, samples, sampleRate);
}

function joinJob(url: string, transcript: string): Job {
  const existing = inFlight.get(url);
  if (existing) {
    existing.users++;
    return existing;
  }

  const controller = new AbortController();
  const job: Job = { controller, users: 1, promise: Promise.resolve(null) };
  job.promise = align(url, transcript, controller.signal)
    .then(
      (lines) => {
        finished.set(url, lines);
        if (!lines) {
          console.warn("Could not match the transcript to the audio's pauses; keeping estimates.");
        }
        return lines;
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn("Could not analyse the audio to sync the transcript.", error);
        }
        throw error;
      }
    )
    .finally(() => {
      if (inFlight.get(url) === job) inFlight.delete(url);
    });
  // Every user may have left before it settles; an abort is not an unhandled error.
  job.promise.catch(() => undefined);
  inFlight.set(url, job);
  return job;
}

function leaveJob(url: string, job: Job): void {
  job.users--;
  // Strict mode unmounts and remounts at once: let it rejoin before cancelling.
  queueMicrotask(() => {
    if (job.users > 0 || inFlight.get(url) !== job) return;
    inFlight.delete(url);
    job.controller.abort();
  });
}

/**
 * Times an older overview's transcript to its audio: fetches and decodes the audio, finds the
 * pauses between lines and matches them to the transcript (see `alignToPauses`). Results are
 * cached by URL for the session, so reopening an overview is instant. Any failure (network,
 * CORS, decoding, an implausible alignment) warns once and reports `failed`; the caller keeps its
 * estimate. Enable it only when there are no saved timings and more than one line.
 */
export function usePauseAlignedLines(
  audioUrl: string | null,
  transcript: string,
  enabled: boolean
): PauseAlignment {
  const key = enabled && audioUrl ? audioUrl : null;
  const [settled, setSettled] = useState<{ key: string; lines: ReaderLine[] | null } | null>(null);

  useEffect(() => {
    if (!key || finished.has(key)) return;
    let live = true;
    const job = joinJob(key, transcript);
    job.promise.then(
      (lines) => {
        if (live) setSettled({ key, lines });
      },
      () => {
        if (live) setSettled({ key, lines: null });
      }
    );
    return () => {
      live = false;
      leaveJob(key, job);
    };
  }, [key, transcript]);

  if (!key) return IDLE;
  const lines = finished.has(key)
    ? (finished.get(key) ?? null)
    : settled?.key === key
      ? settled.lines
      : undefined;
  if (lines === undefined) return ALIGNING;
  return lines ? { lines, status: "aligned" } : FAILED;
}
