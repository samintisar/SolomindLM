import { describe, expect, it } from "vitest";
import { escapeCurrencyDollars, indexOfUnescaped, splitByMathDelimiters } from "./mathMarkdown";

describe("escapeCurrencyDollars", () => {
  it("escapes amounts that would pair up into a formula", () => {
    expect(escapeCurrencyDollars("marginal cost $5 sells 5 units at a uniform price of $10.")).toBe(
      "marginal cost \\$5 sells 5 units at a uniform price of \\$10."
    );
    expect(escapeCurrencyDollars("Price rose to **$33.00** after a $1.00 increase.")).toBe(
      "Price rose to **\\$33.00** after a \\$1.00 increase."
    );
    expect(escapeCurrencyDollars("Pay ranges $5, $10 and $15 per hour.")).toBe(
      "Pay ranges \\$5, \\$10 and \\$15 per hour."
    );
  });

  it("escapes amounts written $.50, $ 5 and $-3", () => {
    expect(escapeCurrencyDollars("Coins worth $.50 and $.25 each")).toBe(
      "Coins worth \\$.50 and \\$.25 each"
    );
    expect(escapeCurrencyDollars("a fee of $ 5 and a deposit of $ 20")).toBe(
      "a fee of \\$ 5 and a deposit of \\$ 20"
    );
    expect(escapeCurrencyDollars("a loss of $-3 and then $4")).toBe(
      "a loss of \\$-3 and then \\$4"
    );
  });

  it("escapes a lone amount and leaves already-escaped ones alone (idempotent)", () => {
    expect(escapeCurrencyDollars("Only one: costs $5.")).toBe("Only one: costs \\$5.");
    expect(escapeCurrencyDollars("costs \\$5 and \\$10")).toBe("costs \\$5 and \\$10");
    const once = escapeCurrencyDollars("costs $5 and $10, where $x^2$ is demand");
    expect(escapeCurrencyDollars(once)).toBe(once);
  });

  it("keeps real inline and display math", () => {
    for (const math of [
      "where $0 < \\theta < 1$ holds",
      "firms stay open while $P > AVC$ in the short run",
      "a fee of $5$ per unit",
      "solve $5x + 3 = 2$ for x",
      "$17 mod 5 = 2$ because",
      "a mass of $2 kg$ here",
      "$2 \\times 10^3$ units",
      "$x^2$ and $y_1$",
      "$$\\frac{1}{2} \\cdot 10$$",
      "$-3$ is negative",
    ]) {
      expect(escapeCurrencyDollars(math)).toBe(math);
    }
  });

  it("escapes currency next to real math without breaking the math", () => {
    expect(escapeCurrencyDollars("It costs $5 and $10 respectively, where $x$ is output.")).toBe(
      "It costs \\$5 and \\$10 respectively, where $x$ is output."
    );
    expect(escapeCurrencyDollars("$x$ rose by $5 to $12.")).toBe("$x$ rose by \\$5 to \\$12.");
  });

  it("leaves amounts in code alone: spans, fences, ~~~, indented and still-streaming", () => {
    for (const code of [
      "Run `echo $5 and $10` then",
      "Run ``echo `$5` and $10`` then",
      "```\nprice=$5 total=$10\n```",
      "~~~\nprice=$5 total=$10\n~~~",
      'Example:\n\n    echo "costs $5 and $10"',
      "```\nprice=$5 total=$10",
    ]) {
      expect(escapeCurrencyDollars(code)).toBe(code);
    }
  });

  it("doesn't pair a math span across blocks", () => {
    expect(escapeCurrencyDollars("Let $x$ be output.\n \n$5 is the price, $y\n")).toBe(
      "Let $x$ be output.\n \n\\$5 is the price, $y\n"
    );
    expect(escapeCurrencyDollars("- Rent: $x\n- Utilities: $150")).toBe(
      "- Rent: $x\n- Utilities: \\$150"
    );
  });
});

describe("escaped dollars downstream", () => {
  it("indexOfUnescaped skips escaped dollars", () => {
    expect(indexOfUnescaped("a \\$5 b $x$", "$")).toBe(8);
    expect(indexOfUnescaped("a \\\\$x$", "$")).toBe(4);
    expect(indexOfUnescaped("no dollars", "$")).toBe(-1);
  });

  it("splitByMathDelimiters treats escaped amounts as text", () => {
    const parts = splitByMathDelimiters(
      escapeCurrencyDollars("Pay is $120,230, up from $110,000, where $x$ is pay.")
    );
    expect(parts.filter((p) => p.kind === "math").map((p) => p.s)).toEqual(["$x$"]);
  });
});
