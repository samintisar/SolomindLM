import { describe, expect, it } from "vitest";
import {
  canOpenRankedPapersDrilldown,
  canOpenScreeningDrilldown,
} from "./literatureReviewStepDrilldown";

describe("literatureReviewStepDrilldown", () => {
  it("allows ranked papers drilldown only for ranking step with session", () => {
    expect(canOpenRankedPapersDrilldown("ranking", true)).toBe(true);
    expect(canOpenRankedPapersDrilldown("ranking", false)).toBe(false);
    expect(canOpenRankedPapersDrilldown("screening", true)).toBe(false);
    expect(canOpenRankedPapersDrilldown("extracting", true)).toBe(false);
  });

  it("allows screening drilldown only for screening step with session", () => {
    expect(canOpenScreeningDrilldown("screening", true)).toBe(true);
    expect(canOpenScreeningDrilldown("screening", false)).toBe(false);
    expect(canOpenScreeningDrilldown("ranking", true)).toBe(false);
    expect(canOpenScreeningDrilldown("extracting", true)).toBe(false);
  });
});
