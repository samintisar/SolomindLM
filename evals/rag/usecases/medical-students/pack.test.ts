import { describe, expect, it } from "vitest";
import type { ConcreteRunnerKind, EvalSplit } from "../../types";
import { getPack } from "../index";
import { validatePack } from "../validate";

const RUNNERS = ["flashcards", "quiz", "writtenQuestions", "chat"] as const;

describe("medical-students pack", () => {
  const registered = getPack("medical-students");
  const { pack, fixtures } = registered;

  it("is valid", () => {
    expect(validatePack(registered)).toEqual([]);
  });

  it("has 2 smoke, 6 train and 2 holdout fixtures", () => {
    const count = (split: EvalSplit) => fixtures.filter((f) => f.split === split).length;
    expect([count("smoke"), count("train"), count("holdout")]).toEqual([2, 6, 2]);
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

  it("has the six rubric checks from the spec", () => {
    expect(pack.rubric.map((c) => c.id)).toEqual([
      "front-hides-answer",
      "one-fact-per-item",
      "terms-and-values-exact",
      "answer-key-supported",
      "mechanism-in-order",
      "no-unsourced-clinical-claims",
    ]);
  });
});
