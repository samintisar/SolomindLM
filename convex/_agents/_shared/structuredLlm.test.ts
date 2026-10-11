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
});
