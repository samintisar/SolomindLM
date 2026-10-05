import { describe, expect, it } from "vitest";
import type { Source } from "@/shared/types";
import {
  countNotebookAndSearchPapers,
  paperScopeLabel,
  selectedNotebookPaperIds,
} from "./literatureReviewPapers";

function source(overrides: Partial<Source>): Source {
  return {
    id: "doc",
    title: "Source",
    type: "PDF",
    date: "Oct 5",
    selected: true,
    status: "completed",
    ...overrides,
  };
}

describe("selectedNotebookPaperIds", () => {
  it("keeps selected, finished PDFs and saved papers", () => {
    const ids = selectedNotebookPaperIds([
      source({ id: "pdf" }),
      source({ id: "paper", type: "PAPER" }),
      source({ id: "web", type: "WEB" }),
      source({ id: "docx", type: "DOCX" }),
      source({ id: "unselected", selected: false }),
      source({ id: "processing", status: "processing" }),
    ]);

    expect(ids).toEqual(["pdf", "paper"]);
  });
});

describe("paperScopeLabel", () => {
  it("names how many papers each scope uses", () => {
    expect(paperScopeLabel("papers_and_search", 4)).toBe("Your 4 papers + search");
    expect(paperScopeLabel("papers_only", 4)).toBe("Only your 4 papers");
  });

  it("uses the singular for one paper", () => {
    expect(paperScopeLabel("papers_and_search", 1)).toBe("Your paper + search");
    expect(paperScopeLabel("papers_only", 1)).toBe("Only your paper");
  });
});

describe("countNotebookAndSearchPapers", () => {
  it("counts included rows by where the paper came from", () => {
    const counts = countNotebookAndSearchPapers([
      { isIncluded: true, citation: { sourceApi: "notebook" } },
      { isIncluded: true, citation: { sourceApi: "pubmed" } },
      { isIncluded: true, citation: { sourceApi: "arxiv" } },
      { isIncluded: false, citation: { sourceApi: "notebook" } },
      { isIncluded: true, citation: null },
    ]);

    expect(counts).toEqual({ notebook: 1, search: 3 });
  });
});
