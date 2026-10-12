import { describe, expect, it } from "vitest";
import { QUIZ_EXPAND_LLM_OPTIONS } from "./quizJobPhases";

describe("QUIZ_EXPAND_LLM_OPTIONS", () => {
  it("keeps reasoning off so it can't use the expansion budget and drop the question (#201)", () => {
    expect(QUIZ_EXPAND_LLM_OPTIONS.reasoningEnabled).toBe(false);
  });
});
