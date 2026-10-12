import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MissingStructuredJsonError } from "./llmErrors.js";
import { invokeStructuredOutput } from "./structuredLlm.js";

const uncachedLlmCall = vi.fn();

vi.mock("./cachedLlm.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cachedLlm.js")>();
  return {
    ...actual,
    uncachedLlmCall: (...args: Parameters<typeof actual.uncachedLlmCall>) =>
      uncachedLlmCall(...args),
  };
});

const TestSchema = z.object({
  topics: z.array(z.string()).min(1),
  summary: z.string().min(10),
});

const validPayload = JSON.stringify({
  topics: ["A"],
  summary: "Long enough summary for validation.",
});

describe("invokeStructuredOutput", () => {
  beforeEach(() => {
    uncachedLlmCall.mockReset();
  });

  it("parses valid JSON from structuredJson", async () => {
    uncachedLlmCall.mockResolvedValueOnce({
      content: "",
      structuredJson: validPayload,
    });

    const result = await invokeStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
      schema: TestSchema,
      schemaName: "test_schema",
    });

    expect(result.topics).toEqual(["A"]);
    expect(uncachedLlmCall).toHaveBeenCalledTimes(1);
  });

  it("uses json_object on final attempt after empty payloads", async () => {
    uncachedLlmCall
      .mockResolvedValueOnce({ content: "", structuredJson: "" })
      .mockResolvedValueOnce({ content: "", structuredJson: "" })
      .mockResolvedValueOnce({ content: "", structuredJson: validPayload });

    await invokeStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
      schema: TestSchema,
      schemaName: "test_schema",
    });

    const formats = uncachedLlmCall.mock.calls.map(
      (call) => call[0]?.responseFormat as { type: string } | undefined
    );
    expect(formats[2]?.type).toBe("json_object");
  });

  it("retries with reasoning off when reasoning used the whole budget before any JSON", async () => {
    uncachedLlmCall
      .mockRejectedValueOnce(
        new MissingStructuredJsonError({ model: "reasoning-model", finishReason: "length" })
      )
      .mockResolvedValueOnce({ content: "", structuredJson: validPayload });

    const result = await invokeStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
      schema: TestSchema,
      schemaName: "test_schema",
      reasoningEnabled: true,
    });

    expect(result.topics).toEqual(["A"]);
    const reasoning = uncachedLlmCall.mock.calls.map((call) => call[0]?.reasoningEnabled);
    expect(reasoning).toEqual([true, false]);
  });

  it("keeps reasoning on when the response stopped normally without JSON", async () => {
    uncachedLlmCall
      .mockRejectedValueOnce(
        new MissingStructuredJsonError({ model: "reasoning-model", finishReason: "stop" })
      )
      .mockResolvedValueOnce({ content: "", structuredJson: validPayload });

    await invokeStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
      schema: TestSchema,
      schemaName: "test_schema",
      reasoningEnabled: true,
    });

    const reasoning = uncachedLlmCall.mock.calls.map((call) => call[0]?.reasoningEnabled);
    expect(reasoning).toEqual([true, true]);
  });

  it("retries with reasoning off when a reasoning-on response stops at the token limit mid-JSON", async () => {
    uncachedLlmCall
      .mockResolvedValueOnce({
        content: '{"topics": ["A"',
        structuredJson: '{"topics": ["A"',
        finishReason: "length",
      })
      .mockResolvedValueOnce({ content: "", structuredJson: validPayload });
    const onReasoningDisabled = vi.fn();

    await invokeStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
      schema: TestSchema,
      schemaName: "test_schema",
      reasoningEnabled: true,
      onReasoningDisabled,
    });

    const reasoning = uncachedLlmCall.mock.calls.map((call) => call[0]?.reasoningEnabled);
    expect(reasoning).toEqual([true, false]);
    expect(onReasoningDisabled).toHaveBeenCalledTimes(1);
  });

  it("reports token usage for failed attempts as well as the successful one", async () => {
    uncachedLlmCall
      .mockRejectedValueOnce(
        new MissingStructuredJsonError({
          model: "reasoning-model",
          finishReason: "length",
          usage: { promptTokens: 1_000, completionTokens: 4_096, totalTokens: 5_096 },
        })
      )
      .mockResolvedValueOnce({
        content: "not json",
        structuredJson: "",
        usage: { promptTokens: 1_000, completionTokens: 20, totalTokens: 1_020 },
      })
      .mockResolvedValueOnce({
        content: "",
        structuredJson: validPayload,
        usage: { promptTokens: 1_000, completionTokens: 300, totalTokens: 1_300 },
      });
    const onUsage = vi.fn();

    await invokeStructuredOutput({
      systemPrompt: "sys",
      userPrompt: "user",
      schema: TestSchema,
      schemaName: "test_schema",
      reasoningEnabled: true,
      onUsage,
    });

    expect(onUsage.mock.calls.map((call) => call[0])).toEqual([
      { prompt: 1_000, completion: 4_096, total: 5_096 },
      { prompt: 1_000, completion: 20, total: 1_020 },
      { prompt: 1_000, completion: 300, total: 1_300 },
    ]);
  });
});
