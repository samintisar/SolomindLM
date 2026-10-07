import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLLM, mergeModelKwargs } from "./llm_factory";

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

  it("uses non-reasoning Qwen 3.5 and reasoning-enabled Qwen 3.8 Flash", () => {
    expect(mergeModelKwargs("Qwen/Qwen3.5-9B", "fast")).toEqual({
      reasoning: { enabled: false },
    });
    expect(mergeModelKwargs("Qwen/Qwen3.5-9B", "smart")).toEqual({
      reasoning: { enabled: false },
    });
    expect(mergeModelKwargs("Qwen/Qwen3.8-Flash", "fast")).toEqual({
      reasoning: { enabled: false },
    });
    expect(mergeModelKwargs("Qwen/Qwen3.8-Flash", "smart")).toEqual({
      reasoning: { enabled: true },
    });
  });

  it("returns empty object for other openai/ models", () => {
    expect(mergeModelKwargs("openai/gpt-4o", "fast")).toEqual({});
    expect(mergeModelKwargs("openai/gpt-4o", "smart")).toEqual({});
  });

  it("returns chat_template_kwargs for non-openai models", () => {
    expect(mergeModelKwargs("deepseek-ai/DeepSeek-V4.1-Flash", "fast")).toEqual({
      chat_template_kwargs: { thinking: false },
    });
    expect(mergeModelKwargs("deepseek-ai/DeepSeek-V3", "smart")).toEqual({
      chat_template_kwargs: { thinking: true },
    });
  });
});

describe("createLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a single LLM with fast phase by default", () => {
    createLLM({
      apiKey: "test-key",
      mapModel: "Qwen/Qwen3.5-9B",
    });

    const call = vi.mocked(ChatTogetherAI).mock.calls[0];
    expect(call[0]).toMatchObject({
      apiKey: "test-key",
      model: "Qwen/Qwen3.5-9B",
      temperature: 0.3,
      modelKwargs: { reasoning: { enabled: false } },
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
