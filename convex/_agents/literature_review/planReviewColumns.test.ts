import { describe, expect, it } from "vitest";
import {
  BENCHMARK_RELIABILITY_SUGGESTED_COLUMNS,
  isBenchmarkReliabilityQuestion,
  isLegacyGenericColumnSet,
} from "./planReviewColumns";

describe("planReviewColumns", () => {
  it("detects benchmark reliability questions", () => {
    expect(
      isBenchmarkReliabilityQuestion(
        "How reliable are LLM evaluation benchmarks at predicting real-world performance?"
      )
    ).toBe(true);
    expect(isBenchmarkReliabilityQuestion("What is the history of poetry?")).toBe(false);
  });

  it("detects legacy generic column set", () => {
    expect(
      isLegacyGenericColumnSet([
        { id: "study_design" },
        { id: "sample_size" },
        { id: "key_findings" },
        { id: "limitations" },
        { id: "methodology" },
      ])
    ).toBe(true);
  });

  it("benchmark fallback columns include predictive validity fields", () => {
    const ids = BENCHMARK_RELIABILITY_SUGGESTED_COLUMNS.map((c) => c.id);
    expect(ids).toContain("predictive_validity");
    expect(ids).toContain("benchmark_deployment_gap");
  });
});
