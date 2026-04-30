import { describe, expect, it } from "vitest";
import { withLanguageInstruction, SUPPORTED_LANGUAGES } from "./languageInstruction";

describe("withLanguageInstruction", () => {
  it("returns prompt unchanged when language is undefined", () => {
    expect(withLanguageInstruction("System prompt.")).toBe("System prompt.");
  });

  it("returns prompt unchanged for English", () => {
    expect(withLanguageInstruction("System prompt.", "en")).toBe("System prompt.");
  });

  it("appends Spanish instruction", () => {
    const result = withLanguageInstruction("You are a tutor.", "es");
    expect(result).toContain("You are a tutor.");
    expect(result).toContain("Spanish");
    expect(result.indexOf("You are a tutor.")).toBeLessThan(result.indexOf("Spanish"));
  });

  it("returns prompt unchanged for unknown code", () => {
    expect(withLanguageInstruction("System prompt.", "xx")).toBe("System prompt.");
  });

  it("exports all 15 languages", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(15);
  });

  it("every language code is unique", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
