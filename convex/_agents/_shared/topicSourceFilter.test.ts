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

  it("keeps every source within the gap of the best one", () => {
    const best = 0.6;
    const result = selectTopicDocuments(
      new Map([
        ["best", best],
        ["close", best - TOPIC_SOURCE_GAP + 0.001],
        ["far", best - TOPIC_SOURCE_GAP - 0.001],
      ])
    );
    expect(result.keep).toEqual(["best", "close"]);
    expect(result.dropped).toEqual(["far"]);
  });

  it("never drops the only source", () => {
    const result = selectTopicDocuments(new Map([["only", 0.05]]));
    expect(result.keep).toEqual(["only"]);
  });
});
