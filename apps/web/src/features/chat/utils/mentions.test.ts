import { describe, expect, it } from "vitest";
import { MentionedSource, Source } from "@/shared/types/index";
import {
  combineDocumentIds,
  filterSourcesByQuery,
  getDocumentIdsFromMentions,
  prependAttachedSourceMentionsToMessage,
} from "./mentions";

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

  it("handles query with only whitespace", () => {
    expect(filterSourcesByQuery(mockSources, "   ")).toEqual(mockSources);
  });

  it("filters special characters in titles", () => {
    const sources: Source[] = [
      { id: "4", title: "file[1].txt", type: "TXT", date: "2024-01-01", selected: false },
    ];
    expect(filterSourcesByQuery(sources, "[1]")).toEqual(sources);
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

  it("preserves order (mentioned first, then selected)", () => {
    expect(combineDocumentIds(["c", "a"], ["b", "a"])).toEqual(["c", "a", "b"]);
  });
});

describe("getDocumentIdsFromMentions", () => {
  it("extracts document IDs", () => {
    const mentions: MentionedSource[] = [
      { documentId: "1", title: "A" },
      { documentId: "2", title: "B" },
    ];
    expect(getDocumentIdsFromMentions(mentions)).toEqual(["1", "2"]);
  });

  it("returns empty array for empty mentions", () => {
    expect(getDocumentIdsFromMentions([])).toEqual([]);
  });
});

describe("prependAttachedSourceMentionsToMessage", () => {
  it("returns body unchanged when there are no mentions", () => {
    expect(prependAttachedSourceMentionsToMessage("Hello", [])).toBe("Hello");
  });

  it("prefixes @titles before the message body", () => {
    expect(
      prependAttachedSourceMentionsToMessage("Why?", [{ documentId: "d1", title: "Guide.pdf" }])
    ).toBe("@Guide.pdf\n\nWhy?");
  });

  it("joins multiple mentions with spaces", () => {
    expect(
      prependAttachedSourceMentionsToMessage("Ok", [
        { documentId: "a", title: "Doc A" },
        { documentId: "b", title: "Doc B" },
      ])
    ).toBe("@Doc A @Doc B\n\nOk");
  });

  it("normalizes whitespace in titles", () => {
    expect(
      prependAttachedSourceMentionsToMessage("x", [
        { documentId: "d", title: "AI\nagent\tpatterns" },
      ])
    ).toBe("@AI agent patterns\n\nx");
  });

  it("returns only prefix when body is empty", () => {
    expect(prependAttachedSourceMentionsToMessage("", [{ documentId: "d", title: "Doc" }])).toBe(
      "@Doc"
    );
  });

  it("returns only prefix when body is whitespace", () => {
    expect(prependAttachedSourceMentionsToMessage("   ", [{ documentId: "d", title: "Doc" }])).toBe(
      "@Doc"
    );
  });

  it("skips mentions with empty titles", () => {
    expect(
      prependAttachedSourceMentionsToMessage("Hello", [
        { documentId: "a", title: "" },
        { documentId: "b", title: "Valid" },
      ])
    ).toBe("@Valid\n\nHello");
  });

  it("skips mentions with whitespace-only titles", () => {
    expect(
      prependAttachedSourceMentionsToMessage("Hello", [
        { documentId: "a", title: "   \n\t  " },
        { documentId: "b", title: "Valid" },
      ])
    ).toBe("@Valid\n\nHello");
  });
});
