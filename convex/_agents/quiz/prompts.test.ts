import { describe, expect, it } from "vitest";
import { getExpandPrompt, type QuizCandidate } from "./prompts";

function candidate(difficulty: QuizCandidate["difficulty"]): QuizCandidate {
  return {
    topic: "Topic",
    question: "Draft question?",
    correctAnswer: "Answer",
    contextSnippet: "Some context.",
    difficulty,
  };
}

describe("getExpandPrompt stem length", () => {
  it("asks for progressively longer stems as difficulty rises", () => {
    const limit = (difficulty: QuizCandidate["difficulty"]) => {
      const line = getExpandPrompt(candidate(difficulty))
        .split("\n")
        .find((l) => l.startsWith("**Question Length:**"));
      expect(line).toBeDefined();
      return Number(/about (\d+) words/.exec(line ?? "")?.[1]);
    };

    expect(limit("easy")).toBeLessThan(limit("medium"));
    expect(limit("medium")).toBeLessThan(limit("hard"));
  });

  it("does not require a scenario for every difficulty", () => {
    expect(getExpandPrompt(candidate("easy"))).not.toContain(
      "Create a hypothetical scenario that fits"
    );
  });
});
