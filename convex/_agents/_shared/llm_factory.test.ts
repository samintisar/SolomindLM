import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLLM, createLLMs, createLLMsFromEnv, mergeModelKwargs } from "./llm_factory";

// Mock ChatTogetherAI
vi.mock("@langchain/community/chat_models/togetherai", () => ({
  ChatTogetherAI: vi.fn().mockImplementation(function (this: unknown, config: unknown) {
    return config;
  }),
}));

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";

describe("mergeModelKwargs", () => {
  it("returns reasoning_effort for openai/gpt-oss models", () => {
    expect(mergeModelKwargs("openai/gpt-oss-20b", "fast")).toEqual({
      reasoning_effort: "low",
    });
    expect(mergeModelKwargs("openai/gpt-oss-120b", "smart")).toEqual({
      reasoning_effort: "medium",
    });
  });

  it("returns empty object for other openai/ models", () => {
    expect(mergeModelKwargs("openai/gpt-4o", "fast")).toEqual({});
    expect(mergeModelKwargs("openai/gpt-4o", "smart")).toEqual({});
  });

  it("returns chat_template_kwargs for non-openai models", () => {
    expect(mergeModelKwargs("meta-llama/Llama-3-70b", "fast")).toEqual({
      chat_template_kwargs: { thinking: false },
    });
    expect(mergeModelKwargs("deepseek-ai/DeepSeek-V3", "smart")).toEqual({
      chat_template_kwargs: { thinking: true },
    });
  });
});

describe("createLLMs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates fast and smart LLMs with separate models", () => {
    const result = createLLMs({
      apiKey: "test-key",
      mapModel: "openai/gpt-oss-20b",
      reduceModel: "openai/gpt-oss-120b",
      temperatures: { map: 0.3, reduce: 0.6 },
      maxTokens: { map: 1000, reduce: 2000 },
    });

    expect(ChatTogetherAI).toHaveBeenCalledTimes(2);

    const fastCall = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(fastCall[0]).toMatchObject({
      apiKey: "test-key",
      model: "openai/gpt-oss-20b",
      temperature: 0.3,
      maxTokens: 1000,
      modelKwargs: { reasoning_effort: "low" },
    });

    const smartCall = vi.mocked(ChatTogetherAI).mock.calls[1];
    expect(smartCall[0]).toMatchObject({
      apiKey: "test-key",
      model: "openai/gpt-oss-120b",
      temperature: 0.6,
      maxTokens: 2000,
      modelKwargs: { reasoning_effort: "medium" },
    });

    expect(result.fastLlm).toBeDefined();
    expect(result.smartLlm).toBeDefined();
  });

  it("uses fastLlm as smartLlm when reduceModel is omitted", () => {
    const result = createLLMs({
      apiKey: "test-key",
      mapModel: "meta-llama/Llama-3-70b",
    });

    expect(ChatTogetherAI).toHaveBeenCalledTimes(1);
    expect(result.fastLlm).toBe(result.smartLlm);
  });

  it("uses default temperatures when not provided", () => {
    createLLMs({
      apiKey: "test-key",
      mapModel: "model-a",
      reduceModel: "model-b",
    });

    const fastCall = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(fastCall[0].temperature).toBe(0.3);

    const smartCall = vi.mocked(ChatTogetherAI).mock.calls[1];
    expect(smartCall[0].temperature).toBe(0.6);
  });

  it("uses default maxTokens (undefined) when not provided", () => {
    createLLMs({
      apiKey: "test-key",
      mapModel: "model-a",
    });

    const fastCall = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(fastCall[0].maxTokens).toBeUndefined();
  });
});

describe("createLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a single LLM with fast phase by default", () => {
    createLLM({
      apiKey: "test-key",
      mapModel: "openai/gpt-oss-20b",
    });

    const call = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(call[0]).toMatchObject({
      apiKey: "test-key",
      model: "openai/gpt-oss-20b",
      temperature: 0.3,
      modelKwargs: { reasoning_effort: "low" },
    });
  });

  it("creates a single LLM with smart phase when specified", () => {
    createLLM({
      apiKey: "test-key",
      mapModel: "deepseek-ai/DeepSeek-V3",
      temperatures: 0.5,
      maxTokens: 4096,
      phase: "smart",
    });

    const call = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(call[0]).toMatchObject({
      apiKey: "test-key",
      model: "deepseek-ai/DeepSeek-V3",
      temperature: 0.5,
      maxTokens: 4096,
      modelKwargs: { chat_template_kwargs: { thinking: true } },
    });
  });
});

describe("createLLMsFromEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when TOGETHER_AI_API_KEY is missing", () => {
    expect(() => createLLMsFromEnv({}, { mapModel: "model" })).toThrow(
      "TOGETHER_AI_API_KEY is required"
    );
  });

  it("throws when mapModel is not provided and env is empty", () => {
    expect(() => createLLMsFromEnv({ TOGETHER_AI_API_KEY: "key" })).toThrow(
      "TOGETHER_AI_API_KEY is required"
    );
  });

  it("creates LLMs from env variables", () => {
    createLLMsFromEnv(
      {
        TOGETHER_AI_API_KEY: "env-key",
        FAST_LLM: "fast-model",
        SMART_LLM: "smart-model",
      },
      { mapModel: "fast-model" }
    );

    const fastCall = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(fastCall[0].apiKey).toBe("env-key");
    expect(fastCall[0].model).toBe("fast-model");

    const smartCall = vi.mocked(ChatTogetherAI).mock.calls[1];
    expect(smartCall[0].model).toBe("smart-model");
  });

  it("uses options over env variables", () => {
    createLLMsFromEnv(
      {
        TOGETHER_AI_API_KEY: "env-key",
        FAST_LLM: "env-fast",
        SMART_LLM: "env-smart",
      },
      {
        mapModel: "opt-fast",
        reduceModel: "opt-smart",
        mapTemperature: 0.1,
        reduceTemperature: 0.9,
      }
    );

    const fastCall = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(fastCall[0].model).toBe("opt-fast");
    expect(fastCall[0].temperature).toBe(0.1);

    const smartCall = vi.mocked(ChatTogetherAI).mock.calls[1];
    expect(smartCall[0].model).toBe("opt-smart");
    expect(smartCall[0].temperature).toBe(0.9);
  });

  it("uses default model when env.FAST_LLM is missing", () => {
    createLLMsFromEnv({ TOGETHER_AI_API_KEY: "key" }, { mapModel: "custom-model" });

    const fastCall = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(fastCall[0].model).toBe("custom-model");
  });
});
