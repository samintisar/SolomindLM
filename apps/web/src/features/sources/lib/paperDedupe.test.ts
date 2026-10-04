import { describe, expect, it } from "vitest";
import { paperKeys, splitNewPapers } from "./paperDedupe";

const existing = { dois: ["10.1/abc"], titleHashes: ["paper one|smith"] };

describe("paperKeys", () => {
  it("normalises the DOI and the title|first-author-surname hash", () => {
    expect(
      paperKeys({ title: " Paper One ", authors: ["Smith, Jane"], doi: " 10.1/ABC " })
    ).toEqual({
      doi: "10.1/abc",
      titleHash: "paper one|smith",
    });
  });
  it("omits keys it cannot build", () => {
    expect(paperKeys({ title: "T", authors: [] })).toEqual({
      doi: undefined,
      titleHash: undefined,
    });
  });
});

describe("splitNewPapers", () => {
  it("treats a DOI match (any case) as a duplicate", () => {
    const r = splitNewPapers([{ title: "X", authors: [], doi: "10.1/ABC" }], existing);
    expect(r.fresh).toHaveLength(0);
    expect(r.duplicates).toHaveLength(1);
  });
  it("falls back to the title and first author surname", () => {
    const r = splitNewPapers([{ title: "Paper One", authors: ["Smith, J."] }], existing);
    expect(r.duplicates).toHaveLength(1);
  });
  it("keeps papers that match nothing", () => {
    const paper = { title: "New", authors: ["Doe, A."], doi: "10.9/zzz" };
    expect(splitNewPapers([paper], existing)).toEqual({ fresh: [paper], duplicates: [] });
  });
  it("keeps everything while the existing set is still loading", () => {
    const paper = { title: "Paper One", authors: ["Smith, J."] };
    expect(splitNewPapers([paper], undefined)).toEqual({ fresh: [paper], duplicates: [] });
  });
});
