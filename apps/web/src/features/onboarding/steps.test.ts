import { describe, expect, test } from "vitest";
import { STEP_DEFINITIONS, STEP_IDS } from "./steps";

describe("step definitions", () => {
  test("ids are in the documented order", () => {
    expect(STEP_IDS).toEqual([
      "createNotebook",
      "addSource",
      "askQuestion",
      "generateArtifact",
    ]);
  });

  test("every step has selector and copy", () => {
    for (const step of STEP_DEFINITIONS) {
      expect(step.targetSelector).toMatch(/^\[data-onboarding=".+"\]$/);
      expect(step.copy.length).toBeGreaterThan(20);
    }
  });

  test("createNotebook is bound to /home; the rest to /notebook/:id", () => {
    expect(STEP_DEFINITIONS[0].route).toBe("home");
    for (const step of STEP_DEFINITIONS.slice(1)) {
      expect(step.route).toBe("notebook");
    }
  });
});
