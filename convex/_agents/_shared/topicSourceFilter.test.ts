import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  documentTopicScores,
  selectTopicDocuments,
  TOPIC_SOURCE_GAP,
} from "./topicSourceFilter";

describe("cosineSimilarity", () => {
  it("is 1 for the same direction and 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 for a zero vector instead of NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("documentTopicScores", () => {
  it("scores each document by the mean of its best-matching chunks", () => {
    const scores = documentTopicScores(
      [
        { documentId: "heart", similarity: 0.6 },
        { documentId: "heart", similarity: 0.5 },
        { documentId: "heart", similarity: 0.4 },
        { documentId: "heart", similarity: 0.1 },
        { documentId: "kidney", similarity: 0.2 },
      ],
      3
    );
    expect(scores.get("heart")).toBeCloseTo(0.5);
    // A document with fewer chunks than topK averages the chunks it has.
    expect(scores.get("kidney")).toBeCloseTo(0.2);
  });
});

describe("selectTopicDocuments", () => {
  it("drops sources that score clearly below the best one", () => {
    const result = selectTopicDocuments(
      new Map([
        ["heart", 0.55],
        ["kidney", 0.3],
        ["nerves", 0.28],
      ])
    );
    expect(result.keep).toEqual(["heart"]);
    expect(result.dropped).toEqual(["kidney", "nerves"]);
  });

  it("keeps every source when none stands out, as for a generic request", () => {
    const result = selectTopicDocuments(
      new Map([
        ["a", 0.42],
        ["b", 0.4],
        ["c", 0.39],
      ])
    );
    expect(result.keep).toEqual(["a", "b", "c"]);
    expect(result.dropped).toEqual([]);
  });

  it("cuts at the largest drop between neighbouring scores, only when it reaches the gap", () => {
    const cut = selectTopicDocuments(
      new Map([
        ["a", 0.6],
        ["b", 0.58],
        ["c", 0.58 - TOPIC_SOURCE_GAP - 0.001],
      ])
    );
    expect(cut.keep).toEqual(["a", "b"]);
    expect(cut.dropped).toEqual(["c"]);

    const noCut = selectTopicDocuments(
      new Map([
        ["a", 0.6],
        ["b", 0.58],
        ["c", 0.58 - TOPIC_SOURCE_GAP + 0.001],
      ])
    );
    expect(noCut.dropped).toEqual([]);
  });

  it("keeps every source when scores are evenly spread with no clear split", () => {
    const result = selectTopicDocuments(
      new Map([
        ["a", 0.6],
        ["b", 0.52],
        ["c", 0.44],
        ["d", 0.36],
      ])
    );
    expect(result.dropped).toEqual([]);
  });

  // Scores logged on dev for the use-case pack requests (2026-10-04).
  it.each([
    ["past participle agreement only", [0.436, 0.332, 0.328, 0.281], 1],
    ["heart chambers, valves and great vessels", [0.572, 0.535, 0.268, 0.254], 2],
    ["articles and possessive determiners", [0.537, 0.358, 0.322, 0.301], 1],
    ["vocabulary from the example dialogues", [0.385, 0.32, 0.307, 0.298], 4],
    ["compare the papers", [0.609, 0.577, 0.567, 0.558], 4],
    ["evidence synthesis across the papers", [0.402, 0.351, 0.334, 0.319], 4],
  ])("keeps the right sources for %s", (_request, scores, kept) => {
    const result = selectTopicDocuments(new Map(scores.map((s, i) => [`doc${i}`, s])));
    expect(result.keep).toHaveLength(kept);
  });

  it("never drops the only source", () => {
    const result = selectTopicDocuments(new Map([["only", 0.05]]));
    expect(result.keep).toEqual(["only"]);
  });
});
