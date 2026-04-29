import { describe, it, expect } from "vitest";
import {
  PROMPT_TEXT_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  PROMPT_DESCRIPTION_MAX_LENGTH,
  PROMPT_REPORT_REASON_MAX_LENGTH,
  PROMPT_REPORT_AUTO_HIDE_THRESHOLD,
  RATING_PRIOR_MEAN,
  RATING_PRIOR_COUNT,
} from "./config.js";

describe("Prompt library config constants", () => {
  it("has positive length limits", () => {
    expect(PROMPT_TEXT_MAX_LENGTH).toBeGreaterThan(0);
    expect(PROMPT_TITLE_MAX_LENGTH).toBeGreaterThan(0);
    expect(PROMPT_DESCRIPTION_MAX_LENGTH).toBeGreaterThan(0);
  });

  it("text limit is larger than title and description limits", () => {
    expect(PROMPT_TEXT_MAX_LENGTH).toBeGreaterThan(PROMPT_TITLE_MAX_LENGTH);
    expect(PROMPT_TEXT_MAX_LENGTH).toBeGreaterThan(PROMPT_DESCRIPTION_MAX_LENGTH);
  });

  it("has a positive report auto-hide threshold", () => {
    expect(PROMPT_REPORT_AUTO_HIDE_THRESHOLD).toBeGreaterThan(0);
  });

  it("has a positive report reason max length", () => {
    expect(PROMPT_REPORT_REASON_MAX_LENGTH).toBeGreaterThan(0);
  });

  it("Bayesian prior values are sensible", () => {
    expect(RATING_PRIOR_MEAN).toBeGreaterThanOrEqual(1);
    expect(RATING_PRIOR_MEAN).toBeLessThanOrEqual(5);
    expect(RATING_PRIOR_COUNT).toBeGreaterThan(0);
  });
});
