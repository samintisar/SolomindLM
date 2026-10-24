import { describe, expect, it } from "vitest";
import { stripModelPlaceholders } from "./modelPlaceholders";

describe("stripModelPlaceholders", () => {
  it("removes picture placeholders the model wrote for itself", () => {
    expect(
      stripModelPlaceholders(
        "A tax shifts supply left. [Image of supply and demand diagram with Pigouvian tax]"
      )
    ).toBe("A tax shifts supply left.");
    expect(stripModelPlaceholders("Phases repeat monthly [Diagram: lunar phases].")).toBe(
      "Phases repeat monthly."
    );
  });

  it("removes empty template slots", () => {
    expect(stripModelPlaceholders("Median pay rose 4% [text].")).toBe("Median pay rose 4%.");
    expect(stripModelPlaceholders("This is disputed [citation needed].")).toBe("This is disputed.");
  });

  it("keeps citations, links, indexing and ellipses", () => {
    const text =
      "See [1] and [2, 3], read [the docs](https://x.y), xs[0] is first, and [...] omits.";
    expect(stripModelPlaceholders(text)).toBe(text);
  });

  it("keeps a link whose label starts like a placeholder", () => {
    const text = "[Image of the week](https://x.y/img)";
    expect(stripModelPlaceholders(text)).toBe(text);
  });

  it("leaves code alone", () => {
    const text = "Use `arr[text]` here.\n\n```py\nprint(d['[Image of x]'])\n```";
    expect(stripModelPlaceholders(text)).toBe(text);
  });
});
