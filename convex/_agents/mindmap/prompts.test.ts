import { describe, expect, it } from "vitest";
import { MAP_PROMPT, REDUCE_PROMPT, withMindMapRequest } from "./prompts";

describe("withMindMapRequest", () => {
  it("leaves the prompt unchanged when there is no request", () => {
    expect(withMindMapRequest(MAP_PROMPT, undefined)).toBe(MAP_PROMPT);
    expect(withMindMapRequest(MAP_PROMPT, "   ")).toBe(MAP_PROMPT);
  });

  it("adds the user's request and keeps the output grounded in the source", () => {
    const prompt = withMindMapRequest(REDUCE_PROMPT, "Organize by mechanism of action");
    expect(prompt.startsWith(REDUCE_PROMPT)).toBe(true);
    expect(prompt).toContain('"Organize by mechanism of action"');
    expect(prompt).toMatch(/only (use|include) .*source/i);
  });
});
