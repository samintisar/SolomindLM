"use node";

import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

/**
 * AudioTranscriptionService — transcribes audio files using Together AI's
 * Whisper large v3 model. Follows the same pattern as MistralOCRService.
 *
 * Supported formats: .wav, .mp3, .m4a, .webm, .flac
 */

export class AudioTranscriptionService {
  private apiKey: string;
  private baseUrl = "https://api.together.xyz/v1";
  private model = "openai/whisper-large-v3";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(fileUrl: string): Promise<string> {
    const logger = createServiceLogger("together", "audioTranscribe");
    logger.operationStart({ model: this.model });

    try {
      const text = await invokeWithHttpRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);
        try {
          const t0 = Date.now();
          logger.apiCall("together", "/audio/transcriptions", {});

          const formData = new FormData();
          formData.append("file", fileUrl);
          formData.append("model", this.model);
          formData.append("response_format", "json");

          const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: formData,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const data = await response.json();

          if (!response.ok) {
            const details = data ? JSON.stringify(data) : response.statusText;
            logger.apiError("together", "/audio/transcriptions", new Error(`HTTP ${response.status}`));
            throw createExternalServiceErrorFromResponse(
              "together",
              response.status,
              "/audio/transcriptions",
              details.slice(0, 400)
            );
          }

          logger.apiSuccess("together", "/audio/transcriptions", Date.now() - t0, {});

          const out = data.text;
          if (!out || typeof out !== "string" || out.trim().length === 0) {
            throw new Error("Audio transcription returned empty text");
          }
          return out as string;
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Audio transcription request timed out", { cause: error });
          }
          throw error;
        }
      }, "together_transcribe");

      logger.operationComplete({ textChars: text.length });
      return text;
    } catch (error) {
      logger.operationError(error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to transcribe audio file", { cause: error });
    }
  }
}
