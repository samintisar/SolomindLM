import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalServiceError } from "../../_lib/errors";
import { callOpenAIImageGeneration, describeImageGenerationError } from "./openaiImages";

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47];

function okResponse(b64: string | undefined) {
  const body = { created: 1, data: b64 === undefined ? [] : [{ b64_json: b64 }] };
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
}

function errorResponse(status: number, code: string, message: string) {
  const body = JSON.stringify({ error: { message, type: "invalid_request_error", code } });
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
    fetchMock.mockResolvedValue(
      errorResponse(403, "unsupported_organization", "Your organization must be verified")
    );

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

describe("describeImageGenerationError", () => {
  function serviceError(status: number, body: string) {
    return new ExternalServiceError("openai", `openai HTTP ${status}: ${body}`, {
      statusCode: status,
    });
  }

  it("explains content-policy blocks without exposing provider JSON", () => {
    const message = describeImageGenerationError(
      serviceError(400, '{"error":{"code":"moderation_blocked","message":"..."}}')
    );
    expect(message).toMatch(/safety/i);
    expect(message).not.toContain("{");
  });

  it("reports auth/permission failures as a service configuration problem", () => {
    for (const status of [401, 403]) {
      const message = describeImageGenerationError(
        serviceError(status, '{"error":{"code":"unsupported_organization"}}')
      );
      expect(message).toMatch(/unavailable/i);
      expect(message).not.toContain("{");
    }
  });

  it("reports rate limits as busy", () => {
    expect(describeImageGenerationError(serviceError(429, "rate_limit_exceeded"))).toMatch(/busy/i);
  });

  it("reports exhausted quota as unavailable rather than busy", () => {
    const message = describeImageGenerationError(serviceError(429, "insufficient_quota"));
    expect(message).toMatch(/unavailable/i);
  });

  it("reports server errors as temporary", () => {
    expect(describeImageGenerationError(serviceError(503, "overloaded"))).toMatch(/try again/i);
  });

  it("passes through messages from non-provider errors", () => {
    expect(describeImageGenerationError(new Error("No content found in selected sources"))).toBe(
      "No content found in selected sources"
    );
  });
});
