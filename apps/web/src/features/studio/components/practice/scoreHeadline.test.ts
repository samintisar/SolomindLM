import { describe, expect, it } from "vitest";
import { scoreHeadline } from "./scoreHeadline";

describe("scoreHeadline", () => {
  it.each([
    [1, "Perfect score"],
    [0.75, "Nicely done"],
    [0.7, "Nicely done"],
    [0.5, "Good effort"],
    [0.4, "Good effort"],
    [0.1, "Keep practising"],
    [0, "Keep practising"],
  ])("%s → %s", (fraction, headline) => {
    expect(scoreHeadline(fraction)).toBe(headline);
  });
});
