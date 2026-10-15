import { describe, expect, it, vi } from "vitest";

const { uncachedLlmCall } = vi.hoisted(() => ({ uncachedLlmCall: vi.fn() }));
vi.mock("../_shared/cachedLlm", () => ({ uncachedLlmCall }));

import { refineWebSearchQuery } from "./searchQueryRefiner";

// The web search waits on this call, so a stalled one held the chat turn for minutes.
describe("refineWebSearchQuery deadline", () => {
  it("gives the call a deadline and searches with the message once it passes", async () => {
    uncachedLlmCall.mockRejectedValueOnce(new Error("LLM request timed out after 8000ms"));

    await expect(refineWebSearchQuery("what is a tensor shape")).resolves.toBe(
      "what is a tensor shape"
    );
    expect(uncachedLlmCall.mock.calls[0][0].timeoutMs).toEqual(expect.any(Number));
  });
});
