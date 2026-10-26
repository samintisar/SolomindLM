import { describe, expect, it } from "vitest";
import { markdownTitleItems, titleSourceFromItems } from "./titleSource";

describe("titleSourceFromItems", () => {
  it("samples evenly across the whole item, not just the start", () => {
    const items = Array.from({ length: 100 }, (_, i) => `Question about topic ${i} in detail`);
    const source = titleSourceFromItems(items, { maxChars: 400 });
    expect(source.length).toBeLessThanOrEqual(400);
    expect(source).toContain("topic 0 ");
    const last = Math.max(...[...source.matchAll(/topic (\d+)/g)].map((m) => Number(m[1])));
    expect(last).toBeGreaterThan(80);
  });

  it("puts the request first and keeps every item when they fit", () => {
    expect(titleSourceFromItems(["What is GDP?", "Define inflation."], { request: "macro" })).toBe(
      "Request: macro\n- What is GDP?\n- Define inflation."
    );
  });

  it("uses each item's first line, without list or heading markers", () => {
    expect(titleSourceFromItems(["## Market size\nDetails follow.", "1. Second point"])).toBe(
      "- Market size\n- Second point"
    );
  });
});

describe("markdownTitleItems", () => {
  it("returns headings when there are several", () => {
    expect(markdownTitleItems("# A\ntext\n## B\nmore\n### C")).toEqual(["A", "B", "C"]);
  });

  it("falls back to paragraphs", () => {
    expect(markdownTitleItems("First para.\n\nSecond para.")).toEqual([
      "First para.",
      "Second para.",
    ]);
  });
});
