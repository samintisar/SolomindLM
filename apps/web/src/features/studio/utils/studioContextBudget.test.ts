import { describe, expect, it } from "vitest";
import {
  assessStudioContextBudget,
  estimateSourceTokens,
  getStudioContextBudgetTokens,
  STUDIO_QUALITY_BUDGET_TOKENS,
} from "./studioContextBudget";

describe("estimateSourceTokens", () => {
  it("estimates from word count when available", () => {
    expect(estimateSourceTokens({ wordCount: 1000 })).toBe(1350);
  });

  it("falls back to chunk count when word count is missing", () => {
    expect(estimateSourceTokens({ totalChunks: 3 })).toBe(3000);
  });

  it("prefers word count over chunk count", () => {
    expect(estimateSourceTokens({ wordCount: 100, totalChunks: 50 })).toBe(135);
  });

  it("returns null when the size is unknown", () => {
    expect(estimateSourceTokens({})).toBeNull();
    expect(estimateSourceTokens({ wordCount: 0, totalChunks: 0 })).toBeNull();
  });
});

describe("getStudioContextBudgetTokens", () => {
  it("caps large-context models at the quality budget", () => {
    expect(getStudioContextBudgetTokens("deepseek-ai/DeepSeek-V4.1-Flash")).toBe(
      STUDIO_QUALITY_BUDGET_TOKENS
    );
  });

  it("uses the model window minus reserves for smaller-context models", () => {
    const budget = getStudioContextBudgetTokens("openai/gpt-oss-120b");
    expect(budget).toBeLessThan(131_072);
    expect(budget).toBeLessThan(STUDIO_QUALITY_BUDGET_TOKENS);
    expect(budget).toBeGreaterThan(50_000);
  });

  it("uses a conservative budget for unknown models", () => {
    const unknown = getStudioContextBudgetTokens("some/unknown-model");
    expect(unknown).toBeLessThan(STUDIO_QUALITY_BUDGET_TOKENS);
    expect(unknown).toBeGreaterThan(0);
  });

  it("defaults to the studio generation model", () => {
    expect(getStudioContextBudgetTokens()).toBe(
      getStudioContextBudgetTokens("deepseek-ai/DeepSeek-V4.1-Flash")
    );
  });
});

describe("assessStudioContextBudget", () => {
  const budget = getStudioContextBudgetTokens();

  it("sums only selected sources", () => {
    const result = assessStudioContextBudget([
      { selected: true, wordCount: 1000 },
      { selected: false, wordCount: 1_000_000 },
    ]);
    expect(result.estimatedTokens).toBe(1350);
    expect(result.exceedsBudget).toBe(false);
    expect(result.budgetTokens).toBe(budget);
  });

  it("flags selections over the budget", () => {
    const wordsOverBudget = Math.ceil(budget / 1.35) + 1000;
    const result = assessStudioContextBudget([
      { selected: true, wordCount: wordsOverBudget / 2 },
      { selected: true, wordCount: wordsOverBudget / 2 },
    ]);
    expect(result.exceedsBudget).toBe(true);
    expect(result.estimatedTokens).toBeGreaterThan(budget);
  });

  it("does not flag a selection exactly at the budget", () => {
    const result = assessStudioContextBudget([{ selected: true, totalChunks: budget / 1000 }]);
    expect(result.estimatedTokens).toBe(budget);
    expect(result.exceedsBudget).toBe(false);
  });

  it("counts sources with unknown size without guessing their tokens", () => {
    const result = assessStudioContextBudget([
      { selected: true },
      { selected: true, wordCount: 10 },
    ]);
    expect(result.unknownSizeCount).toBe(1);
    expect(result.estimatedTokens).toBe(14);
  });

  it("uses the given model's budget", () => {
    const result = assessStudioContextBudget([], "openai/gpt-oss-120b");
    expect(result.budgetTokens).toBe(getStudioContextBudgetTokens("openai/gpt-oss-120b"));
  });
});
