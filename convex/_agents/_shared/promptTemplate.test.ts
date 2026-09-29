import { describe, expect, it } from "vitest";
import { fillTemplate } from "./promptTemplate";

describe("fillTemplate", () => {
  it("replaces every occurrence and leaves unknown braces (e.g. LaTeX) alone", () => {
    expect(fillTemplate("{a} and {a}; \\frac{m}{d}", { a: "x" })).toBe("x and x; \\frac{m}{d}");
  });

  it("inserts values verbatim without re-substituting placeholders inside them", () => {
    const template = "FOCUS: {customPrompt}\nSOURCE: {content}";

    expect(fillTemplate(template, { customPrompt: "use {content}", content: "costs $& $'" })).toBe(
      "FOCUS: use {content}\nSOURCE: costs $& $'"
    );
  });
});
