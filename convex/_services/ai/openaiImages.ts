"use node";

import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { ExternalServiceError } from "../../_lib/errors";

const IMAGE_GENERATION_ENDPOINT = "/v1/images/generations";
const IMAGE_GENERATION_TIMEOUT_MS = 180_000;

/** Pull `error.code` (or `error.type` when code is null) out of an OpenAI error body. */
function parseProviderCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; type?: unknown } };
    const code = parsed.error?.code ?? parsed.error?.type;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Non-2xx response from the image endpoint. OpenAI puts a long `message`
 * before `code` in its error body, so the code is parsed from the full body
 * rather than searched for in the (truncated) error message.
 */
export class OpenAIImageError extends ExternalServiceError {
  /** OpenAI's error code, e.g. "moderation_blocked", "insufficient_quota". */
  providerCode?: string;

  constructor(status: number, body: string) {
    const providerCode = parseProviderCode(body);
    const message = `openai HTTP ${status}${providerCode ? ` (${providerCode})` : ""}: ${body.slice(0, 200)}`;
    super("openai", message, {
      statusCode: status,
      endpoint: IMAGE_GENERATION_ENDPOINT,
      // An exhausted quota comes back as 429 but won't succeed on retry.
      retryable: providerCode === "insufficient_quota" ? false : undefined,
    });
    this.name = "OpenAIImageError";
    this.providerCode = providerCode;
  }
}

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
        throw new OpenAIImageError(response.status, await response.text());
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
  const code = error instanceof OpenAIImageError ? error.providerCode : undefined;

  if (code === "moderation_blocked" || code === "content_policy_violation") {
    return "The image request was blocked by the provider's safety filter. Try different sources or adjust your custom prompt.";
  }
  if (status === 429 && code !== "insufficient_quota") {
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
