import { describe, expect, it } from "vitest";
import type { Source, UnifiedDiscoveryResult } from "@/shared/types/index";
import {
  accessInfo,
  formatAcademicByline,
  getHostname,
  isInNotebook,
  isSnippetMeaningful,
  notebookDiscoveryKeys,
  relevanceLevel,
} from "./discoveryFormat";

function result(
  over: Partial<Omit<UnifiedDiscoveryResult, "metadata">> & {
    metadata?: Partial<UnifiedDiscoveryResult["metadata"]>;
  } = {}
): UnifiedDiscoveryResult {
  return {
    id: "r1",
    title: "Title",
    url: "https://example.com/a",
    snippet: "",
    score: 0.5,
    sourceType: "web",
    ...over,
    metadata: { ...(over.metadata ?? {}) },
  } as UnifiedDiscoveryResult;
}

describe("getHostname", () => {
  it("returns the host, or the input when it is not a URL", () => {
    expect(getHostname("https://www.nature.com/x")).toBe("www.nature.com");
    expect(getHostname("not a url")).toBe("not a url");
  });
});

describe("isSnippetMeaningful", () => {
  it("hides empty, identical and title-prefix snippets", () => {
    expect(isSnippetMeaningful("Deep Learning", "")).toBe(false);
    expect(isSnippetMeaningful("Deep Learning", "  deep   learning ")).toBe(false);
    expect(isSnippetMeaningful("Deep Learning Review", "Deep Learning")).toBe(false);
    expect(isSnippetMeaningful("Deep Learning", "A survey of methods")).toBe(true);
  });
});

describe("formatAcademicByline", () => {
  it("joins year, venue and first author with et al.", () => {
    const r = result({
      sourceType: "academic",
      metadata: { publicationYear: 2017, venue: "NeurIPS", authors: ["Vaswani", "Shazeer"] },
    });
    expect(formatAcademicByline(r)).toBe("2017 · NeurIPS · Vaswani et al.");
  });
  it("omits et al. for a single author", () => {
    const r = result({ sourceType: "academic", metadata: { authors: ["Hinton"] } });
    expect(formatAcademicByline(r)).toBe("Hinton");
  });
  it("falls back to publishedDate's year and is null for non-academic", () => {
    expect(
      formatAcademicByline(result({ sourceType: "academic", publishedDate: "2020-05-01" }))
    ).toBe("2020");
    expect(formatAcademicByline(result())).toBeNull();
  });
});

describe("relevanceLevel", () => {
  it("uses the 0.8 / 0.6 thresholds", () => {
    expect(relevanceLevel(0.8)).toBe("high");
    expect(relevanceLevel(0.6)).toBe("medium");
    expect(relevanceLevel(0.59)).toBe("low");
  });
});

describe("accessInfo", () => {
  it("ranks PDF, open access, external, metadata only; null for web", () => {
    expect(
      accessInfo(result({ sourceType: "academic", metadata: { pdfUrl: "https://x/p.pdf" } }))?.label
    ).toBe("OA PDF");
    expect(
      accessInfo(result({ sourceType: "academic", metadata: { openAccess: true } }))?.label
    ).toBe("Open access");
    expect(accessInfo(result({ sourceType: "academic", metadata: { doi: "10.1/x" } }))?.label).toBe(
      "External access"
    );
    expect(accessInfo(result({ sourceType: "academic" }))?.label).toBe("Metadata only");
    expect(accessInfo(result())).toBeNull();
  });
});

describe("notebook matching", () => {
  const sources = [
    { id: "s1", url: "https://example.com/a", paper: undefined },
    { id: "s2", paper: { doi: "https://doi.org/10.1/ABC" } },
    { id: "s3", paper: { openAlexId: "https://openalex.org/W123" } },
  ] as unknown as Source[];
  const keys = notebookDiscoveryKeys(sources);

  it("matches by normalized URL", () => {
    expect(isInNotebook(result({ url: "https://example.com/a" }), keys)).toBe(true);
  });
  it("matches academic results by DOI or OpenAlex id, case-insensitively", () => {
    expect(
      isInNotebook(
        result({ sourceType: "academic", url: "https://z", metadata: { doi: "10.1/abc" } }),
        keys
      )
    ).toBe(true);
    expect(
      isInNotebook(
        result({ sourceType: "academic", url: "https://z", metadata: { openAlexId: "w123" } }),
        keys
      )
    ).toBe(true);
  });
  it("matches a DOI saved with the dx.doi.org prefix", () => {
    const dxKeys = notebookDiscoveryKeys([
      { id: "s4", paper: { doi: "https://dx.doi.org/10.2/XYZ" } },
    ] as unknown as Source[]);
    expect(
      isInNotebook(
        result({ sourceType: "academic", url: "https://z", metadata: { doi: "10.2/xyz" } }),
        dxKeys
      )
    ).toBe(true);
  });
  it("ignores a whitespace-only DOI", () => {
    const blankKeys = notebookDiscoveryKeys([
      { id: "s5", paper: { doi: "   " } },
    ] as unknown as Source[]);
    expect(
      isInNotebook(
        result({ sourceType: "academic", url: "https://z", metadata: { doi: "  " } }),
        blankKeys
      )
    ).toBe(false);
  });
  it("matches an openalex.org-prefixed id on the result side", () => {
    expect(
      isInNotebook(
        result({
          sourceType: "academic",
          url: "https://z",
          metadata: { openAlexId: "https://openalex.org/W123" },
        }),
        keys
      )
    ).toBe(true);
  });
  it("does not match web results by DOI", () => {
    expect(isInNotebook(result({ url: "https://z", metadata: { doi: "10.1/abc" } }), keys)).toBe(
      false
    );
  });
});
