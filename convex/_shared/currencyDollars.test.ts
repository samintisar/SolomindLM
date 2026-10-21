import { describe, expect, it } from "vitest";
import { escapeCurrencyDollars } from "./mathMarkdown";

describe("escapeCurrencyDollars", () => {
  it("escapes amounts that would pair up into a formula", () => {
    expect(escapeCurrencyDollars("marginal cost $5 sells 5 units at a uniform price of $10.")).toBe(
      "marginal cost \\$5 sells 5 units at a uniform price of $10."
    );
    expect(escapeCurrencyDollars("Price rose to **$33.00** after a $1.00 increase.")).toBe(
      "Price rose to **\\$33.00** after a $1.00 increase."
    );
    expect(escapeCurrencyDollars("Pay ranges $5, $10 and $15 per hour.")).toBe(
      "Pay ranges \\$5, \\$10 and $15 per hour."
    );
  });

  it("leaves a lone amount and already-escaped amounts alone", () => {
    expect(escapeCurrencyDollars("Only one: costs $5.")).toBe("Only one: costs $5.");
    expect(escapeCurrencyDollars("costs \\$5 and \\$10")).toBe("costs \\$5 and \\$10");
  });

  it("keeps real inline and display math", () => {
    for (const math of [
      "where $0 < \\theta < 1$ holds",
      "firms stay open while $P > AVC$ in the short run",
      "a fee of $5$ per unit",
      "solve $5x + 3 = 2$ for x",
      "$2 \\times 10^3$ units",
      "$x^2$ and $y_1$",
      "$$\\frac{1}{2} \\cdot 10$$",
    ]) {
      expect(escapeCurrencyDollars(math)).toBe(math);
    }
  });

  it("escapes currency next to real math without breaking the math", () => {
    expect(escapeCurrencyDollars("It costs $5 and $10 respectively, where $x$ is output.")).toBe(
      "It costs \\$5 and \\$10 respectively, where $x$ is output."
    );
    expect(escapeCurrencyDollars("$x$ rose by $5 to $12.")).toBe("$x$ rose by \\$5 to $12.");
  });

  it("leaves amounts in code spans and fences alone", () => {
    const code = "Run `echo $5 and $10` then\n\n```\nprice=$5 total=$10\n```";
    expect(escapeCurrencyDollars(code)).toBe(code);
  });

  it("doesn't pair amounts across paragraphs", () => {
    expect(escapeCurrencyDollars("Costs $5.\n\nEarns $10 a week.")).toBe(
      "Costs $5.\n\nEarns $10 a week."
    );
  });
});
