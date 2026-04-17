"use node";

import { env } from "../../_lib/env";

/** Together TTS voice IDs (Kokoro by default); override via AUDIO_VOICE_HOST_* env. */
export const VOICES = {
  host_a: env.AUDIO_VOICE_HOST_A,
  host_b: env.AUDIO_VOICE_HOST_B,
} as const;
