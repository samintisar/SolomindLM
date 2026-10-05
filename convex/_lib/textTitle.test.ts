import { describe, expect, it } from "vitest";
import { PASTED_TEXT_TITLE, textTitleSource, userTitleForText } from "./textTitle";

describe("userTitleForText", () => {
  it("keeps a title the user typed", () => {
    expect(userTitleForText("  Lecture 3 notes  ")).toBe("Lecture 3 notes");
  });

  it("treats the placeholder or an empty name as no title", () => {
    expect(userTitleForText(PASTED_TEXT_TITLE)).toBeNull();
    expect(userTitleForText("Pasted Text")).toBeNull();
    expect(userTitleForText("   ")).toBeNull();
    expect(userTitleForText(undefined)).toBeNull();
  });
});

describe("textTitleSource", () => {
  it("uses the start of the text, trimmed, up to 2000 characters", () => {
    expect(textTitleSource("  hello world  ")).toBe("hello world");
    expect(textTitleSource("y".repeat(5000))).toHaveLength(2000);
  });
});
