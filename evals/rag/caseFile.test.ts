import { describe, expect, it } from "vitest";
import { caseFileStem } from "./caseFile";

describe("caseFileStem", () => {
  it("keeps plain case ids unchanged", () => {
    expect(caseFileStem("agentic-patterns-20")).toBe("agentic-patterns-20");
  });

  it("flattens namespaced use-case pack ids into one path segment", () => {
    expect(caseFileStem("medical-students/flashcards-heart-anatomy")).toBe(
      "medical-students__flashcards-heart-anatomy"
    );
  });

  it("flattens backslashes too, so no id can escape its directory", () => {
    expect(caseFileStem("a\\b/c")).toBe("a__b__c");
  });
});
