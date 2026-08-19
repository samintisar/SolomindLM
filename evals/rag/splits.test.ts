import { describe, expect, it } from "vitest";
import { getFixture } from "./fixtures";
import { getFixtureSplit, listFixtureIdsForSplit } from "./splits";

describe("eval splits", () => {
  it("smoke includes one case per core runner plus studio", () => {
    const ids = listFixtureIdsForSplit("smoke");
    const runners = new Set(ids.map((id) => getFixture(id).runner));
    expect(ids).toContain("agentic-patterns-20");
    expect(ids.some((id) => id.startsWith("research-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("literature-review-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("studio-"))).toBe(true);
    expect(runners.has("chat")).toBe(true);
    expect(runners.has("research")).toBe(true);
    expect(runners.has("literatureReview")).toBe(true);
    expect(ids).not.toContain("studio-audio-script-long");
    expect(ids.filter((id) => id.includes("audio-script")).length).toBe(1);
  });

  it("holdout stays disjoint from smoke", () => {
    const smoke = new Set(listFixtureIdsForSplit("smoke"));
    const holdout = listFixtureIdsForSplit("holdout");
    expect(holdout.length).toBeGreaterThan(0);
    for (const id of holdout) {
      expect(smoke.has(id)).toBe(false);
      expect(getFixtureSplit(getFixture(id))).toBe("holdout");
    }
  });
});
