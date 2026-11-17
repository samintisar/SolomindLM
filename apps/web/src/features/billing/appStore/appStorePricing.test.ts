import { describe, expect, it } from "vitest";
import { yearlySavingsPercent } from "./appStorePricing";

describe("yearlySavingsPercent", () => {
  it("compares a year of monthly payments with the yearly price", () => {
    expect(yearlySavingsPercent(10, 60)).toBe(50);
  });
  it("is null without both prices", () => {
    expect(yearlySavingsPercent(null, 60)).toBeNull();
    expect(yearlySavingsPercent(10, null)).toBeNull();
  });
  it("is null when yearly saves nothing", () => {
    expect(yearlySavingsPercent(10, 120)).toBeNull();
    expect(yearlySavingsPercent(0, 60)).toBeNull();
  });
});
