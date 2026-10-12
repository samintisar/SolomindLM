import { describe, expect, it, vi } from "vitest";

const { uncachedLlmCall } = vi.hoisted(() => ({
  uncachedLlmCall: vi.fn(async () => ({
    content: '{"subqueries": ["conclusions of each paper"], "aboutEachSource": true}',
    usage: undefined,
  })),
}));
vi.mock("../_shared/cachedLlm.js", () => ({ uncachedLlmCall }));

import { ChatLLMWrapper } from "./llm_wrapper";

const wrapper = () =>
  new ChatLLMWrapper({ apiKey: "test-key", model: "smart-model", fastModel: "fast-model" });

// #450: whether a question is about each selected source is the planner's call, so a short
// question over several sources still gets one.
describe("generateRetrievalSubqueries with several sources selected", () => {
  it("asks the planner even for a short question", async () => {
    uncachedLlmCall.mockClear();

    const plan = await wrapper().generateRetrievalSubqueries(
      "What did these papers conclude?",
      [],
      {
        severalSourcesSelected: true,
      }
    );

    expect(uncachedLlmCall).toHaveBeenCalledTimes(1);
    expect(plan.aboutEachSource).toBe(true);
  });

  it("keeps the fast path for a short question over one source", async () => {
    uncachedLlmCall.mockClear();

    const plan = await wrapper().generateRetrievalSubqueries("What did these papers conclude?");

    expect(uncachedLlmCall).not.toHaveBeenCalled();
    expect(plan).toEqual({ subqueries: ["What did these papers conclude?"] });
  });
});
