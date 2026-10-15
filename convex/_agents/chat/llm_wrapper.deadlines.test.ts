import { afterEach, describe, expect, it, vi } from "vitest";

const { uncachedLlmCall } = vi.hoisted(() => ({ uncachedLlmCall: vi.fn() }));
vi.mock("../_shared/cachedLlm.js", () => ({ uncachedLlmCall }));

import {
  DIRECT_RESPONSE_TIMEOUT_MS,
  FOLLOWUP_GENERATION_TIMEOUT_MS,
  PLANNER_TIMEOUT_MS,
} from "./chatConfig";
import { ChatLLMWrapper } from "./llm_wrapper";

const wrapper = () =>
  new ChatLLMWrapper({ apiKey: "test-key", model: "smart-model", fastModel: "fast-model" });

/** A Together call that stalls until its deadline, as `uncachedLlmCall` aborts it with `timeoutMs`. */
function stallUntilDeadline() {
  uncachedLlmCall.mockImplementation(
    ({ timeoutMs }: { timeoutMs?: number }) =>
      new Promise((_resolve, reject) => {
        if (timeoutMs === undefined) return; // no deadline: stalls for good
        setTimeout(
          () => reject(new Error(`LLM request timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
  );
}

afterEach(() => {
  uncachedLlmCall.mockReset();
  vi.useRealTimers();
});

// A stalled planner call held the whole chat turn before any source was searched.
describe("generateRetrievalSubqueries deadline", () => {
  it("gives each planner attempt its own deadline", async () => {
    uncachedLlmCall.mockResolvedValue({
      content: '{"subqueries": ["a"], "aboutEachSource": false}',
    });

    await wrapper().generateRetrievalSubqueries("Compare tensor shape and dtype", [], {
      severalSourcesSelected: true,
    });

    expect(uncachedLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({ model: "fast-model", timeoutMs: PLANNER_TIMEOUT_MS })
    );
  });

  it("falls back to the user's message when both planner attempts stall", async () => {
    vi.useFakeTimers();
    stallUntilDeadline();
    const message = "Compare tensor shape and dtype";

    const plan = wrapper().generateRetrievalSubqueries(message, [], {
      severalSourcesSelected: true,
    });
    await vi.advanceTimersByTimeAsync(2 * PLANNER_TIMEOUT_MS);

    await expect(plan).resolves.toEqual({ subqueries: [message] });
    expect(uncachedLlmCall).toHaveBeenCalledTimes(2);
    for (const [options] of uncachedLlmCall.mock.calls) {
      expect(options.timeoutMs).toBe(PLANNER_TIMEOUT_MS);
    }
  });
});

describe("reply call deadlines", () => {
  it("aborts a stalled direct response at its deadline and uses the fallback reply", async () => {
    vi.useFakeTimers();
    stallUntilDeadline();

    const reply = wrapper().generateDirectResponse("hi", []);
    await vi.advanceTimersByTimeAsync(DIRECT_RESPONSE_TIMEOUT_MS);

    await expect(reply).resolves.toMatch(/ask me anything/i);
    expect(uncachedLlmCall.mock.calls[0][0].timeoutMs).toBe(DIRECT_RESPONSE_TIMEOUT_MS);
  });

  it("aborts stalled follow-up suggestions at the follow-up deadline", async () => {
    vi.useFakeTimers();
    stallUntilDeadline();

    const followUps = wrapper().generateFollowUpQuestions("What is a tensor?", "An array.");
    await vi.advanceTimersByTimeAsync(FOLLOWUP_GENERATION_TIMEOUT_MS);

    await expect(followUps).resolves.toEqual([]);
    expect(uncachedLlmCall.mock.calls[0][0].timeoutMs).toBe(FOLLOWUP_GENERATION_TIMEOUT_MS);
  });
});
