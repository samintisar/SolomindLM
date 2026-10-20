import { describe, expect, it } from "vitest";
import { withParaphrases } from "../fixtures/paraphraseVariants";
import { USE_CASE_PACKS } from "./index";

describe("pack paraphrase sets", () => {
  const withVariants = USE_CASE_PACKS.flatMap((p) =>
    p.fixtures
      .filter((f) => f.variants && f.variants.length > 0)
      .map((f) => [p.pack.id, f] as const)
  );

  it("has two paraphrases on one chat fixture in each of medical, professionals and researchers", () => {
    expect(withVariants.map(([packId, f]) => [packId, f.runner, f.variants?.length])).toEqual([
      ["medical-students", "chat", 2],
      ["professionals", "chat", 2],
      ["researchers", "chat", 2],
    ]);
  });

  it("gives every paraphrase a different wording from the base question", () => {
    for (const [, f] of withVariants) {
      for (const variant of f.variants ?? []) {
        expect(variant.trim()).not.toBe(f.question.trim());
      }
    }
  });

  it("expands to unique artifact ids", () => {
    for (const [, f] of withVariants) {
      const ids = withParaphrases(f).map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(1 + (f.variants?.length ?? 0));
    }
  });
});
