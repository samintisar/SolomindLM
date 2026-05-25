import { describe, expect, test } from "vitest";
import {
  fallbackReviewTitleFromQuery,
  literatureReportTitle,
  literatureTableTitle,
  normalizeReviewTitle,
} from "./titles";

describe("normalizeReviewTitle", () => {
  test("trims quotes and collapses whitespace", () => {
    expect(normalizeReviewTitle('  "Digital Health for Depression"  ')).toBe(
      "Digital Health for Depression"
    );
  });
});

describe("fallbackReviewTitleFromQuery", () => {
  test("uses first sentence and drops trailing requirements", () => {
    const query =
      "What digital interventions exist for treating depression? Include RCT evidence with effect sizes.";
    expect(fallbackReviewTitleFromQuery(query)).toBe(
      "What digital interventions exist for treating depression?"
    );
  });

  test("returns default for empty query", () => {
    expect(fallbackReviewTitleFromQuery("   ")).toBe("Literature Review");
  });
});

describe("literatureTableTitle", () => {
  test("appends evidence table suffix once", () => {
    expect(literatureTableTitle("Digital Interventions for Depression")).toBe(
      "Digital Interventions for Depression: Evidence Table"
    );
    expect(literatureTableTitle("Topic: Evidence Table")).toBe("Topic: Evidence Table");
  });
});

describe("literatureReportTitle", () => {
  test("strips legacy report prefix", () => {
    expect(literatureReportTitle("Report — Depression Interventions")).toBe(
      "Depression Interventions"
    );
  });
});
