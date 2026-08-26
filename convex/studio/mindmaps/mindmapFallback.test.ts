import { describe, expect, it } from "vitest";
import { conceptsFromSource, createSmartFallback } from "./mindmapFallback";

describe("conceptsFromSource", () => {
  it("splits paragraphs into concepts when key_concepts is empty", () => {
    expect(
      conceptsFromSource("First idea is about retrieval.\n\nSecond idea is about reranking.")
    ).toEqual(["First idea is about retrieval.", "Second idea is about reranking."]);
  });
});

describe("createSmartFallback", () => {
  it("builds an overview branch from the source summary when concepts are missing", () => {
    const mindmap = createSmartFallback([
      {
        main_theme: "Source",
        summary: "Skip-map joined notes about vector search and citation packing.",
        key_concepts: [],
      },
    ]);

    expect(mindmap.nodeData.topic).toBe("Source");
    expect(mindmap.nodeData.children).toEqual([
      {
        topic: "Overview",
        children: [
          {
            topic: "Skip-map joined notes about vector search and citation packing.",
            children: null,
          },
        ],
      },
    ]);
  });

  it("keeps extracted concepts when they exist", () => {
    const mindmap = createSmartFallback([
      {
        main_theme: "Retrieval",
        summary: "unused when concepts exist",
        key_concepts: ["HyDE", "rerank"],
      },
    ]);

    expect(mindmap.nodeData.children).toEqual([
      {
        topic: "Overview",
        children: [
          { topic: "HyDE", children: null },
          { topic: "rerank", children: null },
        ],
      },
    ]);
  });
});
