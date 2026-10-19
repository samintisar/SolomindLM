import { describe, expect, it } from "vitest";
import { USE_CASE_PACKS } from "./index";

describe("unanswerable pack fixtures", () => {
  it.each(USE_CASE_PACKS.map((p) => [p.pack.id, p] as const))(
    "%s has one train and one holdout unanswerable chat fixture",
    (_id, registered) => {
      const unanswerable = registered.fixtures.filter((f) => f.expectAbstain === true);
      expect(unanswerable.map((f) => f.split).sort()).toEqual(["holdout", "train"]);
      for (const f of unanswerable) {
        expect(f.runner).toBe("chat");
        expect(f.expectedItems).toEqual([]);
        expect(f.expectedAnswer?.trim()).toBeTruthy();
        expect(f.tags).toContain("unanswerable");
        expect(f.expectedBehavior).toMatch(/^Pass if the answer clearly states/);
        expect(f.expectedBehavior).toMatch(
          /Fail if it presents facts as if drawn from the sources/
        );
      }
    }
  );
});
