import { describe, expect, test } from "vitest";
import { buildWriterPrompt } from "./prompts";

describe("buildWriterPrompt", () => {
  test("uses global [1] [2] across sub-questions", () => {
    const prompt = buildWriterPrompt(
      "Q?",
      [
        { id: "sq1", question: "A?" },
        { id: "sq2", question: "B?" },
      ],
      {
        sq1: [{ sourceType: "notebook", sourceTitle: "T1", content: "c1" }],
        sq2: [{ sourceType: "notebook", sourceTitle: "T2", content: "c2" }],
      }
    );
    expect(prompt).toContain("[1]");
    expect(prompt).toContain("[2]");
    expect(prompt.indexOf("[1]")).toBeLessThan(prompt.indexOf("[2]"));
  });
});
