import { describe, expect, it } from "vitest";
import { addTokenUsage, fromProviderUsage, resolveEvalTokenUsage } from "./usageAggregate";

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
