import { FREE_FEATURE_LIMITS, PRO_FEATURE_LIMITS } from "@convex/_lib/errors";
import { describe, expect, it } from "vitest";
import { COMBINED_STUDIO_TOOLS, FREE_PLAN_FEATURES, PRO_PLAN_FEATURES } from "./planFeatures";

describe("plan feature lists", () => {
  it("state the Free plan's limits", () => {
    expect(FREE_PLAN_FEATURES).toEqual([
      "5 notebooks · 20 sources each",
      "10 chat messages / day",
      "1 flashcard set, quiz, report, mind map / day each",
      "3 audio overviews / week",
      "1 literature review / 30 days",
    ]);
  });

  it("state the Pro plan's limits", () => {
    expect(PRO_PLAN_FEATURES).toEqual([
      "200 notebooks · 200 sources each",
      "500 chat messages / day",
      "100 flashcard sets, quizzes, reports, mind maps / day",
      "20 audio overviews / day",
      "10 literature reviews / day",
      "15 deep research runs / day",
      "10 infographics / day",
    ]);
  });

  it("only combine Studio tools that share one limit", () => {
    for (const table of [FREE_FEATURE_LIMITS, PRO_FEATURE_LIMITS]) {
      const limits = COMBINED_STUDIO_TOOLS.map((feature) => JSON.stringify(table[feature]));
      expect(new Set(limits).size).toBe(1);
    }
  });

  it("only call Pro-only features Pro-only", () => {
    expect(FREE_FEATURE_LIMITS.deepResearch).toBeNull();
    expect(FREE_FEATURE_LIMITS.infographic).toBeNull();
  });
});
