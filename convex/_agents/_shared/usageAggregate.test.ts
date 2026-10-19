import { describe, expect, it } from "vitest";
import {
  addTokenUsage,
  fromProviderUsage,
  fromTogetherUsage,
  resolveEvalTokenUsage,
} from "./usageAggregate";

describe("cached prompt tokens", () => {
  it("fromTogetherUsage reads prompt_tokens_details.cached_tokens", () => {
    expect(
      fromTogetherUsage({
        prompt_tokens: 100,
        completion_tokens: 5,
        total_tokens: 105,
        prompt_tokens_details: { cached_tokens: 64 },
      })
    ).toEqual({ prompt: 100, completion: 5, total: 105, cachedPrompt: 64 });
  });

  it("fromTogetherUsage falls back to a top-level cached_tokens", () => {
    expect(
      fromTogetherUsage({ prompt_tokens: 10, completion_tokens: 1, cached_tokens: 3 })
    ).toEqual({ prompt: 10, completion: 1, total: 11, cachedPrompt: 3 });
  });

  it("fromTogetherUsage omits cachedPrompt when the provider reports none", () => {
    const usage = fromTogetherUsage({ prompt_tokens: 10, completion_tokens: 1 });
    expect(usage).not.toHaveProperty("cachedPrompt");
  });

  it("fromProviderUsage maps cachedPromptTokens when present", () => {
    expect(
      fromProviderUsage({
        promptTokens: 20,
        completionTokens: 4,
        totalTokens: 24,
        cachedPromptTokens: 16,
      })
    ).toEqual({ prompt: 20, completion: 4, total: 24, cachedPrompt: 16 });
    expect(
      fromProviderUsage({ promptTokens: 20, completionTokens: 4, totalTokens: 24 })
    ).not.toHaveProperty("cachedPrompt");
  });

  it("addTokenUsage sums cachedPrompt and stays absent when neither side has it", () => {
    expect(
      addTokenUsage(
        { prompt: 10, completion: 1, total: 11, cachedPrompt: 4 },
        { prompt: 5, completion: 1, total: 6, cachedPrompt: 2 }
      )
    ).toEqual({ prompt: 15, completion: 2, total: 17, cachedPrompt: 6 });
    expect(
      addTokenUsage(
        { prompt: 10, completion: 1, total: 11, cachedPrompt: 4 },
        { prompt: 5, completion: 1, total: 6 }
      )
    ).toEqual({ prompt: 15, completion: 2, total: 17, cachedPrompt: 4 });
    expect(addTokenUsage({ prompt: 1, completion: 1, total: 2 })).not.toHaveProperty(
      "cachedPrompt"
    );
  });
});

describe("fromProviderUsage", () => {
  it("maps provider usage fields", () => {
    expect(
      fromProviderUsage({
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      })
    ).toEqual({ prompt: 11, completion: 7, total: 18 });
  });

  it("returns undefined when usage is missing", () => {
    expect(fromProviderUsage(undefined)).toBeUndefined();
  });
});

describe("addTokenUsage", () => {
  it("sums two usages", () => {
    expect(
      addTokenUsage(
        { prompt: 10, completion: 20, total: 30 },
        { prompt: 5, completion: 7, total: 12 }
      )
    ).toEqual({ prompt: 15, completion: 27, total: 42 });
  });

  it("treats undefined as zero", () => {
    expect(addTokenUsage(undefined, { prompt: 3, completion: 4, total: 7 })).toEqual({
      prompt: 3,
      completion: 4,
      total: 7,
    });
    expect(addTokenUsage({ prompt: 1, completion: 2, total: 3 }, undefined)).toEqual({
      prompt: 1,
      completion: 2,
      total: 3,
    });
    expect(addTokenUsage(undefined, undefined)).toEqual({
      prompt: 0,
      completion: 0,
      total: 0,
    });
  });
});

describe("resolveEvalTokenUsage", () => {
  const estimated = { prompt: 100, completion: 50, total: 150 };

  it("prefers provider when total > 0", () => {
    const provider = { prompt: 11, completion: 7, total: 18 };
    expect(resolveEvalTokenUsage({ provider, estimated })).toEqual({
      tokenUsage: provider,
      tokenUsageSource: "provider",
    });
  });

  it("falls back to estimated when provider is undefined", () => {
    expect(resolveEvalTokenUsage({ estimated })).toEqual({
      tokenUsage: estimated,
      tokenUsageSource: "estimated",
    });
  });

  it("falls back to estimated when provider.total is 0", () => {
    const provider = { prompt: 0, completion: 0, total: 0 };
    expect(resolveEvalTokenUsage({ provider, estimated })).toEqual({
      tokenUsage: estimated,
      tokenUsageSource: "estimated",
    });
  });

  it("does not mutate the estimated object", () => {
    const estimatedCopy = { ...estimated };
    resolveEvalTokenUsage({ estimated });
    expect(estimated).toEqual(estimatedCopy);
  });
});

describe("fromTogetherUsage", () => {
  it("maps snake_case Together usage fields", () => {
    expect(
      fromTogetherUsage({
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      })
    ).toEqual({ prompt: 11, completion: 7, total: 18 });
  });

  it("returns undefined when usage is missing or all zeros", () => {
    expect(fromTogetherUsage(undefined)).toBeUndefined();
    expect(fromTogetherUsage(null)).toBeUndefined();
    expect(
      fromTogetherUsage({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
    ).toBeUndefined();
  });
});
