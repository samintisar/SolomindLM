import { describe, expect, it } from "vitest";
import {
  dropSearchCopiesOfNotebookPapers,
  isNotebookPaperDocument,
  NOTEBOOK_PAPER_TEXT_MAX_CHARS,
  notebookPaperFromDocument,
  notebookPaperText,
  resolvePaperScope,
} from "./notebookPapers";

const pdf = {
  _id: "doc_pdf",
  fileName: "cohort-tilda-2023.pdf",
  fileType: "file",
  status: "completed",
  extractedMarkdown:
    "**Page 1**\n\nPhysical Activity Dose and Depression in a Cohort of Older Adults",
};

const record = {
  _id: "doc_rec",
  fileName: "Association Between Physical Activity and Risk of Depression",
  fileType: "paper_record",
  status: "completed",
  paperRecord: {
    abstract: "Fifteen studies comprising 191 130 participants...",
    authors: ["Pearce M", "Garcia L"],
    doi: "10.1001/jamapsychiatry.2022.0609",
    publicationYear: 2022,
    isOa: true,
    landingPageUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9008579/",
  },
};

describe("isNotebookPaperDocument", () => {
  it("accepts saved paper records and finished PDF uploads", () => {
    expect(isNotebookPaperDocument(record)).toBe(true);
    expect(isNotebookPaperDocument(pdf)).toBe(true);
    expect(
      isNotebookPaperDocument({ ...pdf, fileName: "scan", contentType: "application/pdf" })
    ).toBe(true);
  });

  it("rejects other source types, other files and unfinished documents", () => {
    expect(isNotebookPaperDocument({ ...pdf, fileType: "text" })).toBe(false);
    expect(isNotebookPaperDocument({ ...pdf, fileType: "url" })).toBe(false);
    expect(isNotebookPaperDocument({ ...pdf, fileName: "notes.docx" })).toBe(false);
    expect(isNotebookPaperDocument({ ...pdf, status: "processing" })).toBe(false);
  });
});

describe("notebookPaperFromDocument", () => {
  it("uses a saved paper's metadata", () => {
    expect(notebookPaperFromDocument(record)).toMatchObject({
      title: "Association Between Physical Activity and Risk of Depression",
      authors: ["Pearce M", "Garcia L"],
      year: 2022,
      abstract: "Fifteen studies comprising 191 130 participants...",
      doi: "10.1001/jamapsychiatry.2022.0609",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9008579/",
      source: "notebook",
      documentId: "doc_rec",
      isIncluded: true,
      includeReason: "From your notebook",
    });
  });

  it("uses metadata read from an uploaded PDF, and its summary as the abstract", () => {
    const paper = notebookPaperFromDocument(
      { ...pdf, sourceGuide: { summary: "A cohort study of older adults." } },
      { title: "Physical Activity Dose and Depression", authors: ["Laird E"], year: 2023 }
    );
    expect(paper).toMatchObject({
      title: "Physical Activity Dose and Depression",
      authors: ["Laird E"],
      year: 2023,
      abstract: "A cohort study of older adults.",
      source: "notebook",
      documentId: "doc_pdf",
    });
  });

  it("falls back to the file name and the start of the text", () => {
    const paper = notebookPaperFromDocument(pdf);
    expect(paper.title).toBe("cohort-tilda-2023.pdf");
    expect(paper.authors).toEqual([]);
    expect(paper.abstract).toContain("Physical Activity Dose");
  });
});

describe("notebookPaperText", () => {
  it("uses the document's full text up to the budget", () => {
    expect(notebookPaperText({ extractedMarkdown: "x".repeat(50_000) })).toHaveLength(
      NOTEBOOK_PAPER_TEXT_MAX_CHARS
    );
  });

  it("falls back to the abstract when there is no extracted text", () => {
    expect(notebookPaperText({ paperRecord: { abstract: "An abstract." } })).toBe("An abstract.");
  });
});

describe("dropSearchCopiesOfNotebookPapers", () => {
  const notebook = [
    { title: "Paper A", authors: ["Smith J"], doi: "10.1/A" },
    { title: "Paper B", authors: ["Jones K"] },
  ];

  it("drops search results with the same DOI or the same title and first author", () => {
    const kept = dropSearchCopiesOfNotebookPapers(notebook, [
      { title: "Something else", authors: ["X"], doi: "10.1/a" },
      { title: "paper b ", authors: ["Jones, K."] },
      { title: "Paper C", authors: ["Lee M"] },
    ]);
    expect(kept.map((p) => p.title)).toEqual(["Paper C"]);
  });

  it("keeps everything when there are no notebook papers", () => {
    const search = [{ title: "Paper C", authors: ["Lee M"] }];
    expect(dropSearchCopiesOfNotebookPapers([], search)).toEqual(search);
  });
});

describe("resolvePaperScope", () => {
  it("searches as well by default when papers are selected", () => {
    expect(resolvePaperScope(2, undefined)).toBe("papers_and_search");
    expect(resolvePaperScope(2, "papers_only")).toBe("papers_only");
  });

  it("falls back to search only when no selected source is a paper", () => {
    expect(resolvePaperScope(0, undefined)).toBeUndefined();
    expect(resolvePaperScope(0, "papers_and_search")).toBeUndefined();
  });

  it("rejects papers-only with no papers", () => {
    expect(() => resolvePaperScope(0, "papers_only")).toThrow(
      "Select at least one PDF or saved paper to review only your papers."
    );
  });
});
