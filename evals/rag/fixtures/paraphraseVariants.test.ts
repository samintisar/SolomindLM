import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { withParaphrases } from "./paraphraseVariants";

const base = {
  schemaVersion: 1,
  id: "wiring/chat-01",
  runner: "chat",
  question: "Why do the AV valves close?",
  notebookId: "nb",
  expectedItems: ["isovolumic contraction"],
  expectedBehavior: "Explains the pressure change.",
  tags: ["chat"],
  variants: ["What closes the AV valves at systole?", "Why do the atrioventricular valves shut?"],
} as EvalFixture;

describe("withParaphrases", () => {
  it("returns the base first, then one artifact per paraphrase with --p ids", () => {
    const [first, p1, p2] = withParaphrases(base);
    expect(first?.id).toBe("wiring/chat-01");
    expect(first?.question).toBe("Why do the AV valves close?");
    expect(p1?.id).toBe("wiring/chat-01--p1");
    expect(p1?.question).toBe("What closes the AV valves at systole?");
    expect(p2?.id).toBe("wiring/chat-01--p2");
    expect(p2?.question).toBe("Why do the atrioventricular valves shut?");
  });

  it("keeps everything else the same and tags each paraphrase", () => {
    const [, p1] = withParaphrases(base);
    expect(p1).toMatchObject({
      runner: "chat",
      notebookId: "nb",
      expectedItems: ["isovolumic contraction"],
      expectedBehavior: "Explains the pressure change.",
      schemaVersion: 2,
    });
    expect(p1?.tags).toEqual(["chat", "paraphrase"]);
    expect(p1?.variants).toBeUndefined();
  });

  it("returns only the base when there are no paraphrases", () => {
    expect(withParaphrases({ ...base, variants: undefined })).toEqual([
      { ...base, variants: undefined },
    ]);
  });

  it("rejects a blank paraphrase", () => {
    expect(() => withParaphrases({ ...base, variants: ["  "] })).toThrow(/wiring\/chat-01/);
  });
});
