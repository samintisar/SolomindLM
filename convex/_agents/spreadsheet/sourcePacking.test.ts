import { describe, expect, it } from "vitest";
import { labelWithSource, packChunksBySource } from "./sourcePacking";

// Joins everything a pack call receives, so a task's text shows which chunks were packed together.
const packAll = (chunks: string[]) => [chunks.join(" + ")];

describe("packChunksBySource", () => {
  it("never packs chunks from two sources into one task", () => {
    const tasks = packChunksBySource(
      [
        { documentId: "a", content: "a1" },
        { documentId: "a", content: "a2" },
        { documentId: "b", content: "b1" },
      ],
      new Map([
        ["a", "paper-a.pdf"],
        ["b", "paper-b.pdf"],
      ]),
      packAll
    );
    expect(tasks).toEqual([
      { source: "paper-a.pdf", text: "a1 + a2" },
      { source: "paper-b.pdf", text: "b1" },
    ]);
  });

  it("keeps the sources in the order they first appear", () => {
    const tasks = packChunksBySource(
      [
        { documentId: "b", content: "b1" },
        { documentId: "a", content: "a1" },
      ],
      new Map(),
      packAll
    );
    expect(tasks.map((t) => t.text)).toEqual(["b1", "a1"]);
  });

  it("numbers sources that share a title so their labels stay distinct", () => {
    const tasks = packChunksBySource(
      [
        { documentId: "a", content: "a1" },
        { documentId: "u", content: "u1" },
        { documentId: "b", content: "b1" },
      ],
      new Map([
        ["a", "notes.pdf"],
        ["u", "unique.pdf"],
        ["b", " notes.pdf "],
      ]),
      packAll
    );
    expect(tasks.map((t) => t.source)).toEqual(["notes.pdf (1)", "unique.pdf", "notes.pdf (2)"]);
  });

  it("skips numbers that would clash with another source's title", () => {
    const tasks = packChunksBySource(
      [
        { documentId: "a", content: "a1" },
        { documentId: "c", content: "c1" },
        { documentId: "b", content: "b1" },
      ],
      new Map([
        ["a", "notes.pdf"],
        ["c", "notes.pdf (1)"],
        ["b", "notes.pdf"],
      ]),
      packAll
    );
    const labels = tasks.map((t) => t.source);
    expect(new Set(labels).size).toBe(3);
    expect(labels).toEqual(["notes.pdf (2)", "notes.pdf (1)", "notes.pdf (3)"]);
  });

  it("names a source without a title by its position", () => {
    const tasks = packChunksBySource([{ documentId: "x", content: "x1" }], new Map(), packAll);
    expect(tasks[0].source).toBe("Source 1");
  });

  it("keeps every task the pack function returns for a source", () => {
    const tasks = packChunksBySource(
      [{ documentId: "a", content: "a1" }],
      new Map([["a", "big.pdf"]]),
      () => ["part 1", "part 2"]
    );
    expect(tasks).toEqual([
      { source: "big.pdf", text: "part 1" },
      { source: "big.pdf", text: "part 2" },
    ]);
  });
});

describe("labelWithSource", () => {
  it("puts the source name in front of the text", () => {
    expect(labelWithSource("paper-a.pdf", "notes")).toBe("SOURCE: paper-a.pdf\n\nnotes");
  });
});
