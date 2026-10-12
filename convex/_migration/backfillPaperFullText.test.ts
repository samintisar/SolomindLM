import { describe, expect, it } from "vitest";
import {
  hasNewCandidate,
  hasResolvableId,
  needsAbstractOnlyRelabel,
} from "./backfillPaperFullText";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("needsAbstractOnlyRelabel", () => {
  const paper = {
    fileType: "paper_record",
    ingestionStatus: "ingested" as const,
    paperRecord: { abstract: "An abstract.", authors: [], isOa: false },
  };

  it("relabels an 'ingested' paper whose stored text is abstract-sized", () => {
    expect(
      needsAbstractOnlyRelabel({ ...paper, extractedMarkdown: "# T\n\n## Abstract\nAn abstract." })
    ).toBe(true);
  });

  it("keeps a paper whose stored text is full-text length", () => {
    expect(needsAbstractOnlyRelabel({ ...paper, extractedMarkdown: words(2_000) })).toBe(false);
  });

  it("keeps papers ingested by the new pipeline, other statuses, and other source types", () => {
    expect(
      needsAbstractOnlyRelabel({
        ...paper,
        extractedMarkdown: "short",
        fullTextSource: { method: "oa_pdf" },
      })
    ).toBe(false);
    expect(
      needsAbstractOnlyRelabel({
        ...paper,
        ingestionStatus: "metadata_only",
        extractedMarkdown: "short",
      })
    ).toBe(false);
    expect(
      needsAbstractOnlyRelabel({ ...paper, fileType: "url", extractedMarkdown: "short" })
    ).toBe(false);
  });
});

describe("hasResolvableId", () => {
  it("needs a DOI or an OpenAlex id", () => {
    expect(hasResolvableId({ doi: "10.1/x" })).toBe(true);
    expect(hasResolvableId({ openAlexId: "W1" })).toBe(true);
    expect(hasResolvableId({ doi: " " })).toBe(false);
    expect(hasResolvableId(undefined)).toBe(false);
  });
});

describe("hasNewCandidate", () => {
  it("ignores the PDF link the first import already tried", () => {
    const tried = "https://journal.example/a.pdf";
    expect(hasNewCandidate([{ url: "http://journal.example/a.pdf/" }], tried)).toBe(false);
    expect(hasNewCandidate([{ url: tried }, { url: "https://arxiv.org/pdf/1" }], tried)).toBe(true);
    expect(hasNewCandidate([], undefined)).toBe(false);
  });
});
