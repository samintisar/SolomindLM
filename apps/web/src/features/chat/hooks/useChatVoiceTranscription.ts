import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type ChatVoiceState = "idle" | "recording" | "transcribing";

/** Stay under AudioTranscriptionService 120s HTTP timeout; leave margin for upload + action. */
const MAX_RECORDING_MS = 90_000;

/** Cover upload + Convex action; bail out so UI never sticks on "transcribing" if the network stalls. */
const TRANSCRIBE_CHAIN_TIMEOUT_MS = 130_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function pickRecorderMimeType(): string | null {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return null;
}

function formatElapsed(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface UseChatVoiceTranscriptionOptions {
  notebookId: Id<"notebooks"> | null | undefined;
  /** When true, mic is disabled (e.g. chat sending/streaming) */
  disabled: boolean;
  onTranscribed: (text: string) => void;
  onError: (message: string) => void;
}

export function useChatVoiceTranscription({
  notebookId,
  disabled,
  onTranscribed,
  onError,
}: UseChatVoiceTranscriptionOptions) {
  const [voiceState, setVoiceState] = useState<ChatVoiceState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const generateUploadUrl = useMutation(api.documents.index.generateUploadUrl);
  const transcribeChatAudio = useAction(api.chat.voiceTranscription.transcribeChatAudio);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Single helper that sets both the ref and React state together,
  // eliminating the fragile dual-write pattern.
  const voiceStateRef = useRef<ChatVoiceState>("idle");
  const setBoth = useCallback((s: ChatVoiceState) => {
    voiceStateRef.current = s;
    setVoiceState(s);
  }, []);

  // Stable callbacks that are safe to use in useCallback deps without causing re-creation.
  const clearTimers = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const resetRecording = useCallback(() => {
    clearTimers();
    setElapsedMs(0);
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    mimeTypeRef.current = null;
  }, [clearTimers]);

  const goToIdle = useCallback(() => {
    setBoth("idle");
    resetRecording();
  }, [setBoth, resetRecording]);

  const stopAndUpload = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || voiceStateRef.current !== "recording") {
      return;
    }

    clearTimers();

    await new Promise<void>((resolve, reject) => {
      if (recorder.state === "inactive") {
        resolve();
        return;
      }
      const onStop = () => {
        recorder.removeEventListener("stop", onStop);
        resolve();
      };
      recorder.addEventListener("stop", onStop);
      try {
        recorder.stop();
      } catch (e) {
        recorder.removeEventListener("stop", onStop);
        reject(e);
      }
    });

    stopStream();
    setBoth("transcribing");

    const mimeType = mimeTypeRef.current || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (blob.size === 0) {
      onError("No audio captured. Try again.");
      goToIdle();
      return;
    }

    if (!notebookId) {
      onError("No notebook selected");
      goToIdle();
      return;
    }

    try {
      const { text } = await withTimeout(
        (async () => {
          const uploadUrl = await generateUploadUrl();
          const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": mimeType || "application/octet-stream" },
            body: blob,
          });
          if (!uploadResponse.ok) {
            throw new Error("Failed to upload audio");
          }
          const { storageId } = (await uploadResponse.json()) as { storageId: string };
          if (!storageId) {
            throw new Error("Upload failed — unexpected response");
          }
          return transcribeChatAudio({
            storageId: storageId as Id<"_storage">,
            notebookId,
          });
        })(),
        TRANSCRIBE_CHAIN_TIMEOUT_MS,
        "Transcription took too long"
      );
      if (!mountedRef.current) return;
      if (text.trim()) {
        onTranscribed(text);
      } else {
        onError("No speech detected in the recording. Try again.");
      }
    } catch (e) {
      if (!mountedRef.current) return;
      const message = e instanceof Error ? e.message : "Transcription failed";
      onError(message);
    } finally {
      if (mountedRef.current) goToIdle();
    }
  }, [
    generateUploadUrl,
    transcribeChatAudio,
    notebookId,
    onError,
    onTranscribed,
    goToIdle,
    stopStream,
    clearTimers,
  ]);

  const startRecording = useCallback(async () => {
    if (disabled || !notebookId || voiceStateRef.current !== "idle") {
      return;
    }

    const mimeType = pickRecorderMimeType();
    if (!mimeType) {
      onError("No supported audio format in this browser");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        onError("Microphone permission denied");
      } else {
        onError("Could not access microphone");
      }
      return;
    }

    mediaStreamRef.current = stream;
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    setBoth("recording");
    setElapsedMs(0);

    let elapsed = 0;
    elapsedTimerRef.current = setInterval(() => {
      elapsed += 200;
      setElapsedMs(elapsed);
    }, 200);

    maxDurationTimerRef.current = setTimeout(() => {
      if (voiceStateRef.current === "recording") {
        void stopAndUpload();
      }
    }, MAX_RECORDING_MS);

    try {
      recorder.start();
    } catch {
      clearTimers();
      stopStream();
      onError("Could not start recording");
      goToIdle();
    }
  }, [disabled, notebookId, onError, clearTimers, stopStream, goToIdle, setBoth, stopAndUpload]);

  const toggleRecording = useCallback(async () => {
    if (disabled || !notebookId) {
      return;
    }
    if (voiceState === "transcribing") {
      return;
    }
    if (voiceState === "idle") {
      void startRecording();
      return;
    }
    if (voiceState === "recording") {
      void stopAndUpload();
    }
  }, [disabled, notebookId, voiceState, startRecording, stopAndUpload]);

  useEffect(() => {
    // Must reset on mount: Strict Mode runs cleanup then remount; without this, `mountedRef`
    // stays false and `stopAndUpload`'s `finally` skips `goToIdle()`, leaving the mic stuck on
    // "transcribing" forever.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      stopStream();
    };
  }, [clearTimers, stopStream]);

  return {
    voiceState,
    formatElapsed: formatElapsed(elapsedMs),
    toggleRecording,
  };
}
