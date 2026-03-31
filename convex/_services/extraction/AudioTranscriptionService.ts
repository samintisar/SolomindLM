"use node";

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 120s — audio transcription is slower than OCR

    try {
      const formData = new FormData();
      formData.append("file", fileUrl);
      formData.append("model", this.model);
      formData.append("response_format", "json");

      const response = await fetch(
        `${this.baseUrl}/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const details = data ? JSON.stringify(data) : response.statusText;
        console.error("[AudioTranscription] API error:", {
          status: response.status,
          details,
        });
        throw new Error(`Audio transcription failed: ${details}`);
      }

      const text = data.text;
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new Error("Audio transcription returned empty text");
      }

      return text;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("Audio transcription request timed out");
        }
        throw error;
      }
      throw new Error("Failed to transcribe audio file");
    }
  }
}
