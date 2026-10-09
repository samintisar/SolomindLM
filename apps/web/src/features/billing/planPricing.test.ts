import { describe, expect, it } from "vitest";
import {
  formatUsd,
  PRO_PRICE_USD,
  PRO_YEARLY_PER_MONTH_USD,
  PRO_YEARLY_SAVINGS_PERCENT,
} from "./planPricing";

describe("planPricing", () => {
  it("formats whole dollars without cents and fractions with two decimals", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(15)).toBe("$15");
    expect(formatUsd(7.5)).toBe("$7.50");
  });

  it("derives the yearly per-month price and the savings from the list prices", () => {
    expect(PRO_YEARLY_PER_MONTH_USD).toBe(PRO_PRICE_USD.yearly / 12);
    expect(PRO_YEARLY_SAVINGS_PERCENT).toBeGreaterThan(0);
    expect(PRO_YEARLY_SAVINGS_PERCENT).toBeLessThan(100);
  });
});
