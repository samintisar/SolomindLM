import { describe, expect, it } from "vitest";
import { getStructureHint } from "./chat_llm_grounding";

const isComparisonHint = (hint: string) => hint.startsWith("Hint: This is a comparison.");

describe("getStructureHint", () => {
  describe("comparison questions", () => {
    it.each([
      "How does method A differ from method B, and what are the exact scores?",
      "Compare the two approaches",
      "Comparing the treatment and control groups, what changed?",
      "What is the difference between mitosis and meiosis?",
      "What are the key differences between the drafts?",
      "Contrast the two theories",
      "Model A vs Model B",
      "Model A vs. Model B: which is faster?",
      "Classical versus operant conditioning",
    ])("gets the comparison hint: %s", (question) => {
      expect(isComparisonHint(getStructureHint(question))).toBe(true);
    });

    it("does not force a fixed outline onto the answer", () => {
      const hint = getStructureHint("How does method A differ from method B?");
      expect(hint).not.toMatch(/Core Definition|Use Cases|Relationships|summary table at the end/);
    });

    it.each([
      "Explain differential privacy",
      "What is contrastive learning?",
      "How do canvas-based editors render text?",
    ])("ignores comparison words inside other words: %s", (question) => {
      expect(isComparisonHint(getStructureHint(question))).toBe(false);
    });
  });

  it("gives the math hint for equation questions but not for words containing 'math'", () => {
    expect(getStructureHint("Write the update equation")).toMatch(/\$\.\.\.\$/);
    expect(getStructureHint("What happened in the aftermath of the reform?")).not.toMatch(
      /\$\.\.\.\$/
    );
  });

  it("gives the list hint for list requests but not for words containing 'list'", () => {
    expect(getStructureHint("List the side effects")).toMatch(/numbered or bulleted lists/);
    expect(getStructureHint("Which specialist wrote the report?")).not.toMatch(
      /numbered or bulleted lists/
    );
  });

  it("gives the coverage hint for broad questions", () => {
    expect(getStructureHint("What are the main findings?")).toMatch(/Cover ALL major aspects/);
    expect(getStructureHint("Describe the sampling method")).toMatch(/Cover ALL major aspects/);
  });

  it("returns no hint for a plain factual question", () => {
    expect(getStructureHint("Which dataset was used?")).toBe("");
  });
});
