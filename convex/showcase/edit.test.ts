import { describe, expect, it } from "vitest";
import { applyEditOps } from "./edit";

const doc = {
  _id: "x",
  userId: "u",
  title: "Report",
  content: { markdown: "P < MC under average-cost pricing. P < MC again." },
  questionsData: [{ question: "Q1", correctAnswer: 2, options: ["a", "b", "c"] }],
};

describe("applyEditOps", () => {
  it("replaces text at a nested path, every occurrence", () => {
    expect(
      applyEditOps(doc, [{ path: ["content", "markdown"], find: "P < MC", replace: "P > MC" }])
    ).toEqual({ content: { markdown: "P > MC under average-cost pricing. P > MC again." } });
  });

  it("sets values in arrays and top-level fields, without touching the input", () => {
    const changed = applyEditOps(doc, [
      { path: ["questionsData", 0, "correctAnswer"], set: 1 },
      { path: ["questionsData", 0, "options", 2], find: "c", replace: "C" },
      { path: ["title"], set: "Study Guide" },
    ]);
    expect(changed).toEqual({
      questionsData: [{ question: "Q1", correctAnswer: 1, options: ["a", "b", "C"] }],
      title: "Study Guide",
    });
    expect(doc.questionsData[0].correctAnswer).toBe(2);
  });

  it("throws when the text or path is missing", () => {
    expect(() => applyEditOps(doc, [{ path: ["title"], find: "Nope", replace: "x" }])).toThrow(
      /not found/
    );
    expect(() =>
      applyEditOps(doc, [{ path: ["questionsData", 5, "question"], find: "Q", replace: "x" }])
    ).toThrow(/No questionsData/);
  });

  it("refuses system and ownership fields", () => {
    expect(() => applyEditOps(doc, [{ path: ["userId"], set: "v" }])).toThrow(/Can't edit/);
    expect(() => applyEditOps(doc, [{ path: ["_id"], set: "v" }])).toThrow(/Can't edit/);
  });
});
