import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyLlmResponseError } from "./llmErrors.js";
import { invokeTogetherText } from "./studioTextLlm.js";

const uncachedLlmCall = vi.fn();

vi.mock("./cachedLlm.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cachedLlm.js")>();
  return {
    ...actual,
    uncachedLlmCall: (...args: Parameters<typeof actual.uncachedLlmCall>) =>
      uncachedLlmCall(...args),
  };
});

describe("invokeTogetherText", () => {
  beforeEach(() => {
    uncachedLlmCall.mockReset();
  });

  it("returns trimmed assistant text", async () => {
    uncachedLlmCall.mockResolvedValueOnce({ content: "  hello  " });

    await expect(
      invokeTogetherText({ systemPrompt: "s", userPrompt: "u", model: "m" })
    ).resolves.toBe("hello");
  });

  it("throws EmptyLlmResponseError carrying the finish reason when content is empty", async () => {
    uncachedLlmCall.mockResolvedValueOnce({
      content: "",
      finishReason: "length",
      usage: { promptTokens: 10, completionTokens: 16384, totalTokens: 16394 },
    });

    const error = await invokeTogetherText({ systemPrompt: "s", userPrompt: "u", model: "m" }).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(EmptyLlmResponseError);
    expect(error).toMatchObject({ model: "m", finishReason: "length", completionTokens: 16384 });
    // Keep the message the job logs and failure metadata already key on.
    expect((error as Error).message).toMatch(/^LLM returned empty text response/);
  });

  it("still reports token usage for an empty response", async () => {
    uncachedLlmCall.mockResolvedValueOnce({
      content: "",
      finishReason: "length",
      usage: { promptTokens: 10, completionTokens: 16384, totalTokens: 16394 },
    });
    const onUsage = vi.fn();

    await invokeTogetherText({ systemPrompt: "s", userPrompt: "u", model: "m", onUsage }).catch(
      () => undefined
    );

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ completion: 16384, prompt: 10 })
    );
  });
});
