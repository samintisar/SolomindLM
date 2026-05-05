import { describe, it, expect } from "vitest";
import {
  filterSourcesByQuery,
  syncMentions,
  combineDocumentIds,
  getDocumentIdsFromMentions,
} from "./mentions";
import { Source, MentionedSource } from "@/shared/types/index";

const mockSources: Source[] = [
  { id: "1", title: "PdfViewer.tsx", type: "PDF", date: "2024-01-01", selected: true },
  { id: "2", title: "React Guide", type: "WEB", date: "2024-01-01", selected: false },
  { id: "3", title: "API Docs", type: "MD", date: "2024-01-01", selected: true },
];

describe("filterSourcesByQuery", () => {
  it("returns all sources for empty query", () => {
    expect(filterSourcesByQuery(mockSources, "")).toEqual(mockSources);
  });

  it("filters by case-insensitive substring", () => {
    expect(filterSourcesByQuery(mockSources, "pdf")).toEqual([mockSources[0]]);
    expect(filterSourcesByQuery(mockSources, "REACT")).toEqual([mockSources[1]]);
  });

  it("returns empty array when no match", () => {
    expect(filterSourcesByQuery(mockSources, "xyz")).toEqual([]);
  });
});

describe("syncMentions", () => {
  const mentions: MentionedSource[] = [
    { documentId: "1", title: "PdfViewer.tsx", startIndex: 8, endIndex: 22 },
  ];

  it("keeps valid mentions", () => {
    const text = "Explain @PdfViewer.tsx please";
    expect(syncMentions(text, mentions)).toEqual(mentions);
  });

  it("removes orphaned mentions", () => {
    const text = "Explain please";
    expect(syncMentions(text, mentions)).toEqual([]);
  });

  it("updates indices when text shifts", () => {
    const text = "Hi. Explain @PdfViewer.tsx please";
    expect(syncMentions(text, mentions)).toEqual([
      { documentId: "1", title: "PdfViewer.tsx", startIndex: 12, endIndex: 26 },
    ]);
  });
});

describe("combineDocumentIds", () => {
  it("combines and dedupes IDs", () => {
    expect(combineDocumentIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("handles empty arrays", () => {
    expect(combineDocumentIds([], ["a"])).toEqual(["a"]);
    expect(combineDocumentIds(["a"], [])).toEqual(["a"]);
    expect(combineDocumentIds([], [])).toEqual([]);
  });
});

describe("getDocumentIdsFromMentions", () => {
  it("extracts document IDs", () => {
    const mentions: MentionedSource[] = [
      { documentId: "1", title: "A", startIndex: 0, endIndex: 2 },
      { documentId: "2", title: "B", startIndex: 3, endIndex: 5 },
    ];
    expect(getDocumentIdsFromMentions(mentions)).toEqual(["1", "2"]);
  });
});
