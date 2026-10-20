import { describe, expect, it } from "vitest";
import type { ConcreteRunnerKind, EvalSplit } from "../../types";
import { getPack } from "../index";
import { validatePack } from "../validate";

const RUNNERS = ["flashcards", "quiz", "writtenQuestions", "chat"] as const;

describe("language-learners pack", () => {
  const registered = getPack("language-learners");
  const { pack, fixtures } = registered;

  it("is valid", () => {
    expect(validatePack(registered)).toEqual([]);
  });

  it("has 2 smoke, 11 train and 4 holdout fixtures", () => {
    const count = (split: EvalSplit) => fixtures.filter((f) => f.split === split).length;
    expect([count("smoke"), count("train"), count("holdout")]).toEqual([2, 11, 4]);
  });

  it("has four multi-turn chat fixtures, two per instruction mode", () => {
    const multiTurn = fixtures.filter((f) => f.turns && f.turns.length > 0);
    expect(multiTurn.every((f) => f.runner === "chat")).toBe(true);
    const modes = multiTurn.map((f) => f.chatSettings?.instructionMode ?? "default");
    expect(multiTurn).toHaveLength(4);
    expect(modes.filter((m) => m === "learningGuide")).toHaveLength(2);
    expect(modes.filter((m) => m === "default")).toHaveLength(2);
  });

  it("has one train chat fixture that requires French output", () => {
    const french = fixtures.filter((f) => f.chat?.outputLanguage === "fr");
    expect(french.map((f) => [f.split, f.runner])).toEqual([["train", "chat"]]);
  });

  it("exercises every feature (written questions at least once, the rest at least twice)", () => {
    expect(pack.features).toEqual([...RUNNERS]);
    const count = (runner: ConcreteRunnerKind) =>
      fixtures.filter((f) => f.runner === runner).length;
    expect(count("writtenQuestions")).toBeGreaterThanOrEqual(1);
    for (const runner of ["flashcards", "quiz", "chat"] as const) {
      expect(count(runner)).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives each single-turn answerable chat fixture 1 to 3 gold passages and no other fixture any", () => {
    // Unanswerable fixtures have nothing to retrieve; multi-turn ones test the conversation.
    for (const f of fixtures) {
      if (f.runner === "chat" && !f.expectAbstain && !f.turns?.length) {
        expect(f.expectedPassages?.length ?? 0).toBeGreaterThanOrEqual(1);
        expect(f.expectedPassages?.length ?? 0).toBeLessThanOrEqual(3);
      } else {
        expect(f.expectedPassages).toBeUndefined();
      }
    }
  });

  it("has the six rubric checks from the design", () => {
    expect(pack.rubric.map((c) => c.id)).toEqual([
      "front-hides-answer",
      "one-point-per-item",
      "target-language-correct",
      "answer-key-supported",
      "blanks-complete-correctly",
      "explains-with-example",
    ]);
  });
});
