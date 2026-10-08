import { describe, expect, it } from "vitest";
import { INTENT_LANDING_PAGES } from "./intentLandingPages";
import { getIntentTool } from "./intentTools";

describe("intentTools", () => {
  it("has an icon and tone for every tool page", () => {
    for (const page of INTENT_LANDING_PAGES) {
      expect(getIntentTool(page.intentKey), page.intentKey).toBeDefined();
    }
  });
});
