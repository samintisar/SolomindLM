import { describe, expect, test } from "vitest";
import {
  deepResearchReportTitle,
  deepResearchTableTitle,
  fallbackResearchTitleFromQuery,
  normalizeResearchTitle,
} from "./titles";

describe("research titles", () => {
  test("normalizeResearchTitle uses Deep Research as empty fallback", () => {
    expect(normalizeResearchTitle("")).toBe("Deep Research");
    expect(normalizeResearchTitle("  Quantum Error Correction  ")).toBe("Quantum Error Correction");
  });

  test("fallbackResearchTitleFromQuery strips prompt prefixes", () => {
    expect(
      fallbackResearchTitleFromQuery(
        "Write a deep research report on climate adaptation in coastal cities"
      )
    ).not.toMatch(/^write a/i);
  });

  test("table and report title helpers", () => {
    expect(deepResearchTableTitle("Quantum Computing Advances")).toBe(
      "Quantum Computing Advances: Evidence Table"
    );
    expect(deepResearchReportTitle("Quantum Computing Advances")).toBe(
      "Quantum Computing Advances"
    );
  });
});
