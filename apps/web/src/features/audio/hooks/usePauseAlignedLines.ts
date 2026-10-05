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

/**
 * Finished alignments by key (audio URL plus transcript). null when retrying cannot help: the
 * audio downloaded but would not decode or align.
 */
const finished = new Map<string, ReaderLine[] | null>();

interface Job {
  promise: Promise<ReaderLine[] | null>;
  controller: AbortController;
  users: number;
}
/** Alignments in flight, shared by every player of the same audio (the notebook mounts two). */
const inFlight = new Map<string, Job>();

type OfflineContextConstructor = new (
  channels: number,
  length: number,
  sampleRate: number
) => OfflineAudioContext;

/** The Web Audio offline context, prefixed on older Safari; null where there is none. */
function offlineContextConstructor(): OfflineContextConstructor | null {
  const scope = globalThis as typeof globalThis & {
    webkitOfflineAudioContext?: OfflineContextConstructor;
  };
  return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext ?? null;
}

/** djb2 over the text: a cheap fingerprint so an edited transcript is aligned afresh. */
function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

async function decode(
  Context: OfflineContextConstructor,
  data: ArrayBuffer
): Promise<{ samples: Float32Array; sampleRate: number }> {
  let context: OfflineAudioContext;
  try {
    context = new Context(1, 1, DECODE_RATE);
  } catch {
    context = new Context(1, 1, FALLBACK_RATE);
  }
  const buffer = await context.decodeAudioData(data);
  return { samples: buffer.getChannelData(0), sampleRate: buffer.sampleRate };
}

function joinJob(
  key: string,
  url: string,
  transcript: string,
  Context: OfflineContextConstructor
): Job {
  const existing = inFlight.get(key);
  if (existing) {
    existing.users++;
    return existing;
  }

  const controller = new AbortController();
  const { signal } = controller;
  // Network and HTTP failures may pass; once the audio is downloaded, a failure is for good.
  let downloaded = false;
  const run = async (): Promise<ReaderLine[] | null> => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Audio request failed with HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    downloaded = true;
    const { samples, sampleRate } = await decode(Context, data);
    signal.throwIfAborted();
    return alignTranscriptToAudio(transcript, samples, sampleRate);
  };

  const job: Job = { controller, users: 1, promise: Promise.resolve(null) };
  job.promise = run()
    .then(
      (lines) => {
        finished.set(key, lines);
        if (!lines) {
          console.warn("Could not match the transcript to the audio's pauses; keeping estimates.");
        }
        return lines;
      },
      (error: unknown) => {
        if (!signal.aborted) {
          if (downloaded) finished.set(key, null);
          console.warn("Could not analyse the audio to sync the transcript.", error);
        }
        throw error;
      }
    )
    .finally(() => {
      if (inFlight.get(key) === job) inFlight.delete(key);
    });
  // Every user may have left before it settles; an abort is not an unhandled error.
  job.promise.catch(() => undefined);
  inFlight.set(key, job);
  return job;
}

function leaveJob(key: string, job: Job): void {
  job.users--;
  // Strict mode unmounts and remounts at once: let it rejoin before cancelling.
  queueMicrotask(() => {
    if (job.users > 0 || inFlight.get(key) !== job) return;
    inFlight.delete(key);
    job.controller.abort();
  });
}

/**
 * Times an older overview's transcript to its audio: downloads and decodes the whole file, finds
 * the pauses between lines and matches them to the transcript (see `alignToPauses`). Results are
 * cached for the session by URL and transcript, so reopening an overview is instant.
 *
 * Any failure (Web Audio missing, network, CORS, decoding, an implausible alignment) warns once
 * and reports `failed`; the caller keeps its estimate. Enable it only when there are no saved
 * timings, there is more than one line, and the download is worth it (see `AudioPlayer`).
 */
export function usePauseAlignedLines(
  audioUrl: string | null,
  transcript: string,
  enabled: boolean
): PauseAlignment {
  const Context = offlineContextConstructor();
  const active = enabled && !!audioUrl && Context !== null;
  const key = active ? `${audioUrl}|${transcript.length}|${hashText(transcript)}` : null;
  const [settled, setSettled] = useState<{ key: string; lines: ReaderLine[] | null } | null>(null);

  useEffect(() => {
    if (!key || !audioUrl || !Context || finished.has(key)) return;
    let live = true;
    const job = joinJob(key, audioUrl, transcript, Context);
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
    // The key already changes with the URL and transcript, and the constructor is a fixed global.
  }, [key, audioUrl, transcript, Context]);

  if (enabled && audioUrl && !Context) return FAILED;
  if (!key) return IDLE;
  const lines = finished.has(key)
    ? (finished.get(key) ?? null)
    : settled?.key === key
      ? settled.lines
      : undefined;
  if (lines === undefined) return ALIGNING;
  return lines ? { lines, status: "aligned" } : FAILED;
}
