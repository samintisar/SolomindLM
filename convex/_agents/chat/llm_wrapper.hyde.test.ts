import { describe, expect, it, vi } from "vitest";

const { uncachedLlmCall } = vi.hoisted(() => ({ uncachedLlmCall: vi.fn() }));
vi.mock("../_shared/cachedLlm.js", () => ({ uncachedLlmCall }));

import { HYDE_TIMEOUT_MS } from "./chatConfig";
import { ChatLLMWrapper } from "./llm_wrapper";

const wrapper = () =>
  new ChatLLMWrapper({ apiKey: "test-key", model: "smart-model", fastModel: "fast-model" });

describe("generateHypotheticalDocument", () => {
  it("writes the passage with the fast model, thinking off, under its own deadline", async () => {
    uncachedLlmCall.mockReset();
    uncachedLlmCall.mockResolvedValueOnce({ content: " A tensor's shape lists its sizes. " });

    await expect(wrapper().generateHypotheticalDocument("tensor shape")).resolves.toBe(
      "A tensor's shape lists its sizes."
    );
    expect(uncachedLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fast-model",
        reasoningEnabled: false,
        timeoutMs: HYDE_TIMEOUT_MS,
      })
    );
  });

  it("returns nothing when the call fails, so retrieval embeds the query alone", async () => {
    uncachedLlmCall.mockReset();
    uncachedLlmCall.mockRejectedValueOnce(new Error("LLM request timed out after 8000ms"));

    await expect(wrapper().generateHypotheticalDocument("tensor shape")).resolves.toBe("");
  });
});
