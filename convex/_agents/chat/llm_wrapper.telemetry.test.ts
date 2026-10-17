import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTurnTelemetry } from "../_shared/tokenUsageAccumulator";
import { ChatLLMWrapper } from "./llm_wrapper";
import type { ReferenceChunk } from "./types";

const passage: ReferenceChunk = {
  id: "1",
  sourceId: "doc",
  sourceTitle: "Notes",
  content: "Tensors have shapes.",
  chunkIndex: 0,
};

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

  it("records a generate span over the whole stream, with usage from the final chunk", async () => {
    const telemetry = createTurnTelemetry();
    const wrapper = new ChatLLMWrapper({
      apiKey: "test-key",
      model: "smart-model",
      fastModel: "fast-model",
      telemetry,
    });
    const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
    async function* stream() {
      yield { choices: [{ delta: { content: '{"answer_markdown":"Answer ' } }] };
      await pause();
      yield { choices: [{ delta: { content: '[1].","confidence":"high"}' } }] };
      await pause();
      // include_usage: the provider sends usage on a final chunk with no choices.
      yield {
        choices: [],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 20,
          total_tokens: 220,
          prompt_tokens_details: { cached_tokens: 150 },
        },
      };
    }
    Reflect.set(wrapper, "togetherClient", {
      chat: { completions: { create: async () => stream() } },
    });

    const response = await wrapper.generateStructuredResponse([passage], "What is a tensor?");

    expect(response.answer_markdown).toBe("Answer [1].");
    const snapshot = telemetry.snapshot();
    expect(snapshot.stageSpans).toHaveLength(1);
    expect(snapshot.stageSpans[0]).toMatchObject({
      stage: "generate",
      tokenUsage: { prompt: 200, completion: 20, total: 220, cachedPrompt: 150 },
    });
    // Two 20 ms pauses between chunks: the span covers the stream, not just the first chunk.
    expect(snapshot.stageSpans[0].latencyMs).toBeGreaterThanOrEqual(30);
    expect(snapshot.callCounters.llmCalls).toBe(1);
  });

  it("records a plan span for each planner attempt when the fast attempt fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" })
      .mockResolvedValueOnce(
        completion('{"subqueries":["sampling methods","bootstrapping"],"aboutEachSource":false}', {
          prompt_tokens: 30,
          completion_tokens: 9,
          total_tokens: 39,
        })
      );
    const telemetry = createTurnTelemetry();
    const wrapper = new ChatLLMWrapper({
      apiKey: "test-key",
      model: "smart-model",
      fastModel: "fast-model",
      telemetry,
    });

    const plan = await wrapper.generateRetrievalSubqueries(
      "What is the difference between sampling and bootstrapping in these notes?"
    );

    expect(plan.subqueries).toEqual(["sampling methods", "bootstrapping"]);
    const snapshot = telemetry.snapshot();
    expect(snapshot.stageSpans.map((span) => span.stage)).toEqual(["plan", "plan"]);
    // The failed fast attempt has latency but no usage; the smart attempt carries its usage.
    expect(snapshot.stageSpans[0]).not.toHaveProperty("tokenUsage");
    expect(snapshot.stageSpans[1]).toMatchObject({
      stage: "plan",
      tokenUsage: { prompt: 30, completion: 9, total: 39 },
    });
    expect(snapshot.callCounters.llmCalls).toBe(1);
  });

  it("records a generate span for the LangChain fallback when streaming fails", async () => {
    fetchMock.mockResolvedValue(
      completion('{"answer_markdown":"Fallback [1].","confidence":"medium"}', {
        prompt_tokens: 50,
        completion_tokens: 8,
        total_tokens: 58,
      })
    );
    const telemetry = createTurnTelemetry();
    const wrapper = new ChatLLMWrapper({
      apiKey: "test-key",
      model: "smart-model",
      fastModel: "fast-model",
      telemetry,
    });
    Reflect.set(wrapper, "togetherClient", {
      chat: {
        completions: {
          create: async () => {
            throw new Error("stream unavailable");
          },
        },
      },
    });

    const response = await wrapper.generateStructuredResponse([passage], "What is a tensor?");

    expect(response.answer_markdown).toBe("Fallback [1].");
    const snapshot = telemetry.snapshot();
    expect(snapshot.stageSpans).toHaveLength(1);
    expect(snapshot.stageSpans[0]).toMatchObject({
      stage: "generate",
      tokenUsage: { prompt: 50, completion: 8, total: 58 },
    });
    expect(snapshot.callCounters.llmCalls).toBe(1);
  });
});
