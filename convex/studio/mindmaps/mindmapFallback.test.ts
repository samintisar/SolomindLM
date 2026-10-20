import { describe, expect, it } from "vitest";
import {
  compactReduceInput,
  conceptsFromSource,
  createSmartFallback,
  MAX_FALLBACK_BRANCHES,
  MAX_FALLBACK_LEAVES,
} from "./mindmapFallback";

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

  it("caps branches and leaves, keeping the themes most chunks share", () => {
    const extractions = [
      ...Array.from({ length: 3 }, (_, i) => ({
        main_theme: "Retrieval",
        summary: "",
        key_concepts: [`r${i}a`, `r${i}b`, `r${i}c`, "shared"],
      })),
      { main_theme: "retrieval ", summary: "", key_concepts: ["Shared", "late"] },
      { main_theme: "Ranking", summary: "", key_concepts: ["bm25"] },
      { main_theme: "Ranking", summary: "", key_concepts: ["cross-encoder"] },
      ...Array.from({ length: 95 }, (_, i) => ({
        main_theme: `One-off theme ${i}`,
        summary: "",
        key_concepts: [`leaf ${i}`],
      })),
    ];

    const mindmap = createSmartFallback(extractions);
    const branches = mindmap.nodeData.children ?? [];

    expect(mindmap.nodeData.topic).toBe("Retrieval");
    expect(branches).toHaveLength(MAX_FALLBACK_BRANCHES);
    expect(branches[0].topic).toBe("Overview");
    expect(branches[0].children?.map((c) => c.topic)).toEqual([
      "r0a",
      "r0b",
      "r0c",
      "shared",
      "r1a",
      "r1b",
      "r1c",
      "r2a",
    ]);
    expect(branches[0].children).toHaveLength(MAX_FALLBACK_LEAVES);
    expect(branches[1]).toEqual({
      topic: "Ranking",
      children: [
        { topic: "bm25", children: null },
        { topic: "cross-encoder", children: null },
      ],
    });
  });
});

describe("compactReduceInput", () => {
  it("keeps themes and concepts, drops summaries, and caps the length", () => {
    const input = compactReduceInput(
      [
        { main_theme: "A", summary: "long summary", key_concepts: ["x", "y"] },
        { main_theme: "B", summary: "another", key_concepts: ["z"] },
      ],
      1000
    );
    expect(input).toBe("THEME: A\nCONCEPTS: x, y\n\n---\n\nTHEME: B\nCONCEPTS: z");
    expect(compactReduceInput([{ main_theme: "A", summary: "", key_concepts: [] }], 5)).toBe(
      "THEME"
    );
  });
});
