"use node"

import { env } from '../../_lib/env';

/** Voice configuration (OpenAI TTS-1) */
export const VOICES = {
  host_a: env.AUDIO_VOICE_HOST_A,
  host_b: env.AUDIO_VOICE_HOST_B,
} as const;
