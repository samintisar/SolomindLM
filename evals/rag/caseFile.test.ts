import { describe, expect, it } from "vitest";
import { caseFileStem } from "./caseFile";

describe("caseFileStem", () => {
  it("keeps plain case ids unchanged", () => {
    expect(caseFileStem("agentic-patterns-20")).toBe("agentic-patterns-20");
  });

  it("flattens namespaced use-case pack ids into one path segment", () => {
    expect(caseFileStem("medical-students/flashcards-heart-anatomy")).toBe(
      "medical-students%2Fflashcards-heart-anatomy"
    );
  });

  it("encodes backslashes too, so no id can escape its directory", () => {
    expect(caseFileStem("a\\b/c")).toBe("a%5Cb%2Fc");
  });

  it("never maps two distinct ids to the same stem", () => {
    expect(caseFileStem("a/b")).not.toBe(caseFileStem("a__b"));
  });
});
