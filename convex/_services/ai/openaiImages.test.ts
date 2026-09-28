import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalServiceError } from "../../_lib/errors";
import {
  callOpenAIImageGeneration,
  describeImageGenerationError,
  OpenAIImageError,
} from "./openaiImages";

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47];

// Real OpenAI error bodies put a long `message` before `type`/`code`, so the
// code sits past the first 200 characters. Keep these full length.
function openAIErrorBody(message: string, type: string, code: string | null): string {
  return JSON.stringify({ error: { message, type, param: null, code } });
}

const MODERATION_BODY = openAIErrorBody(
  "Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID req_0123456789abcdef0123456789abcdef.",
  "image_generation_user_error",
  "moderation_blocked"
);
const QUOTA_BODY = openAIErrorBody(
  "You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.",
  "insufficient_quota",
  "insufficient_quota"
);
const RATE_LIMIT_BODY = openAIErrorBody(
  "Rate limit reached for gpt-image-2 in organization org-0123456789abcdef on images per minute (IPM): Limit 5, Used 5, Requested 1. Please try again in 12s. Visit https://platform.openai.com/account/rate-limits to learn more.",
  "requests",
  "rate_limit_exceeded"
);
const UNVERIFIED_ORG_BODY = openAIErrorBody(
  "Your organization must be verified to use the model `gpt-image-2`. Please go to: https://platform.openai.com/settings/organization/general and click on Verify Organization. If you just verified, it can take up to 15 minutes for access to propagate.",
  "invalid_request_error",
  null
);

function okResponse(b64: string | undefined) {
  const body = { created: 1, data: b64 === undefined ? [] : [{ b64_json: b64 }] };
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
}

function errorResponse(status: number, body: string) {
  return { ok: false, status, text: async () => body, json: async () => JSON.parse(body) };
}

describe("callOpenAIImageGeneration", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts model, prompt, and size to OpenAI and decodes the base64 image", async () => {
    fetchMock.mockResolvedValue(okResponse(Buffer.from(PNG_BYTES).toString("base64")));

    const bytes = await callOpenAIImageGeneration({
      apiKey: "test-key",
      model: "gpt-image-2",
      prompt: "An infographic",
      size: "1536x1024",
    });

    expect(Array.from(bytes)).toEqual(PNG_BYTES);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({
      model: "gpt-image-2",
      prompt: "An infographic",
      size: "1536x1024",
      n: 1,
      output_format: "png",
    });
  });

  it("throws a non-retryable ExternalServiceError on 403 without retrying", async () => {
    fetchMock.mockResolvedValue(errorResponse(403, UNVERIFIED_ORG_BODY));

    const promise = callOpenAIImageGeneration({
      apiKey: "test-key",
      model: "gpt-image-2",
      prompt: "x",
      size: "1024x1024",
    });

    await expect(promise).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(promise).rejects.toMatchObject({ statusCode: 403, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads the provider code from a full-length error body", async () => {
    fetchMock.mockResolvedValue(errorResponse(400, MODERATION_BODY));

    const error = await callOpenAIImageGeneration({
      apiKey: "test-key",
      model: "gpt-image-2",
      prompt: "x",
      size: "1024x1024",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OpenAIImageError);
    expect(error).toMatchObject({ statusCode: 400, providerCode: "moderation_blocked" });
  });

  it("does not retry a 429 caused by exhausted quota", async () => {
    fetchMock.mockResolvedValue(errorResponse(429, QUOTA_BODY));

    const error = await callOpenAIImageGeneration({
      apiKey: "test-key",
      model: "gpt-image-2",
      prompt: "x",
      size: "1024x1024",
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ providerCode: "insufficient_quota", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the response has no image data", async () => {
    fetchMock.mockResolvedValue(okResponse(undefined));

    await expect(
      callOpenAIImageGeneration({
        apiKey: "test-key",
        model: "gpt-image-2",
        prompt: "x",
        size: "1024x1024",
      })
    ).rejects.toThrow(/no image data/i);
  });
});

describe("OpenAIImageError", () => {
  it("falls back to error.type when error.code is null", () => {
    expect(new OpenAIImageError(403, UNVERIFIED_ORG_BODY).providerCode).toBe(
      "invalid_request_error"
    );
  });

  it("leaves providerCode undefined for a non-JSON body", () => {
    const error = new OpenAIImageError(502, "<html>Bad Gateway</html>");
    expect(error.providerCode).toBeUndefined();
    expect(error.retryable).toBe(true);
  });
});

describe("describeImageGenerationError", () => {
  it("explains content-policy blocks without exposing provider JSON", () => {
    const message = describeImageGenerationError(new OpenAIImageError(400, MODERATION_BODY));
    expect(message).toMatch(/safety/i);
    expect(message).not.toContain("{");
  });

  it("reports auth/permission failures as a service configuration problem", () => {
    for (const status of [401, 403]) {
      const message = describeImageGenerationError(
        new OpenAIImageError(status, UNVERIFIED_ORG_BODY)
      );
      expect(message).toMatch(/unavailable/i);
      expect(message).not.toContain("{");
    }
  });

  it("reports a missing API key as a service configuration problem", () => {
    const error = new ExternalServiceError("openai", "OPENAI_API_KEY is not set", {
      statusCode: 401,
      retryable: false,
    });
    expect(describeImageGenerationError(error)).toMatch(/unavailable/i);
  });

  it("reports rate limits as busy", () => {
    expect(describeImageGenerationError(new OpenAIImageError(429, RATE_LIMIT_BODY))).toMatch(
      /busy/i
    );
  });

  it("reports exhausted quota as unavailable rather than busy", () => {
    const message = describeImageGenerationError(new OpenAIImageError(429, QUOTA_BODY));
    expect(message).toMatch(/unavailable/i);
  });

  it("reports server errors as temporary", () => {
    expect(describeImageGenerationError(new OpenAIImageError(503, "overloaded"))).toMatch(
      /try again/i
    );
  });

  it("passes through messages from non-provider errors", () => {
    expect(describeImageGenerationError(new Error("No content found in selected sources"))).toBe(
      "No content found in selected sources"
    );
  });
});
