// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPassageHighlight, highlightPassage, PASSAGE_HIGHLIGHT } from "./highlightPassage";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("highlightPassage", () => {
  it("paints the passage with the CSS highlight registry and scrolls to it", () => {
    const registry = new Map<string, unknown>();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      }
    );
    const root = mount("<p>Intro.</p><p>The <strong>model</strong> retrieves passages.</p>");
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    expect(highlightPassage(root, "The **model** retrieves passages.")).toBe(true);

    const highlight = registry.get(PASSAGE_HIGHLIGHT) as { ranges: Range[] };
    expect(highlight.ranges[0].toString()).toBe("The model retrieves passages");
    expect(scroll).toHaveBeenCalled();

    clearPassageHighlight();
    expect(registry.has(PASSAGE_HIGHLIGHT)).toBe(false);
  });

  it("still scrolls when the browser has no highlight registry", () => {
    vi.stubGlobal("CSS", {});
    const root = mount("<p>Alpha beta gamma.</p>");
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    expect(highlightPassage(root, "alpha beta gamma")).toBe(true);
    expect(scroll).toHaveBeenCalled();
    expect(() => clearPassageHighlight()).not.toThrow();
  });

  it("returns false when the passage isn't rendered", () => {
    const root = mount("<p>Something else.</p>");
    expect(highlightPassage(root, "not here at all")).toBe(false);
  });

  it("skips KaTeX's duplicated formula text", () => {
    const registry = new Map<string, unknown>();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      }
    );
    const root = mount(
      '<p>Let <span class="katex"><span class="katex-mathml">a1</span><span class="katex-html">a1</span></span> be given so the function grows quickly here and there.</p>'
    );

    expect(
      highlightPassage(root, "Let $a_1$ be given so the function grows quickly here and there.")
    ).toBe(true);

    const text = (registry.get(PASSAGE_HIGHLIGHT) as { ranges: Range[] }).ranges[0].toString();
    expect(text.startsWith("Let")).toBe(true);
    expect(text.endsWith("there")).toBe(true);
  });
});
