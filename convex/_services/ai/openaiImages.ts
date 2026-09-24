"use node";

import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse, ExternalServiceError } from "../../_lib/errors";

const IMAGE_GENERATION_ENDPOINT = "/v1/images/generations";
const IMAGE_GENERATION_TIMEOUT_MS = 180_000;

export interface OpenAIImageGenerationParams {
  apiKey: string;
  model: string;
  prompt: string;
  /** One of the GPT image model sizes: "1024x1024", "1536x1024", "1024x1536". */
  size: string;
}

/**
 * Call OpenAI's image generation endpoint and return the decoded PNG bytes.
 * GPT image models always respond with base64 (no URL format), so there is
 * no second fetch. 4xx responses are non-retryable and surface immediately.
 */
export async function callOpenAIImageGeneration(
  params: OpenAIImageGenerationParams
): Promise<Uint8Array> {
  const { apiKey, model, prompt, size } = params;

  return await invokeWithHttpRetry(
    async () => {
      const response = await fetch(`https://api.openai.com${IMAGE_GENERATION_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, n: 1, output_format: "png" }),
        signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw createExternalServiceErrorFromResponse(
          "openai",
          response.status,
          IMAGE_GENERATION_ENDPOINT,
          errBody.slice(0, 400)
        );
      }

      const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error("OpenAI returned no image data");
      }
      return Uint8Array.from(Buffer.from(b64, "base64"));
    },
    "openai_image_generation",
    { maxAttempts: 2, baseDelayMs: 2000 }
  );
}

/**
 * Turn a generation failure into a message fit for the studio UI. Provider
 * errors carry raw JSON bodies; users get a plain explanation instead (the
 * raw error is still logged and stored separately for debugging).
 */
export function describeImageGenerationError(error: unknown): string {
  if (!(error instanceof ExternalServiceError)) {
    return error instanceof Error ? error.message : "Unknown error";
  }

  const status = error.statusCode;
  const detail = error.message.toLowerCase();

  if (detail.includes("moderation_blocked") || detail.includes("content_policy")) {
    return "The image request was blocked by the provider's safety filter. Try different sources or adjust your custom prompt.";
  }
  if (status === 429 && !detail.includes("insufficient_quota")) {
    return "The image generation service is busy right now. Please try again in a few minutes.";
  }
  if (status === 401 || status === 403 || status === 429) {
    return "Infographic generation is currently unavailable due to a service configuration issue. Please try again later or contact support.";
  }
  if (status !== undefined && status >= 500) {
    return "The image generation service had a temporary problem. Please try again.";
  }
  return "Infographic generation failed. Please try again.";
}
