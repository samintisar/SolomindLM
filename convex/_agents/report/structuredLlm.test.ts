import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeMapStructuredOutput } from "./structuredLlm.js";

const uncachedLlmCall = vi.fn();

vi.mock("../_shared/cachedLlm.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_shared/cachedLlm.js")>();
  return {
    ...actual,
    uncachedLlmCall: (...args: Parameters<typeof actual.uncachedLlmCall>) =>
      uncachedLlmCall(...args),
  };
});

const validSummary =
  "This summary is long enough to satisfy the fifty character minimum for map output validation.";

const validMapPayload = JSON.stringify({
  topics: ["Patterns"],
  summary: validSummary,
});

describe("invokeMapStructuredOutput", () => {
  beforeEach(() => {
    uncachedLlmCall.mockReset();
  });

  it("parses valid JSON from structuredJson", async () => {
    uncachedLlmCall.mockResolvedValueOnce({
      content: "",
      structuredJson: validMapPayload,
    });

    const result = await invokeMapStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
    });

    expect(result.topics).toEqual(["Patterns"]);
    expect(uncachedLlmCall).toHaveBeenCalledTimes(1);
  });

  it("parses valid JSON from content when structuredJson is absent", async () => {
    uncachedLlmCall.mockResolvedValueOnce({
      content: validMapPayload,
      structuredJson: undefined,
    });

    const result = await invokeMapStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
    });

    expect(result.topics).toEqual(["Patterns"]);
    expect(uncachedLlmCall).toHaveBeenCalledTimes(1);
  });

  it("retries on validation failure then succeeds", async () => {
    vi.useFakeTimers();

    uncachedLlmCall
      .mockResolvedValueOnce({
        content: "",
        structuredJson: JSON.stringify({ topics: ["A"], summary: "too short" }),
      })
      .mockResolvedValueOnce({
        content: "",
        structuredJson: validMapPayload,
      });

    const resultPromise = invokeMapStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.summary).toBe(validSummary);
    expect(uncachedLlmCall).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws after exhausting retriable attempts", async () => {
    uncachedLlmCall.mockResolvedValue({
      content: "",
      structuredJson: JSON.stringify({ topics: ["A"], summary: "short" }),
    });

    await expect(
      invokeMapStructuredOutput({
        systemPrompt: "sys",
        userPrompt: "user",
      })
    ).rejects.toThrow(/validation failed/i);

    expect(uncachedLlmCall).toHaveBeenCalledTimes(3);
  });

  it("uses json_object response format on the final attempt", async () => {
    uncachedLlmCall
      .mockResolvedValueOnce({ content: "", structuredJson: "" })
      .mockResolvedValueOnce({ content: "", structuredJson: "" })
      .mockResolvedValueOnce({
        content: "",
        structuredJson: validMapPayload,
      });

    await invokeMapStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
    });

    const formats = uncachedLlmCall.mock.calls.map(
      (call) => call[0]?.responseFormat as { type: string } | undefined
    );
    expect(formats[0]?.type).toBe("json_schema");
    expect(formats[1]?.type).toBe("json_schema");
    expect(formats[2]?.type).toBe("json_object");
  });

  it("retries when uncachedLlmCall throws missing structured JSON payload", async () => {
    vi.useFakeTimers();

    uncachedLlmCall
      .mockRejectedValueOnce(new Error("LLM API returned no JSON payload for structured response"))
      .mockResolvedValueOnce({
        content: "",
        structuredJson: validMapPayload,
      });

    const resultPromise = invokeMapStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.topics).toEqual(["Patterns"]);
    expect(uncachedLlmCall).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("does not retry non-retriable LLM errors", async () => {
    uncachedLlmCall.mockRejectedValueOnce(new Error("LLM API error: 401 - unauthorized"));

    await expect(
      invokeMapStructuredOutput({
        systemPrompt: "sys",
        userPrompt: "user",
      })
    ).rejects.toThrow(/401/);

    expect(uncachedLlmCall).toHaveBeenCalledTimes(1);
  });
});
