import { describe, expect, it } from "vitest";
import { formatCodeInText, isCodeSpan } from "./codeFormatting";

describe("isCodeSpan", () => {
  it("treats identifiers, keyword arguments and f-strings as code", () => {
    expect(isCodeSpan("dataloader, model, loss_fn, optimizer")).toBe(true);
    expect(isCodeSpan("start_dim=1, end_dim=-1")).toBe(true);
    expect(isCodeSpan("csv_path")).toBe(true);
    expect(isCodeSpan('f"loss: {loss:>7f}"')).toBe(true);
  });

  it("leaves math alone", () => {
    expect(isCodeSpan("x_i")).toBe(false);
    expect(isCodeSpan("\\alpha_{t}")).toBe(false);
    expect(isCodeSpan("P > MC")).toBe(false);
    expect(isCodeSpan("y = mx + b")).toBe(false);
  });
});

describe("formatCodeInText", () => {
  it("unwraps dollar signs around code", () => {
    expect(formatCodeInText("Call def train_loop($dataloader, model, loss_fn, optimizer$):")).toBe(
      "Call def train_loop(dataloader, model, loss_fn, optimizer):"
    );
    expect(formatCodeInText("Use nn.Flatten($start_dim=1, end_dim=-1$) first.")).toBe(
      "Use nn.Flatten(start_dim=1, end_dim=-1) first."
    );
  });

  it("keeps math spans", () => {
    const text = "The gradient $\\nabla_w L$ shrinks as $x_i$ grows.";
    expect(formatCodeInText(text)).toBe(text);
  });

  it("fences unfenced multi-line code", () => {
    const text = [
      "The loop looks like this:",
      "def train_loop(dataloader, model):",
      "    for X, y in dataloader:",
      "        loss = loss_fn(model(X), y)",
      "It then steps the optimizer.",
    ].join("\n");
    expect(formatCodeInText(text)).toBe(
      [
        "The loop looks like this:",
        "```",
        "def train_loop(dataloader, model):",
        "    for X, y in dataloader:",
        "        loss = loss_fn(model(X), y)",
        "```",
        "It then steps the optimizer.",
      ].join("\n")
    );
  });

  it("doesn't fence a single code-like line or prose", () => {
    const text = "Set x = 5 so the loop runs.\nThis means the model trains.";
    expect(formatCodeInText(text)).toBe(text);
  });

  it("drops a fenced block that repeats an earlier one", () => {
    const block = "```python\nprint(loss)\nopt.step()\n```";
    expect(formatCodeInText(`${block}\n\nAgain:\n\n${block}`)).toBe(`${block}\n\nAgain:\n\n`);
  });

  it("leaves existing code untouched", () => {
    const text = "Use `$csv_path$` and\n```\nx = $a_b$\ny = 2\n```";
    expect(formatCodeInText(text)).toBe(text);
  });
});

describe("formatCodeInText: markdown", () => {
  it("doesn't fence headings or lists", () => {
    const text = "# Overview\nx_total = compute()\n\n- First point\n- Second point";
    expect(formatCodeInText(text)).toBe(text);
  });
});

describe("formatCodeInText: math that looks like code", () => {
  it("keeps equations between capitalised names and primes as math", () => {
    expect(isCodeSpan("MR = MC")).toBe(false);
    expect(isCodeSpan("TC = FC + VC")).toBe(false);
    expect(isCodeSpan("f'(x) = 2x")).toBe(false);
    expect(isCodeSpan("f'(x) + g'(x)")).toBe(false);
    const text = "Profit peaks where $MR = MC$, and $f'(x) = 0$ there.";
    expect(formatCodeInText(text)).toBe(text);
  });

  it("doesn't fence consecutive equation lines", () => {
    const text = "TC = FC + VC\nMC = dTC/dQ";
    expect(formatCodeInText(text)).toBe(text);
  });

  it("still treats string literals and keyword arguments as code", () => {
    expect(isCodeSpan("pd.read_csv('data.csv')")).toBe(true);
    expect(isCodeSpan("dim=1")).toBe(true);
  });
});
