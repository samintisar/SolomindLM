import { describe, expect, it } from "vitest";
import {
  normalizeMathMarkdown,
  normalizeMathMarkdownDeep,
  splitByMathDelimiters,
} from "./mathMarkdown";

describe("splitByMathDelimiters", () => {
  it("returns single text segment when no delimiters", () => {
    const result = splitByMathDelimiters("plain text");
    expect(result).toEqual([{ kind: "text", s: "plain text" }]);
  });

  it("splits inline math $...$", () => {
    const result = splitByMathDelimiters("before $x=1$ after");
    expect(result).toEqual([
      { kind: "text", s: "before " },
      { kind: "math", s: "$x=1$" },
      { kind: "text", s: " after" },
    ]);
  });

  it("splits display math $$...$$", () => {
    const result = splitByMathDelimiters("before $$x=1$$ after");
    expect(result).toEqual([
      { kind: "text", s: "before " },
      { kind: "math", s: "$$x=1$$" },
      { kind: "text", s: " after" },
    ]);
  });

  it("handles multiple math spans", () => {
    const result = splitByMathDelimiters("$a$ and $b$");
    expect(result).toEqual([
      { kind: "math", s: "$a$" },
      { kind: "text", s: " and " },
      { kind: "math", s: "$b$" },
    ]);
  });

  it("splits at $ even when unclosed, treating rest as text", () => {
    const result = splitByMathDelimiters("text $unclosed rest");
    // Function splits at $, finds no closing $, treats remainder as text
    expect(result).toEqual([
      { kind: "text", s: "text " },
      { kind: "text", s: "$unclosed rest" },
    ]);
  });

  it("handles text starting with $", () => {
    const result = splitByMathDelimiters("$x$ rest");
    expect(result[0]).toEqual({ kind: "math", s: "$x$" });
    expect(result[1]).toEqual({ kind: "text", s: " rest" });
  });

  it("handles display math with longer content", () => {
    const result = splitByMathDelimiters("$$\\frac{1}{2}$$");
    expect(result).toEqual([{ kind: "math", s: "$$\\frac{1}{2}$$" }]);
  });

  it("distinguishes $$ from $", () => {
    const result = splitByMathDelimiters("$$display$$ $inline$");
    expect(result[0]).toEqual({ kind: "math", s: "$$display$$" });
    expect(result[2]).toEqual({ kind: "math", s: "$inline$" });
  });
});

describe("normalizeMathMarkdown", () => {
  it("returns falsy input unchanged", () => {
    expect(normalizeMathMarkdown("")).toBe("");
  });

  it("converts \\[...\\] to $$...$$", () => {
    const result = normalizeMathMarkdown("text \\[x^2\\] more");
    expect(result).toContain("$$x^2$$");
    expect(result).not.toContain("\\[x^2\\]");
  });

  it("converts \\(...\\) to $...$", () => {
    const result = normalizeMathMarkdown("text \\(x^2\\) more");
    expect(result).toContain("$x^2$");
    expect(result).not.toContain("\\(x^2\\)");
  });

  it("collapses LLM double-escaped \\(...\\) so $ is not escaped as \\\\$", () => {
    const input = "| x | \\\\(" + "\\gamma" + "\\\\), \\\\(" + "C" + "\\\\) |";
    const result = normalizeMathMarkdown(input);
    expect(result).toContain("$\\gamma$");
    expect(result).toContain("$C$");
    expect(result).not.toContain("\\$");
  });

  it("collapses repeated double-escapes in \\(...\\)", () => {
    const input = "\\\\(" + "\\gamma" + "\\\\)";
    const result = normalizeMathMarkdown(input);
    expect(result).toBe("$\\gamma$");
  });

  it("preserves code blocks", () => {
    const input = "```python\nx = [1, 2]\n```";
    expect(normalizeMathMarkdown(input)).toBe(input);
  });

  it("preserves inline code", () => {
    const input = "use `const x = 1` here";
    expect(normalizeMathMarkdown(input)).toBe(input);
  });

  it("detects parenthetical math segments", () => {
    const result = normalizeMathMarkdown("result (x_1 + x_2) end");
    expect(result).toContain("$x_1 + x_2$");
  });

  it("does not convert non-math parentheticals", () => {
    const result = normalizeMathMarkdown("see (Figure 1) below");
    expect(result).toContain("(Figure 1)");
    expect(result).not.toContain("$Figure 1$");
  });

  it("handles array column count mismatches", () => {
    const input = "$$\\begin{array}{cc}1 & 2 & 3\\\\end{array}$$";
    const result = normalizeMathMarkdown(input);
    // Should fix the column spec to match actual columns (3 columns, not 2)
    expect(result).toContain("ccc");
  });

  it("strips inner $...$ within $$...$$ display math", () => {
    const input = "$$outer $inner$ rest$$";
    const result = normalizeMathMarkdown(input);
    expect(result).toContain("$$outer inner rest$$");
    expect(result).not.toContain("$inner$");
  });

  it("handles trailing citations inside math delimiters", () => {
    const result = normalizeMathMarkdown("\\[x^2 [1]\\]");
    // Trailing [1] should be extracted outside the math span
    expect(result).toContain("[1]");
  });

  it("preserves complex LaTeX commands inside math", () => {
    const input = "$$\\frac{\\partial f}{\\partial x} = \\sum_{i=1}^{n} a_i$$";
    const result = normalizeMathMarkdown(input);
    expect(result).toContain("\\frac{\\partial f}{\\partial x}");
    expect(result).toContain("\\sum_{i=1}^{n}");
  });

  it("normalizes HTML entities in math", () => {
    const input = "$x &lt; 1$";
    const result = normalizeMathMarkdown(input);
    expect(result).toContain("x < 1");
  });

  it("replaces narrow no-break space (U+202F) inside math with ASCII space", () => {
    const nnbsp = "\u202F";
    const result = normalizeMathMarkdown(`$x${nnbsp}+${nnbsp}y$`);
    expect(result).toBe("$x + y$");
  });

  it("replaces exotic spaces after \\(...\\) is converted to $...$", () => {
    const nnbsp = "\u202F";
    const result = normalizeMathMarkdown(`\\(x${nnbsp}+${nnbsp}y\\)`);
    expect(result).toBe("$x + y$");
    expect(result).not.toContain(nnbsp);
  });

  it("replaces exotic Unicode spaces in display math", () => {
    const nnbsp = "\u202F";
    const result = normalizeMathMarkdown(`$$a${nnbsp}=${nnbsp}b$$`);
    expect(result).toBe("$$a = b$$");
    expect(result).not.toContain(nnbsp);
  });

  it("does not alter narrow no-break space in plain text", () => {
    const nnbsp = "\u202F";
    const input = `value${nnbsp}here`;
    expect(normalizeMathMarkdown(input)).toBe(input);
  });
});

describe("normalizeMathMarkdownDeep", () => {
  it("passes through non-string primitives", () => {
    expect(normalizeMathMarkdownDeep(42)).toBe(42);
    expect(normalizeMathMarkdownDeep(true)).toBe(true);
    expect(normalizeMathMarkdownDeep(null)).toBe(null);
    expect(normalizeMathMarkdownDeep(undefined)).toBe(undefined);
  });

  it("normalizes string values", () => {
    const result = normalizeMathMarkdownDeep("text \\[x^2\\]");
    expect(result).toContain("$$x^2$$");
  });

  it("recursively normalizes arrays", () => {
    const result = normalizeMathMarkdownDeep(["\\(a\\)", "\\(b\\)"]);
    expect(result).toEqual(["$a$", "$b$"]);
  });

  it("recursively normalizes objects", () => {
    const result = normalizeMathMarkdownDeep({ math: "\\[x\\]", text: "plain" });
    expect(result.math).toContain("$$x$$");
    expect(result.text).toBe("plain");
  });

  it("handles nested objects and arrays", () => {
    const input = { items: [{ content: "\\(a\\)" }, { content: "plain" }] };
    const result = normalizeMathMarkdownDeep(input);
    expect(result.items[0].content).toBe("$a$");
    expect(result.items[1].content).toBe("plain");
  });
});
