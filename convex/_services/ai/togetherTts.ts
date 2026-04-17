"use node";

import Together from "together-ai";
import { env } from "../../_lib/env";

export function createTogetherTtsClient(): Together {
  const apiKey = env.TOGETHER_AI_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_AI_API_KEY is not set");
  }
  return new Together({ apiKey });
}

/**
 * Non-streaming REST TTS via Together `/v1/audio/speech` (Kokoro, Orpheus, etc.).
 */
export async function synthesizeSpeechToBuffer(
  client: Together,
  params: {
    model: string;
    input: string;
    voice: string;
    timeoutMs: number;
  }
): Promise<Buffer> {
  const { model, input, voice, timeoutMs } = params;
  const response = await Promise.race([
    client.audio.speech.create({
      model,
      input,
      voice,
      response_format: "mp3",
      sample_rate: 24000,
      language: "en",
      stream: false,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TTS timeout")), timeoutMs)
    ),
  ]);
  return Buffer.from(await response.arrayBuffer());
}
