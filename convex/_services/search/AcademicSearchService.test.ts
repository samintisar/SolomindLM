import { describe, it, expect, vi } from "vitest";
import {
  extractTag,
  extractAllTags,
  stripXmlTags,
  extractAttribute,
  extractXmlBlocks,
  normalizeTitle,
  calculateScore,
  extractDomain,
  yearToDateString,
  toDiscoveredSource,
  deduplicatePapers,
  filterPapers,
  sortPapers,
} from "./AcademicSearchService";
import type { AcademicPaper } from "./AcademicSearchService";

// Mock Date for consistent score calculation
vi.useFakeTimers();
vi.setSystemTime(new Date("2024-01-15"));

describe("AcademicSearchService - XML Parsing Helpers", () => {
  describe("extractTag", () => {
    it("extracts text from simple XML tag", () => {
      const xml = "<title>Test Title</title>";
      expect(extractTag(xml, "title")).toBe("Test Title");
    });

    it("handles tags with attributes", () => {
      const xml = '<article-id pub-id-type="doi">10.1234/test</article-id>';
      expect(extractTag(xml, "article-id")).toBe("10.1234/test");
    });

    it("returns undefined for missing tag", () => {
      expect(extractTag("<root></root>", "missing")).toBeUndefined();
    });

    it("trims whitespace", () => {
      expect(extractTag("  <title>  spaced  </title>  ", "title")).toBe("spaced");
    });

    it("is case-insensitive", () => {
      expect(extractTag("<TITLE>Upper</TITLE>", "title")).toBe("Upper");
    });
  });

  describe("extractAllTags", () => {
    it("extracts all matching tags", () => {
      const xml = "<name>Alice</name><name>Bob</name><name>Charlie</name>";
      expect(extractAllTags(xml, "name")).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("returns empty array for no matches", () => {
      expect(extractAllTags("<root></root>", "missing")).toEqual([]);
    });
  });

  describe("stripXmlTags", () => {
    it("removes all XML tags", () => {
      expect(stripXmlTags("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });

    it("handles nested tags", () => {
      expect(stripXmlTags("<outer><inner>Text</inner></outer>")).toBe("Text");
    });

    it("normalizes whitespace", () => {
      expect(stripXmlTags("  <p>  lots   of   space  </p>  ")).toBe("lots of space");
    });
  });

  describe("extractAttribute", () => {
    it("extracts attribute with double quotes", () => {
      expect(extractAttribute('href="https://example.com"', "href")).toBe("https://example.com");
    });

    it("extracts attribute with single quotes", () => {
      expect(extractAttribute("href='https://example.com'", "href")).toBe("https://example.com");
    });

    it("returns undefined for missing attribute", () => {
      expect(extractAttribute('other="value"', "href")).toBeUndefined();
    });
  });

  describe("extractXmlBlocks", () => {
    it("extracts multiple blocks", () => {
      const xml = "<item>A</item><item>B</item>";
      expect(extractXmlBlocks(xml, "item")).toEqual(["A", "B"]);
    });

    it("handles multi-line content", () => {
      const xml = "<entry>\n  Line 1\n  Line 2\n</entry>";
      expect(extractXmlBlocks(xml, "entry")).toEqual(["\n  Line 1\n  Line 2\n"]);
    });
  });
});

describe("AcademicSearchService - Utility Helpers", () => {
  describe("normalizeTitle", () => {
    it("lowercases and removes punctuation", () => {
      expect(normalizeTitle("Hello, World! (2023)")).toBe("hello world 2023");
    });

    it("collapses multiple spaces", () => {
      expect(normalizeTitle("  lots    of   space  ")).toBe("lots of space");
    });
  });

  describe("calculateScore", () => {
    it("calculates score from citations and recency", () => {
      const paper = { citationCount: 500, year: 2023 };
      const score = calculateScore(paper as any);
      const expectedCitationScore = 500 / 1000;
      const expectedRecencyScore = 2023 / 2024;
      expect(score).toBeCloseTo(expectedCitationScore * 0.7 + expectedRecencyScore * 0.3);
    });

    it("caps citation score at 1000", () => {
      const paper = { citationCount: 5000, year: 2023 };
      const score = calculateScore(paper as any);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("uses default recency score when year is missing", () => {
      const paper = { citationCount: 0 };
      const score = calculateScore(paper as any);
      expect(score).toBe(0.15); // 0 * 0.7 + 0.5 * 0.3
    });

    it("returns max score for highly cited recent paper", () => {
      const paper = { citationCount: 1000, year: 2024 };
      const score = calculateScore(paper as any);
      expect(score).toBeCloseTo(1.0);
    });
  });

  describe("extractDomain", () => {
    it("extracts hostname from URL", () => {
      expect(extractDomain("https://example.com/path")).toBe("example.com");
    });

    it("handles subdomains", () => {
      expect(extractDomain("https://sub.domain.example.com")).toBe("sub.domain.example.com");
    });

    it("returns undefined for invalid URL", () => {
      expect(extractDomain("not-a-url")).toBeUndefined();
    });
  });

  describe("yearToDateString", () => {
    it("converts year to date string", () => {
      expect(yearToDateString(2023)).toBe("2023-01-01");
    });

    it("returns undefined for undefined year", () => {
      expect(yearToDateString(undefined)).toBeUndefined();
    });
  });

  describe("toDiscoveredSource", () => {
    it("transforms AcademicPaper to DiscoveredSource", () => {
      const paper: AcademicPaper = {
        title: "Test Paper",
        authors: ["Author One", "Author Two"],
        year: 2023,
        abstract: "This is the abstract.",
        url: "https://arxiv.org/abs/1234",
        pdfUrl: "https://arxiv.org/pdf/1234.pdf",
        source: "arxiv",
        citationCount: 42,
        doi: "10.1234/test",
        score: 0.85,
      };

      const source = toDiscoveredSource(paper);

      expect(source.title).toBe("Test Paper");
      expect(source.url).toBe("https://arxiv.org/abs/1234");
      expect(source.snippet).toBe("This is the abstract.");
      expect(source.score).toBe(0.85);
      expect(source.publishedDate).toBe("2023-01-01");
      expect(source.domain).toBe("arxiv.org");
      expect(source.rawContent).toBe("This is the abstract.");
      expect(source.metadata).toEqual({
        pdfUrl: "https://arxiv.org/pdf/1234.pdf",
        doi: "10.1234/test",
        citationCount: 42,
        sourceApi: "arxiv",
      });
    });

    it("truncates long abstracts in snippet", () => {
      const longAbstract = "a".repeat(600);
      const paper: AcademicPaper = {
        title: "Test",
        authors: ["Author"],
        abstract: longAbstract,
        url: "https://example.com",
        source: "semantic_scholar",
        score: 0.5,
      };

      const source = toDiscoveredSource(paper);
      expect(source.snippet).toHaveLength(500);
      expect(source.rawContent).toHaveLength(600);
    });
  });
});

describe("AcademicSearchService - Result Processing", () => {
  describe("deduplicatePapers", () => {
    it("removes duplicates by DOI", () => {
      const papers: AcademicPaper[] = [
        { title: "Paper A", authors: ["A"], abstract: "A", url: "http://a", source: "arxiv", doi: "10.1234/a", score: 0.8 },
        { title: "Paper B", authors: ["B"], abstract: "B", url: "http://b", source: "arxiv", doi: "10.1234/a", score: 0.9 },
      ];

      const result = deduplicatePapers(papers);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Paper A");
    });

    it("removes duplicates by normalized title when no DOI", () => {
      const papers: AcademicPaper[] = [
        { title: "Same Title", authors: ["A"], abstract: "A", url: "http://a", source: "arxiv", score: 0.8 },
        { title: "Same Title!", authors: ["B"], abstract: "B", url: "http://b", source: "arxiv", score: 0.9 },
      ];

      const result = deduplicatePapers(papers);
      expect(result).toHaveLength(1);
    });

    it("keeps unique papers", () => {
      const papers: AcademicPaper[] = [
        { title: "Paper A", authors: ["A"], abstract: "A", url: "http://a", source: "arxiv", score: 0.8 },
        { title: "Paper B", authors: ["B"], abstract: "B", url: "http://b", source: "arxiv", score: 0.9 },
      ];

      const result = deduplicatePapers(papers);
      expect(result).toHaveLength(2);
    });
  });

  describe("filterPapers", () => {
    const papers: AcademicPaper[] = [
      { title: "Old", authors: ["A"], year: 2010, abstract: "A", url: "http://a", source: "arxiv", citationCount: 100, score: 0.8 },
      { title: "New", authors: ["B"], year: 2023, abstract: "B", url: "http://b", source: "arxiv", citationCount: 50, score: 0.9 },
      { title: "Cited", authors: ["C"], year: 2023, abstract: "C", url: "http://c", source: "arxiv", citationCount: 200, score: 0.95 },
      { title: "Open", authors: ["D"], year: 2023, abstract: "D", url: "http://d", source: "arxiv", citationCount: 10, pdfUrl: "http://d.pdf", score: 0.7 },
      { title: "Closed", authors: ["E"], year: 2023, abstract: "E", url: "http://e", source: "arxiv", citationCount: 10, score: 0.6 },
    ];

    it("filters by publication year from", () => {
      const result = filterPapers(papers, { publicationYearFrom: 2020 });
      expect(result.map((p) => p.title)).toEqual(["New", "Cited", "Open", "Closed"]);
    });

    it("filters by publication year to", () => {
      const result = filterPapers(papers, { publicationYearTo: 2015 });
      expect(result.map((p) => p.title)).toEqual(["Old"]);
    });

    it("filters by year range", () => {
      const result = filterPapers(papers, { publicationYearFrom: 2015, publicationYearTo: 2022 });
      expect(result).toHaveLength(0);
    });

    it("filters by minimum citations", () => {
      const result = filterPapers(papers, { minCitations: 75 });
      expect(result.map((p) => p.title)).toEqual(["Old", "Cited"]);
    });

    it("filters by open access only", () => {
      const result = filterPapers(papers, { openAccessOnly: true });
      expect(result.map((p) => p.title)).toEqual(["Open"]);
    });

    it("applies multiple filters", () => {
      const result = filterPapers(papers, { publicationYearFrom: 2020, minCitations: 75 });
      expect(result.map((p) => p.title)).toEqual(["Cited"]);
    });

    it("returns all papers when no filters", () => {
      const result = filterPapers(papers, {});
      expect(result).toHaveLength(5);
    });
  });

  describe("sortPapers", () => {
    const papers: AcademicPaper[] = [
      { title: "Medium", authors: ["A"], abstract: "A", url: "http://a", source: "arxiv", citationCount: 50, score: 0.7 },
      { title: "High", authors: ["B"], abstract: "B", url: "http://b", source: "arxiv", citationCount: 200, score: 0.9 },
      { title: "Low", authors: ["C"], abstract: "C", url: "http://c", source: "arxiv", citationCount: 10, score: 0.5 },
    ];

    it("sorts by relevance (score) descending", () => {
      const result = sortPapers(papers, "relevance");
      expect(result.map((p) => p.title)).toEqual(["High", "Medium", "Low"]);
    });

    it("sorts by citations descending", () => {
      const result = sortPapers(papers, "citations");
      expect(result.map((p) => p.title)).toEqual(["High", "Medium", "Low"]);
    });

    it("does not mutate original array", () => {
      const original = [...papers];
      sortPapers(papers, "relevance");
      expect(papers).toEqual(original);
    });
  });
});
