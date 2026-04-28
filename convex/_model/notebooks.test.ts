import { describe, it, expect } from "vitest";
import { normalizeChatSettings } from "./notebooks.js";

describe("normalizeChatSettings", () => {
  it("returns undefined for undefined input", () => {
    expect(normalizeChatSettings(undefined)).toBeUndefined();
  });

  it("returns undefined for all-default settings", () => {
    expect(
      normalizeChatSettings({ instructionMode: "default", responseLength: "default" })
    ).toBeUndefined();
  });

  it("normalizes custom with empty customInstructions to default", () => {
    expect(
      normalizeChatSettings({
        instructionMode: "custom",
        customInstructions: "",
        responseLength: "default",
      })
    ).toBeUndefined();
  });

  it("normalizes custom with whitespace-only customInstructions to default", () => {
    expect(
      normalizeChatSettings({
        instructionMode: "custom",
        customInstructions: "   \n  ",
        responseLength: "default",
      })
    ).toBeUndefined();
  });

  it("keeps custom mode when customInstructions is present", () => {
    const result = normalizeChatSettings({
      instructionMode: "custom",
      customInstructions: "Always respond in French.",
      responseLength: "default",
    });
    expect(result).toEqual({
      instructionMode: "custom",
      customInstructions: "Always respond in French.",
      responseLength: "default",
    });
  });

  it("trims custom instructions", () => {
    const result = normalizeChatSettings({
      instructionMode: "custom",
      customInstructions: "  Hello  ",
      responseLength: "default",
    });
    expect(result?.customInstructions).toBe("Hello");
  });

  it("keeps learningGuide with default responseLength", () => {
    const result = normalizeChatSettings({
      instructionMode: "learningGuide",
      responseLength: "default",
    });
    expect(result).toEqual({
      instructionMode: "learningGuide",
      responseLength: "default",
    });
  });

  it("keeps default mode with non-default responseLength", () => {
    const result = normalizeChatSettings({
      instructionMode: "default",
      responseLength: "longer",
    });
    expect(result).toEqual({
      instructionMode: "default",
      responseLength: "longer",
    });
  });

  it("custom with empty text but non-default length keeps the length", () => {
    const result = normalizeChatSettings({
      instructionMode: "custom",
      customInstructions: "",
      responseLength: "shorter",
    });
    expect(result).toEqual({
      instructionMode: "default",
      responseLength: "shorter",
    });
  });
});
