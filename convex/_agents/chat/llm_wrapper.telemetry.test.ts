import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTurnTelemetry } from "../_shared/tokenUsageAccumulator";
import { ChatLLMWrapper } from "./llm_wrapper";

vi.mock("../../_lib/env.js", () => ({
  env: { TOGETHER_AI_API_KEY: "test-key" },
}));

const completion = (content: string, usage?: Record<string, unknown>) => ({
  ok: true,
  text: async () =>
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
      ...(usage ? { usage } : {}),
    }),
});

describe("ChatLLMWrapper turn telemetry", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records a hyde span with provider usage, including cached prompt tokens", async () => {
    fetchMock.mockResolvedValue(
      completion("A hypothetical paragraph.", {
        prompt_tokens: 120,
        completion_tokens: 30,
        total_tokens: 150,
        prompt_tokens_details: { cached_tokens: 100 },
      })
    );
    const telemetry = createTurnTelemetry();
    const wrapper = new ChatLLMWrapper({
      apiKey: "test-key",
      model: "smart-model",
      fastModel: "fast-model",
      telemetry,
    });

    await wrapper.generateHypotheticalDocument("what is retrieval?");

    const snapshot = telemetry.snapshot();
    expect(snapshot.stageSpans).toHaveLength(1);
    expect(snapshot.stageSpans[0]).toMatchObject({
      stage: "hyde",
      tokenUsage: { prompt: 120, completion: 30, total: 150, cachedPrompt: 100 },
    });
    expect(snapshot.stageSpans[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.callCounters.llmCalls).toBe(1);
    expect(snapshot.tokenUsage).toEqual({
      prompt: 120,
      completion: 30,
      total: 150,
      cachedPrompt: 100,
    });
  });

  it("records a followup span for follow-up question generation", async () => {
    fetchMock.mockResolvedValue(
      completion('["What is a vector index?", "How is it built?"]', {
        prompt_tokens: 40,
        completion_tokens: 12,
        total_tokens: 52,
      })
    );
    const telemetry = createTurnTelemetry();
    const wrapper = new ChatLLMWrapper({
      apiKey: "test-key",
      model: "smart-model",
      fastModel: "fast-model",
      telemetry,
    });

    const followUps = await wrapper.generateFollowUpQuestions("q", "a");

    expect(followUps).toEqual(["What is a vector index?", "How is it built?"]);
    const snapshot = telemetry.snapshot();
    expect(snapshot.stageSpans.map((span) => span.stage)).toEqual(["followup"]);
  });

  it("records no span and no call when the LLM call fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" });
    const telemetry = createTurnTelemetry();
    const wrapper = new ChatLLMWrapper({
      apiKey: "test-key",
      model: "smart-model",
      fastModel: "fast-model",
      telemetry,
    });

    const hyde = await wrapper.generateHypotheticalDocument("q");

    expect(hyde).toBe("");
    const snapshot = telemetry.snapshot();
    expect(snapshot.stageSpans).toEqual([]);
    expect(snapshot.callCounters.llmCalls).toBe(0);
  });
});
