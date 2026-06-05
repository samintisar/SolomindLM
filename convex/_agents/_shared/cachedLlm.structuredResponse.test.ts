import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uncachedLlmCall } from "./cachedLlm.js";

vi.mock("../../_lib/env.js", () => ({
  env: { TOGETHER_AI_API_KEY: "test-key" },
}));

function mockTogetherResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
  };
}

describe("uncachedLlmCall structured responses", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when json_schema response has no parseable JSON", async () => {
    fetchMock.mockResolvedValue(
      mockTogetherResponse({
        choices: [
          {
            message: { content: "", reasoning: "planning only, no JSON yet" },
            finish_reason: "stop",
          },
        ],
      })
    );

    await expect(
      uncachedLlmCall({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: "summarize" }],
        temperature: 0.3,
        responseFormat: {
          type: "json_schema",
          json_schema: { name: "test_schema", schema: { type: "object" } },
        },
      })
    ).rejects.toThrow(/no JSON payload for structured response/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns structuredJson from message content for json_schema", async () => {
    const json = '{"topics":["A"],"summary":"Structured summary long enough for validation."}';
    fetchMock.mockResolvedValue(
      mockTogetherResponse({
        choices: [{ message: { content: json }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })
    );

    const result = await uncachedLlmCall({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "summarize" }],
      temperature: 0.3,
      responseFormat: {
        type: "json_schema",
        json_schema: { name: "test_schema", schema: { type: "object" } },
      },
    });

    expect(result.structuredJson).toBe(json);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns structuredJson extracted from reasoning when content is empty", async () => {
    const json = '{"topics":["B"],"summary":"Reasoning-only JSON payload long enough here."}';
    fetchMock.mockResolvedValue(
      mockTogetherResponse({
        choices: [
          {
            message: { content: "", reasoning: `Thinking...\n${json}` },
            finish_reason: "stop",
          },
        ],
      })
    );

    const result = await uncachedLlmCall({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "summarize" }],
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    expect(result.structuredJson).toBe(json);
  });

  it("does not HTTP-retry when structured JSON payload is missing", async () => {
    fetchMock.mockResolvedValue(
      mockTogetherResponse({
        choices: [
          {
            message: { content: "prose without json", reasoning: "" },
            finish_reason: "stop",
          },
        ],
      })
    );

    await expect(
      uncachedLlmCall({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: "summarize" }],
        temperature: 0.3,
        responseFormat: { type: "json_object" },
      })
    ).rejects.toThrow(/no JSON payload for structured response/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
