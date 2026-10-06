import { createCitationEngine } from "@convex/_utils/CitationEngine";
import { describe, expect, it } from "vitest";
import type { RankedPaper } from "../types/rankedPaper";
import {
  isPaperInNotebook,
  rankedPaperToBulkUpload,
  rankedPaperToCitation,
} from "./rankedPaperMappers";

const PAPER: RankedPaper = {
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  abstract: "",
  url: "https://arxiv.org/abs/1706.03762",
  source: "arxiv",
  score: 1,
};

const engine = createCitationEngine();

describe("rankedPaperToCitation", () => {
  it("carries the paper's fields over to the citation", () => {
    expect(rankedPaperToCitation({ ...PAPER, doi: "10.1/x" }, "paper_3")).toEqual({
      paperId: "paper_3",
      title: "Attention Is All You Need",
      authors: ["Vaswani, Ashish", "Shazeer, Noam"],
      year: 2017,
      doi: "10.1/x",
      url: "https://arxiv.org/abs/1706.03762",
      sourceApi: "arxiv",
    });
  });

  it.each([
    ["surname first", ["Vaswani, Ashish", "Shazeer, Noam"]],
    ["given name first", ["Ashish Vaswani", "Noam Shazeer"]],
  ])("cites %s authors by surname", (_label, authors) => {
    const citation = rankedPaperToCitation({ ...PAPER, authors }, "paper_0");
    expect(engine.formatInline(citation, "apa7")).toBe("(Vaswani & Shazeer, 2017)");
    expect(engine.formatReference(citation, "apa7")).toBe(
      "Vaswani, A., & Shazeer, N. (2017). Attention Is All You Need. arXiv. https://arxiv.org/abs/1706.03762"
    );
  });

  it("cites a single-word author by that word", () => {
    const citation = rankedPaperToCitation({ ...PAPER, authors: ["OpenAI"], year: 2023 }, "p");
    expect(engine.formatInline(citation, "apa7")).toBe("(OpenAI, 2023)");
  });

  it("cites an organisation author by its whole name", () => {
    const citation = rankedPaperToCitation(
      { ...PAPER, authors: ["World Health Organization"], year: 2020 },
      "p"
    );
    expect(engine.formatInline(citation, "apa7")).toBe("(World Health Organization, 2020)");
    expect(engine.formatReference(citation, "apa7")).toMatch(
      /^World Health Organization\. \(2020\)\./
    );
  });
});

describe("rankedPaperToBulkUpload", () => {
  it("builds a DOI landing page when the paper has no URL", () => {
    const upload = rankedPaperToBulkUpload({
      ...PAPER,
      url: "",
      doi: "https://doi.org/10.1/x",
    });
    expect(upload.landingPageUrl).toBe("https://doi.org/10.1/x");
    expect(upload.isOa).toBe(false);
  });
});

describe("isPaperInNotebook", () => {
  it("matches on DOI case-insensitively", () => {
    expect(
      isPaperInNotebook({ ...PAPER, doi: "10.1/X " }, { dois: ["10.1/x"], titleHashes: [] })
    ).toBe(true);
  });

  it("matches on title and first author's surname", () => {
    expect(
      isPaperInNotebook(PAPER, {
        dois: [],
        titleHashes: ["attention is all you need|vaswani"],
      })
    ).toBe(true);
  });
});
