import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
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
});
