import { describe, expect, test } from "vitest";
import type { PaperRecord } from "./paperRecord";
import {
  buildPaperMetadataMarkdown,
  deriveFulltextStatus,
  normalizeDoi,
  primaryLinkUrlForPaper,
} from "./paperRecord";

describe("normalizeDoi", () => {
  test("strips https://doi.org/ prefix", () => {
    expect(normalizeDoi("https://doi.org/10.1234/test")).toBe("10.1234/test");
  });

  test("strips http://doi.org/ prefix", () => {
    expect(normalizeDoi("http://doi.org/10.1234/test")).toBe("10.1234/test");
  });

  test("strips http://dx.doi.org/ prefix", () => {
    expect(normalizeDoi("http://dx.doi.org/10.1234/test")).toBe("10.1234/test");
  });

  test("strips https://dx.doi.org/ prefix", () => {
    expect(normalizeDoi("https://dx.doi.org/10.1234/test")).toBe("10.1234/test");
  });

  test("returns undefined for empty string", () => {
    expect(normalizeDoi("")).toBeUndefined();
  });

  test("returns undefined for whitespace-only string", () => {
    expect(normalizeDoi("   ")).toBeUndefined();
  });

  test("returns undefined for undefined input", () => {
    expect(normalizeDoi(undefined)).toBeUndefined();
  });

  test("returns plain DOI unchanged", () => {
    expect(normalizeDoi("10.1234/test")).toBe("10.1234/test");
  });

  test("trims whitespace around DOI", () => {
    expect(normalizeDoi("  10.1234/test  ")).toBe("10.1234/test");
  });
});

describe("deriveFulltextStatus", () => {
  test("returns available when pdfUrl exists", () => {
    expect(deriveFulltextStatus({ pdfUrl: "https://example.com/paper.pdf" })).toBe("available");
  });

  test("returns available when pdfUrl exists even with landing page", () => {
    expect(
      deriveFulltextStatus({
        pdfUrl: "https://example.com/paper.pdf",
        landingPageUrl: "https://example.com",
      })
    ).toBe("available");
  });

  test("returns external_only when only landing page exists", () => {
    expect(deriveFulltextStatus({ landingPageUrl: "https://example.com/paper" })).toBe(
      "external_only"
    );
  });

  test("returns external_only when only DOI exists", () => {
    expect(deriveFulltextStatus({ doi: "10.1234/test" })).toBe("external_only");
  });

  test("returns external_only when landing page and DOI exist", () => {
    expect(
      deriveFulltextStatus({ landingPageUrl: "https://example.com", doi: "10.1234/test" })
    ).toBe("external_only");
  });

  test("returns unavailable when nothing exists", () => {
    expect(deriveFulltextStatus({})).toBe("unavailable");
  });

  test("returns unavailable for empty strings", () => {
    expect(deriveFulltextStatus({ pdfUrl: "", landingPageUrl: "", doi: "" })).toBe("unavailable");
  });

  test("returns unavailable for whitespace-only strings", () => {
    expect(deriveFulltextStatus({ pdfUrl: "   ", landingPageUrl: "   ", doi: "   " })).toBe(
      "unavailable"
    );
  });
});

describe("primaryLinkUrlForPaper", () => {
  const baseRecord: PaperRecord = {
    abstract: "",
    authors: [],
    isOa: false,
  };

  test("prefers landing page URL", () => {
    expect(
      primaryLinkUrlForPaper({
        ...baseRecord,
        landingPageUrl: "https://example.com/paper",
        doi: "10.1234/test",
        pdfUrl: "https://example.com/paper.pdf",
      })
    ).toBe("https://example.com/paper");
  });

  test("falls back to DOI URL when no landing page", () => {
    expect(
      primaryLinkUrlForPaper({
        ...baseRecord,
        doi: "10.1234/test",
        pdfUrl: "https://example.com/paper.pdf",
      })
    ).toBe("https://doi.org/10.1234/test");
  });

  test("falls back to PDF URL when no landing page or DOI", () => {
    expect(
      primaryLinkUrlForPaper({
        ...baseRecord,
        pdfUrl: "https://example.com/paper.pdf",
      })
    ).toBe("https://example.com/paper.pdf");
  });

  test("falls back to OpenAlex ID when no landing page, DOI, or PDF", () => {
    expect(
      primaryLinkUrlForPaper({
        ...baseRecord,
        openAlexId: "https://openalex.org/W123456789",
      })
    ).toBe("https://openalex.org/W123456789");
  });

  test("returns empty string when no links exist", () => {
    expect(primaryLinkUrlForPaper(baseRecord)).toBe("");
  });

  test("handles OpenAlex ID without https prefix", () => {
    expect(
      primaryLinkUrlForPaper({
        ...baseRecord,
        openAlexId: "W123456789",
      })
    ).toBe("https://openalex.org/W123456789");
  });
});

describe("buildPaperMetadataMarkdown", () => {
  const baseRecord: PaperRecord = {
    abstract: "This is the abstract.",
    authors: ["Alice Smith", "Bob Jones"],
    isOa: true,
    publicationYear: 2023,
    venue: "Nature",
    doi: "10.1234/test",
    openAlexId: "https://openalex.org/W123456789",
    license: "CC-BY",
  };

  test("includes all bibliographic fields", () => {
    const md = buildPaperMetadataMarkdown(baseRecord, "Test Paper");
    expect(md).toContain("# Test Paper");
    expect(md).toContain("Alice Smith, Bob Jones");
    expect(md).toContain("2023");
    expect(md).toContain("Nature");
    expect(md).toContain("https://doi.org/10.1234/test");
    expect(md).toContain("https://openalex.org/W123456789");
    expect(md).toContain("CC-BY");
    expect(md).toContain("This is the abstract.");
    expect(md).toContain("Full text was not ingested");
  });

  test("handles missing fields gracefully", () => {
    const md = buildPaperMetadataMarkdown(
      { abstract: "", authors: [], isOa: false },
      "Minimal Paper"
    );
    expect(md).toContain("# Minimal Paper");
    expect(md).not.toContain("**Authors:**");
    expect(md).not.toContain("**Year:**");
    expect(md).not.toContain("**Venue:**");
    expect(md).not.toContain("**DOI:**");
    expect(md).not.toContain("**OpenAlex:**");
    expect(md).not.toContain("**License:**");
    expect(md).not.toContain("## Abstract");
  });

  test("uses fallback title when displayTitle is empty", () => {
    const md = buildPaperMetadataMarkdown(baseRecord, "");
    expect(md).toContain("# Research paper");
  });

  test("does not include abstract section when abstract is empty", () => {
    const md = buildPaperMetadataMarkdown({ ...baseRecord, abstract: "   " }, "No Abstract");
    expect(md).not.toContain("## Abstract");
  });
});
