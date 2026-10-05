import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/shared/types";
import { toDisplayPick } from "./quizOptionLabels";

const question = (options: string[], answer = 0): QuizQuestion =>
  ({ question: "Q?", options, answer, hint: "", explanation: "" }) as QuizQuestion;

describe("toDisplayPick", () => {
  it("passes a pick through on a four-option question", () => {
    expect(toDisplayPick(question(["a", "b", "c", "d"]), 2)).toBe(2);
  });

  it("maps the fifth option to the last shown one", () => {
    expect(toDisplayPick(question(["a", "b", "c", "d", "e"], 4), 4)).toBe(3);
  });

  it("keeps picks 0-3 on a five-option question", () => {
    expect(toDisplayPick(question(["a", "b", "c", "d", "e"]), 1)).toBe(1);
  });

  it("clamps a pick past the shown options", () => {
    expect(toDisplayPick(question(["a", "b"]), 3)).toBe(1);
  });
});
