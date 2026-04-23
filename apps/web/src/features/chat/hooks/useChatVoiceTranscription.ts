import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type ChatVoiceState = "idle" | "recording" | "transcribing";

/** Stay under AudioTranscriptionService 120s HTTP timeout; leave margin for upload + action. */
const MAX_RECORDING_MS = 90_000;

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
  const recordingStartRef = useRef<number>(0);
  const voiceStateRef = useRef<ChatVoiceState>("idle");
  const stopAndUploadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  const clearRecordingTimers = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const stopMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const resetRecording = useCallback(() => {
    clearRecordingTimers();
    setElapsedMs(0);
    recordingStartRef.current = 0;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    mimeTypeRef.current = null;
  }, [clearRecordingTimers]);

  const stopAndUpload = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || voiceStateRef.current !== "recording") {
      return;
    }

    clearRecordingTimers();

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

    stopMediaStream();
    voiceStateRef.current = "transcribing";
    setVoiceState("transcribing");

    const mimeType = mimeTypeRef.current || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (blob.size < 1) {
      onError("No audio captured. Try again.");
      voiceStateRef.current = "idle";
      setVoiceState("idle");
      resetRecording();
      return;
    }

    if (!notebookId) {
      onError("No notebook selected");
      voiceStateRef.current = "idle";
      setVoiceState("idle");
      resetRecording();
      return;
    }

    try {
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
      const { text } = await transcribeChatAudio({
        storageId: storageId as Id<"_storage">,
        notebookId,
      });
      if (text.trim()) {
        onTranscribed(text);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Transcription failed";
      onError(message);
    } finally {
      voiceStateRef.current = "idle";
      setVoiceState("idle");
      resetRecording();
    }
  }, [
    generateUploadUrl,
    transcribeChatAudio,
    notebookId,
    onError,
    onTranscribed,
    resetRecording,
    stopMediaStream,
    clearRecordingTimers,
  ]);

  useEffect(() => {
    stopAndUploadRef.current = stopAndUpload;
  }, [stopAndUpload]);

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

    recordingStartRef.current = Date.now();
    setElapsedMs(0);
    voiceStateRef.current = "recording";
    setVoiceState("recording");

    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - recordingStartRef.current);
    }, 200);

    maxDurationTimerRef.current = setTimeout(() => {
      if (voiceStateRef.current === "recording" && stopAndUploadRef.current) {
        void stopAndUploadRef.current();
      }
    }, MAX_RECORDING_MS);

    try {
      recorder.start();
    } catch {
      clearRecordingTimers();
      stopMediaStream();
      onError("Could not start recording");
      setVoiceState("idle");
      resetRecording();
    }
  }, [disabled, notebookId, onError, clearRecordingTimers, stopMediaStream, resetRecording]);

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
    return () => {
      clearRecordingTimers();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      stopMediaStream();
    };
  }, [clearRecordingTimers, stopMediaStream]);

  return {
    voiceState,
    formatElapsed: formatElapsed(elapsedMs),
    toggleRecording,
  };
}
