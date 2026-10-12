import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvokeStructuredOutputOptions } from "../_shared/structuredLlm.js";
import { createStructuredLLM } from "./structuredLlm.js";

const { invokeStructuredOutput } = vi.hoisted(() => ({ invokeStructuredOutput: vi.fn() }));

vi.mock("../_shared/structuredLlm.js", () => ({ invokeStructuredOutput }));

const messages = [new SystemMessage("sys"), new HumanMessage("user")];

describe("createStructuredLLM", () => {
  beforeEach(() => {
    invokeStructuredOutput.mockReset();
  });

  it("starts later invokes with reasoning off once a call switched it off", async () => {
    invokeStructuredOutput
      .mockImplementationOnce(async (options: InvokeStructuredOutputOptions<unknown>) => {
        options.onReasoningDisabled?.();
        throw new Error("transient failure after the switch");
      })
      .mockResolvedValueOnce({ ok: true });
    const llm = createStructuredLLM(z.object({ ok: z.boolean() }), "test_schema", {
      model: "reasoning-model",
      reasoningEnabled: true,
    });

    await expect(llm.invoke(messages)).rejects.toThrow("transient failure");
    await llm.invoke(messages);

    const reasoning = invokeStructuredOutput.mock.calls.map((call) => call[0]?.reasoningEnabled);
    expect(reasoning).toEqual([true, false]);
  });
});
