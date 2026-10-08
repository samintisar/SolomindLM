import { describe, expect, it } from "vitest";
import { INTENT_LANDING_PAGES } from "./intentLandingPages";
import { getIntentScene } from "./intentScenes";

describe("intentScenes", () => {
  it("has a scene with 1-3 sources for every tool page", () => {
    for (const page of INTENT_LANDING_PAGES) {
      const scene = getIntentScene(page.intentKey);
      expect(scene, page.intentKey).toBeDefined();
      expect(scene?.sources.length).toBeGreaterThanOrEqual(1);
      expect(scene?.sources.length).toBeLessThanOrEqual(3);
    }
  });

  it("has no scene for an unknown tool", () => {
    expect(getIntentScene("notATool")).toBeUndefined();
  });
});
