import { describe, it, expect } from "vitest";
import { createCitationEngine, generateCitationKey } from "./CitationEngine";

describe("CitationEngine", () => {
  const engine = createCitationEngine();

  const mockCitation = {
    paperId: "arxiv.2401.12345",
    title: "Test Paper Title",
    authors: ["John Smith", "Alice Jones"],
    year: 2024,
    doi: "10.1234/test",
    url: "https://arxiv.org/abs/2401.12345",
    sourceApi: "arxiv" as const,
  };

  const singleAuthorCitation = {
    paperId: "arxiv.2401.12346",
    title: "Single Author Paper",
    authors: ["Bob Wilson"],
    year: 2023,
    doi: "10.1234/single",
    url: "https://arxiv.org/abs/2401.12346",
    sourceApi: "arxiv" as const,
  };

  const threeAuthorCitation = {
    paperId: "arxiv.2401.12347",
    title: "Three Author Paper",
    authors: ["Carol Brown", "David Lee", "Eve Taylor"],
    year: 2022,
    doi: "10.1234/multi",
    url: "https://arxiv.org/abs/2401.12347",
    sourceApi: "semantic_scholar" as const,
  };

  const noYearCitation = {
    paperId: "arxiv.2401.12348",
    title: "No Year Paper",
    authors: ["Frank Miller"],
    url: "https://arxiv.org/abs/2401.12348",
    sourceApi: "pubmed" as const,
  };

  const noAuthorsCitation = {
    paperId: "arxiv.2401.12349",
    title: "No Authors Paper",
    year: 2021,
    url: "https://arxiv.org/abs/2401.12349",
    sourceApi: "arxiv" as const,
  };

  describe("formatInline", () => {
    it("formats APA 7 inline citation for two authors", () => {
      const result = engine.formatInline(mockCitation, "apa7");
      expect(result).toBe("(Smith & Jones, 2024)");
    });

    it("formats APA 7 inline citation for single author", () => {
      const result = engine.formatInline(singleAuthorCitation, "apa7");
      expect(result).toBe("(Wilson, 2023)");
    });

    it("formats APA 7 inline citation for three or more authors", () => {
      const result = engine.formatInline(threeAuthorCitation, "apa7");
      expect(result).toBe("(Brown et al., 2022)");
    });

    it("formats APA 7 inline citation with no year", () => {
      const result = engine.formatInline(noYearCitation, "apa7");
      expect(result).toBe("(Miller, n.d.)");
    });

    it("formats APA 7 inline citation with no authors", () => {
      const result = engine.formatInline(noAuthorsCitation, "apa7");
      expect(result).toBe("(Unknown, 2021)");
    });

    it("throws for unsupported style", () => {
      expect(() => engine.formatInline(mockCitation, "mla9")).toThrow("Unsupported citation style");
    });
  });

  describe("formatReference", () => {
    it("formats APA 7 reference for arXiv", () => {
      const result = engine.formatReference(mockCitation, "apa7");
      expect(result).toBe(
        "Smith, J., & Jones, A. (2024). Test Paper Title. arXiv. https://arxiv.org/abs/2401.12345"
      );
    });

    it("formats APA 7 reference for non-arXiv with DOI", () => {
      const result = engine.formatReference(threeAuthorCitation, "apa7");
      expect(result).toBe(
        "Brown, C., Lee, D., & Taylor, E. (2022). Three Author Paper. https://doi.org/10.1234/multi"
      );
    });

    it("formats APA 7 reference with no DOI", () => {
      const noDoiCitation = {
        ...singleAuthorCitation,
        doi: undefined,
      };
      const result = engine.formatReference(noDoiCitation, "apa7");
      expect(result).toBe(
        "Wilson, B. (2023). Single Author Paper. arXiv. https://arxiv.org/abs/2401.12346"
      );
    });

    it("formats APA 7 reference with no year", () => {
      const result = engine.formatReference(noYearCitation, "apa7");
      expect(result).toBe(
        "Miller, F. (n.d.). No Year Paper. https://arxiv.org/abs/2401.12348"
      );
    });

    it("formats APA 7 reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "apa7");
      expect(result).toBe(
        "NoA2021. (2021). No Authors Paper. arXiv. https://arxiv.org/abs/2401.12349"
      );
    });

    it("throws for unsupported style", () => {
      expect(() => engine.formatReference(mockCitation, "mla9")).toThrow("Unsupported citation style");
    });
  });

  describe("generateReferenceList", () => {
    it("generates sorted reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "apa7");
      expect(result).toBe(
        "Brown, C., Lee, D., & Taylor, E. (2022). Three Author Paper. https://doi.org/10.1234/multi\n\n" +
        "Smith, J., & Jones, A. (2024). Test Paper Title. arXiv. https://arxiv.org/abs/2401.12345\n\n" +
        "Wilson, B. (2023). Single Author Paper. arXiv. https://arxiv.org/abs/2401.12346"
      );
    });

    it("handles empty citation list", () => {
      const result = engine.generateReferenceList([], "apa7");
      expect(result).toBe("");
    });

    it("throws for unsupported style", () => {
      expect(() => engine.generateReferenceList([mockCitation], "mla9")).toThrow("Unsupported citation style");
    });
  });

  describe("parseCitation", () => {
    it("throws not implemented error", () => {
      expect(() => engine.parseCitation("some random text")).toThrow("Not implemented");
    });
  });

  describe("generateCitationKey", () => {
    it("generates key from first author and year", () => {
      const keys = new Set<string>();
      const key = generateCitationKey(mockCitation, keys);
      expect(key).toBe("Smith2024");
    });

    it("generates key from title when no authors", () => {
      const keys = new Set<string>();
      const key = generateCitationKey(noAuthorsCitation, keys);
      expect(key).toBe("NoA2021");
    });

    it("appends suffix for duplicate keys", () => {
      const keys = new Set<string>();
      keys.add("Smith2024");
      const key = generateCitationKey(mockCitation, keys);
      expect(key).toBe("Smith2024a");
    });

    it("increments suffix for multiple duplicates", () => {
      const keys = new Set<string>(["Smith2024", "Smith2024a"]);
      const key = generateCitationKey(mockCitation, keys);
      expect(key).toBe("Smith2024b");
    });

    it("generates key without year when year is missing", () => {
      const keys = new Set<string>();
      const key = generateCitationKey(noYearCitation, keys);
      expect(key).toBe("Miller");
    });
  });
});
