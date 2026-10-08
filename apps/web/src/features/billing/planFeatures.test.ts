import { FREE_FEATURE_LIMITS, PRO_FEATURE_LIMITS } from "@convex/_lib/errors";
import { describe, expect, it } from "vitest";
import { COMBINED_STUDIO_TOOLS, FREE_PLAN_FEATURES, PRO_PLAN_FEATURES } from "./planFeatures";

describe("plan feature lists", () => {
  it("state the Free plan's limits", () => {
    expect(FREE_PLAN_FEATURES).toEqual([
      "5 notebooks, 20 sources each",
      "10 chat messages a day",
      "1 flashcard deck, quiz, report and mind map a day each",
      "3 audio recaps a week",
      "1 literature review every 30 days",
    ]);
  });

  it("state the Pro plan's limits", () => {
    expect(PRO_PLAN_FEATURES).toEqual([
      "200 notebooks, 200 sources each",
      "500 chat messages a day",
      "100 flashcard decks, quizzes, reports and mind maps a day",
      "20 audio recaps a day",
      "10 literature reviews a day",
      "15 deep research runs a day",
      "10 infographics a day",
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
