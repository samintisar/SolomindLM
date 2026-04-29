import { describe, it, expect } from "vitest";
import { buildNotebookChatInstructionBlock } from "./chat_llm_prompts.js";

describe("buildNotebookChatInstructionBlock", () => {
  it("returns empty string for default mode with default length", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "default",
      responseLength: "default",
    });
    expect(result).toBe("");
  });

  it("returns learning guide instruction for learningGuide mode", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "learningGuide",
      responseLength: "default",
    });
    expect(result).toContain("LEARNING GUIDE MODE");
    expect(result).toContain("NOTEBOOK CHAT INSTRUCTIONS");
    expect(result).toContain("Socratic tutor");
  });

  it("includes custom instructions for custom mode", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "custom",
      customInstructions: "Always respond in French.",
      responseLength: "default",
    });
    expect(result).toContain("Always respond in French.");
    expect(result).toContain("NOTEBOOK CHAT INSTRUCTIONS");
  });

  it("ignores whitespace-only custom instructions", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "custom",
      customInstructions: "   \n  ",
      responseLength: "default",
    });
    expect(result).toBe("");
  });

  it("adds longer response preference", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "default",
      responseLength: "longer",
    });
    expect(result).toContain("more detailed");
    expect(result).toContain("NOTEBOOK CHAT INSTRUCTIONS");
  });

  it("adds shorter response preference", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "default",
      responseLength: "shorter",
    });
    expect(result).toContain("concise");
    expect(result).toContain("NOTEBOOK CHAT INSTRUCTIONS");
  });

  it("combines custom instructions with response length", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "custom",
      customInstructions: "Use bullet points.",
      responseLength: "shorter",
    });
    expect(result).toContain("Use bullet points.");
    expect(result).toContain("concise");
  });

  it("includes grounding priority disclaimer", () => {
    const result = buildNotebookChatInstructionBlock({
      instructionMode: "learningGuide",
      responseLength: "default",
    });
    expect(result).toContain("Source grounding rules");
    expect(result).toContain("citation format");
    expect(result).toContain("OVERRIDES the default response structure");
  });
});
