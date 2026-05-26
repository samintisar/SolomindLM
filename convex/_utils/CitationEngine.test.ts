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

  const fourAuthorCitation = {
    paperId: "arxiv.2401.12350",
    title: "Four Author Paper",
    authors: ["Frank Miller", "Grace Nguyen", "Henry Park", "Ivy Chen"],
    year: 2021,
    doi: "10.1234/four",
    url: "https://arxiv.org/abs/2401.12350",
    sourceApi: "arxiv" as const,
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

  // ==================== APA 7 ====================

  describe("formatInline - apa7", () => {
    it("formats APA 7 inline citation for two authors", () => {
      const result = engine.formatInline(mockCitation, "apa7");
      expect(result).toBe("(Smith \u0026 Jones, 2024)");
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
  });

  describe("formatReference - apa7", () => {
    it("formats APA 7 reference for arXiv", () => {
      const result = engine.formatReference(mockCitation, "apa7");
      expect(result).toBe(
        "Smith, J., \u0026 Jones, A. (2024). Test Paper Title. arXiv. https://arxiv.org/abs/2401.12345"
      );
    });

    it("formats APA 7 reference for non-arXiv with DOI", () => {
      const result = engine.formatReference(threeAuthorCitation, "apa7");
      expect(result).toBe(
        "Brown, C., Lee, D., \u0026 Taylor, E. (2022). Three Author Paper. https://doi.org/10.1234/multi"
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
      expect(result).toBe("Miller, F. (n.d.). No Year Paper. https://arxiv.org/abs/2401.12348");
    });

    it("formats APA 7 reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "apa7");
      expect(result).toBe(
        "NoA2021. (2021). No Authors Paper. arXiv. https://arxiv.org/abs/2401.12349"
      );
    });
  });

  // ==================== MLA 9 ====================

  describe("formatInline - mla9", () => {
    it("formats MLA 9 inline citation for single author", () => {
      const result = engine.formatInline(singleAuthorCitation, "mla9");
      expect(result).toBe("(Wilson)");
    });

    it("formats MLA 9 inline citation for two authors", () => {
      const result = engine.formatInline(mockCitation, "mla9");
      expect(result).toBe("(Smith and Jones)");
    });

    it("formats MLA 9 inline citation for three or more authors", () => {
      const result = engine.formatInline(threeAuthorCitation, "mla9");
      expect(result).toBe("(Brown et al.)");
    });

    it("formats MLA 9 inline citation with no authors", () => {
      const result = engine.formatInline(noAuthorsCitation, "mla9");
      expect(result).toBe("(Unknown)");
    });
  });

  describe("formatReference - mla9", () => {
    it("formats MLA 9 reference for arXiv with two authors", () => {
      const result = engine.formatReference(mockCitation, "mla9");
      expect(result).toBe(
        'John Smith, and Alice Jones. "Test Paper Title." arXiv, 2024, https://arxiv.org/abs/2401.12345'
      );
    });

    it("formats MLA 9 reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "mla9");
      expect(result).toBe(
        'Bob Wilson. "Single Author Paper." arXiv, 2023, https://arxiv.org/abs/2401.12346'
      );
    });

    it("formats MLA 9 reference for three or more authors", () => {
      const result = engine.formatReference(threeAuthorCitation, "mla9");
      expect(result).toBe(
        'Carol Brown, et al. "Three Author Paper." 2022, https://doi.org/10.1234/multi'
      );
    });

    it("formats MLA 9 reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "mla9");
      expect(result).toBe(
        'NoA2021. "No Authors Paper." arXiv, 2021, https://arxiv.org/abs/2401.12349'
      );
    });

    it("formats MLA 9 reference with no year", () => {
      const result = engine.formatReference(noYearCitation, "mla9");
      expect(result).toBe('Frank Miller. "No Year Paper." n.d., https://arxiv.org/abs/2401.12348');
    });
  });

  // ==================== Chicago 17 ====================

  describe("formatInline - chicago17", () => {
    it("formats Chicago 17 inline citation for single author", () => {
      const result = engine.formatInline(singleAuthorCitation, "chicago17");
      expect(result).toBe("(Wilson 2023)");
    });

    it("formats Chicago 17 inline citation for two authors", () => {
      const result = engine.formatInline(mockCitation, "chicago17");
      expect(result).toBe("(Smith 2024)");
    });

    it("formats Chicago 17 inline citation for three or more authors", () => {
      const result = engine.formatInline(threeAuthorCitation, "chicago17");
      expect(result).toBe("(Brown 2022)");
    });

    it("formats Chicago 17 inline citation with no authors", () => {
      const result = engine.formatInline(noAuthorsCitation, "chicago17");
      expect(result).toBe("(Unknown 2021)");
    });

    it("formats Chicago 17 inline citation with no year", () => {
      const result = engine.formatInline(noYearCitation, "chicago17");
      expect(result).toBe("(Miller n.d.)");
    });
  });

  describe("formatReference - chicago17", () => {
    it("formats Chicago 17 reference for arXiv with two authors", () => {
      const result = engine.formatReference(mockCitation, "chicago17");
      expect(result).toBe(
        'John Smith, and Alice Jones. 2024. "Test Paper Title." arXiv. https://arxiv.org/abs/2401.12345'
      );
    });

    it("formats Chicago 17 reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "chicago17");
      expect(result).toBe(
        'Bob Wilson. 2023. "Single Author Paper." arXiv. https://arxiv.org/abs/2401.12346'
      );
    });

    it("formats Chicago 17 reference for three authors", () => {
      const result = engine.formatReference(threeAuthorCitation, "chicago17");
      expect(result).toBe(
        'Carol Brown, David Lee, and Eve Taylor. 2022. "Three Author Paper." https://doi.org/10.1234/multi'
      );
    });

    it("formats Chicago 17 reference for four or more authors", () => {
      const result = engine.formatReference(fourAuthorCitation, "chicago17");
      expect(result).toBe(
        'Frank Miller, Grace Nguyen, Henry Park, et al. 2021. "Four Author Paper." arXiv. https://arxiv.org/abs/2401.12350'
      );
    });

    it("formats Chicago 17 reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "chicago17");
      expect(result).toBe(
        'NoA2021. 2021. "No Authors Paper." arXiv. https://arxiv.org/abs/2401.12349'
      );
    });
  });

  // ==================== IEEE ====================

  describe("formatInline - ieee", () => {
    it("formats IEEE inline citation with index", () => {
      const result = engine.formatInline(mockCitation, "ieee", 0);
      expect(result).toBe("[1]");
    });

    it("formats IEEE inline citation with different index", () => {
      const result = engine.formatInline(mockCitation, "ieee", 2);
      expect(result).toBe("[3]");
    });

    it("throws without index for IEEE", () => {
      expect(() => engine.formatInline(mockCitation, "ieee")).toThrow(
        "IEEE inline citations require an index parameter"
      );
    });
  });

  describe("formatReference - ieee", () => {
    it("formats IEEE reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "ieee", 0);
      expect(result).toBe('[1] B. Wilson, "Single Author Paper," arXiv:2401.12346, 2023.');
    });

    it("formats IEEE reference for two authors", () => {
      const result = engine.formatReference(mockCitation, "ieee", 1);
      expect(result).toBe('[2] J. Smith and A. Jones, "Test Paper Title," arXiv:2401.12345, 2024.');
    });

    it("formats IEEE reference for three authors", () => {
      const result = engine.formatReference(threeAuthorCitation, "ieee", 2);
      expect(result).toBe(
        '[3] C. Brown, D. Lee, and E. Taylor, "Three Author Paper," doi:10.1234/multi, 2022.'
      );
    });

    it("formats IEEE reference for four or more authors", () => {
      const result = engine.formatReference(fourAuthorCitation, "ieee", 3);
      expect(result).toBe('[4] F. Miller et al., "Four Author Paper," arXiv:2401.12350, 2021.');
    });

    it("formats IEEE reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "ieee", 0);
      expect(result).toBe('[1] "No Authors Paper," arXiv:2401.12349, 2021.');
    });

    it("formats IEEE reference with no year", () => {
      const result = engine.formatReference(noYearCitation, "ieee", 0);
      expect(result).toBe('[1] F. Miller, "No Year Paper," https://arxiv.org/abs/2401.12348, n.d.');
    });

    it("throws without index for IEEE", () => {
      expect(() => engine.formatReference(mockCitation, "ieee")).toThrow(
        "IEEE references require an index parameter"
      );
    });
  });

  // ==================== Vancouver ====================

  describe("formatInline - vancouver", () => {
    it("formats Vancouver inline citation with index", () => {
      const result = engine.formatInline(mockCitation, "vancouver", 0);
      expect(result).toBe("(1)");
    });

    it("formats Vancouver inline citation with different index", () => {
      const result = engine.formatInline(mockCitation, "vancouver", 2);
      expect(result).toBe("(3)");
    });

    it("throws without index for Vancouver", () => {
      expect(() => engine.formatInline(mockCitation, "vancouver")).toThrow(
        "Vancouver inline citations require an index parameter"
      );
    });
  });

  describe("formatReference - vancouver", () => {
    it("formats Vancouver reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "vancouver", 0);
      expect(result).toBe("1. Wilson B. Single Author Paper. arXiv. 2023;2401.12346.");
    });

    it("formats Vancouver reference for two authors", () => {
      const result = engine.formatReference(mockCitation, "vancouver", 1);
      expect(result).toBe("2. Smith J, Jones A. Test Paper Title. arXiv. 2024;2401.12345.");
    });

    it("formats Vancouver reference for three authors", () => {
      const result = engine.formatReference(threeAuthorCitation, "vancouver", 2);
      expect(result).toBe("3. Brown C, Lee D, Taylor E. Three Author Paper. 2022;10.1234/multi.");
    });

    it("formats Vancouver reference for four or more authors", () => {
      const result = engine.formatReference(fourAuthorCitation, "vancouver", 3);
      expect(result).toBe(
        "4. Miller F, Nguyen G, Park H, Chen I. Four Author Paper. arXiv. 2021;2401.12350."
      );
    });

    it("formats Vancouver reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "vancouver", 0);
      expect(result).toBe("1. No Authors Paper. arXiv. 2021;2401.12349.");
    });

    it("formats Vancouver reference with no year", () => {
      const result = engine.formatReference(noYearCitation, "vancouver", 0);
      expect(result).toBe("1. Miller F. No Year Paper. n.d.;https://arxiv.org/abs/2401.12348.");
    });

    it("throws without index for Vancouver", () => {
      expect(() => engine.formatReference(mockCitation, "vancouver")).toThrow(
        "Vancouver references require an index parameter"
      );
    });
  });

  // ==================== Harvard ====================

  describe("formatInline - harvard", () => {
    it("formats Harvard inline citation for single author", () => {
      const result = engine.formatInline(singleAuthorCitation, "harvard");
      expect(result).toBe("(Wilson, 2023)");
    });

    it("formats Harvard inline citation for two authors", () => {
      const result = engine.formatInline(mockCitation, "harvard");
      expect(result).toBe("(Smith and Jones, 2024)");
    });

    it("formats Harvard inline citation for three or more authors", () => {
      const result = engine.formatInline(threeAuthorCitation, "harvard");
      expect(result).toBe("(Brown et al., 2022)");
    });

    it("formats Harvard inline citation with no authors", () => {
      const result = engine.formatInline(noAuthorsCitation, "harvard");
      expect(result).toBe("(Unknown, 2021)");
    });

    it("formats Harvard inline citation with no year", () => {
      const result = engine.formatInline(noYearCitation, "harvard");
      expect(result).toBe("(Miller, n.d.)");
    });
  });

  describe("formatReference - harvard", () => {
    it("formats Harvard reference for arXiv with two authors", () => {
      const result = engine.formatReference(mockCitation, "harvard");
      expect(result).toBe(
        "Smith, J. and Jones, A. (2024) 'Test Paper Title', arXiv. Available at: https://arxiv.org/abs/2401.12345"
      );
    });

    it("formats Harvard reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "harvard");
      expect(result).toBe(
        "Wilson, B. (2023) 'Single Author Paper', arXiv. Available at: https://arxiv.org/abs/2401.12346"
      );
    });

    it("formats Harvard reference for three or more authors", () => {
      const result = engine.formatReference(threeAuthorCitation, "harvard");
      expect(result).toBe(
        "Brown, C. et al. (2022) 'Three Author Paper', Available at: https://doi.org/10.1234/multi"
      );
    });

    it("formats Harvard reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "harvard");
      expect(result).toBe(
        "NoA2021 (2021) 'No Authors Paper', arXiv. Available at: https://arxiv.org/abs/2401.12349"
      );
    });

    it("formats Harvard reference with no year", () => {
      const result = engine.formatReference(noYearCitation, "harvard");
      expect(result).toBe(
        "Miller, F. (n.d.) 'No Year Paper', Available at: https://arxiv.org/abs/2401.12348"
      );
    });
  });

  // ==================== APA 6 ====================

  describe("formatInline - apa6", () => {
    it("formats APA 6 inline citation for two authors", () => {
      const result = engine.formatInline(mockCitation, "apa6");
      expect(result).toBe("(Smith \u0026 Jones, 2024)");
    });

    it("formats APA 6 inline citation for single author", () => {
      const result = engine.formatInline(singleAuthorCitation, "apa6");
      expect(result).toBe("(Wilson, 2023)");
    });

    it("formats APA 6 inline citation for three or more authors", () => {
      const result = engine.formatInline(threeAuthorCitation, "apa6");
      expect(result).toBe("(Brown et al., 2022)");
    });
  });

  describe("formatReference - apa6", () => {
    it("formats APA 6 reference for arXiv with two authors", () => {
      const result = engine.formatReference(mockCitation, "apa6");
      expect(result).toBe(
        "Smith, J., \u0026 Jones, A. (2024). Test Paper Title. arXiv. https://arxiv.org/abs/2401.12345"
      );
    });

    it("formats APA 6 reference with DOI", () => {
      const result = engine.formatReference(threeAuthorCitation, "apa6");
      expect(result).toBe(
        "Brown, C., Lee, D., \u0026 Taylor, E. (2022). Three Author Paper. doi:10.1234/multi"
      );
    });

    it("formats APA 6 reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "apa6");
      expect(result).toBe(
        "NoA2021. (2021). No Authors Paper. arXiv. https://arxiv.org/abs/2401.12349"
      );
    });
  });

  // ==================== MLA 8 ====================

  describe("formatInline - mla8", () => {
    it("formats MLA 8 inline citation for single author", () => {
      const result = engine.formatInline(singleAuthorCitation, "mla8");
      expect(result).toBe("(Wilson)");
    });

    it("formats MLA 8 inline citation for two authors", () => {
      const result = engine.formatInline(mockCitation, "mla8");
      expect(result).toBe("(Smith and Jones)");
    });

    it("formats MLA 8 inline citation for three or more authors", () => {
      const result = engine.formatInline(threeAuthorCitation, "mla8");
      expect(result).toBe("(Brown et al.)");
    });
  });

  describe("formatReference - mla8", () => {
    it("formats MLA 8 reference for arXiv with two authors", () => {
      const result = engine.formatReference(mockCitation, "mla8");
      expect(result).toBe(
        'John Smith, and Alice Jones. "Test Paper Title." arXiv, 2024, https://arxiv.org/abs/2401.12345'
      );
    });

    it("formats MLA 8 reference for three or more authors", () => {
      const result = engine.formatReference(threeAuthorCitation, "mla8");
      expect(result).toBe(
        'Carol Brown, et al. "Three Author Paper." 2022, https://doi.org/10.1234/multi'
      );
    });
  });

  // ==================== Chicago 17 Notes ====================

  describe("formatInline - chicago17_notes", () => {
    it("formats Chicago 17 Notes inline citation with index", () => {
      const result = engine.formatInline(mockCitation, "chicago17_notes", 0);
      expect(result).toBe("\u00b9");
    });

    it("formats Chicago 17 Notes inline citation with different index", () => {
      const result = engine.formatInline(mockCitation, "chicago17_notes", 2);
      expect(result).toBe("\u00b3");
    });

    it("throws without index for Chicago 17 Notes", () => {
      expect(() => engine.formatInline(mockCitation, "chicago17_notes")).toThrow(
        "Chicago 17 Notes inline citations require an index parameter"
      );
    });
  });

  describe("formatReference - chicago17_notes", () => {
    it("formats Chicago 17 Notes reference for arXiv with two authors", () => {
      const result = engine.formatReference(mockCitation, "chicago17_notes");
      expect(result).toBe(
        'John Smith, and Alice Jones, "Test Paper Title," arXiv, 2024, https://arxiv.org/abs/2401.12345.'
      );
    });

    it("formats Chicago 17 Notes reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "chicago17_notes");
      expect(result).toBe(
        'Bob Wilson, "Single Author Paper," arXiv, 2023, https://arxiv.org/abs/2401.12346.'
      );
    });

    it("formats Chicago 17 Notes reference with no authors", () => {
      const result = engine.formatReference(noAuthorsCitation, "chicago17_notes");
      expect(result).toBe(
        'NoA2021, "No Authors Paper," arXiv, 2021, https://arxiv.org/abs/2401.12349.'
      );
    });
  });

  // ==================== AMA 11 ====================

  describe("formatInline - ama11", () => {
    it("formats AMA 11 inline citation with index", () => {
      const result = engine.formatInline(mockCitation, "ama11", 0);
      expect(result).toBe("\u00b9");
    });

    it("formats AMA 11 inline citation with different index", () => {
      const result = engine.formatInline(mockCitation, "ama11", 2);
      expect(result).toBe("\u00b3");
    });

    it("throws without index for AMA 11", () => {
      expect(() => engine.formatInline(mockCitation, "ama11")).toThrow(
        "AMA 11 inline citations require an index parameter"
      );
    });
  });

  describe("formatReference - ama11", () => {
    it("formats AMA 11 reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "ama11", 0);
      expect(result).toBe(
        "1. Wilson B. Single Author Paper. arXiv. 2023. https://arxiv.org/abs/2401.12346."
      );
    });

    it("formats AMA 11 reference for two authors", () => {
      const result = engine.formatReference(mockCitation, "ama11", 1);
      expect(result).toBe(
        "2. Smith J, Jones A. Test Paper Title. arXiv. 2024. https://arxiv.org/abs/2401.12345."
      );
    });

    it("formats AMA 11 reference for three authors", () => {
      const result = engine.formatReference(threeAuthorCitation, "ama11", 2);
      expect(result).toBe(
        "3. Brown C, Lee D, Taylor E. Three Author Paper. 2022. doi:10.1234/multi."
      );
    });

    it("throws without index for AMA 11", () => {
      expect(() => engine.formatReference(mockCitation, "ama11")).toThrow(
        "AMA 11 references require an index parameter"
      );
    });
  });

  // ==================== AMA 10 ====================

  describe("formatInline - ama10", () => {
    it("formats AMA 10 inline citation with index", () => {
      const result = engine.formatInline(mockCitation, "ama10", 0);
      expect(result).toBe("\u00b9");
    });

    it("throws without index for AMA 10", () => {
      expect(() => engine.formatInline(mockCitation, "ama10")).toThrow(
        "AMA 10 inline citations require an index parameter"
      );
    });
  });

  describe("formatReference - ama10", () => {
    it("formats AMA 10 reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "ama10", 0);
      expect(result).toBe(
        "1. Wilson B. Single Author Paper. arXiv. 2023. https://arxiv.org/abs/2401.12346."
      );
    });

    it("formats AMA 10 reference for two authors", () => {
      const result = engine.formatReference(mockCitation, "ama10", 1);
      expect(result).toBe(
        "2. Smith J., Jones A. Test Paper Title. arXiv. 2024. https://arxiv.org/abs/2401.12345."
      );
    });
  });

  // ==================== ACS ====================

  describe("formatInline - acs", () => {
    it("formats ACS inline citation with index", () => {
      const result = engine.formatInline(mockCitation, "acs", 0);
      expect(result).toBe("\u00b9");
    });

    it("throws without index for ACS", () => {
      expect(() => engine.formatInline(mockCitation, "acs")).toThrow(
        "ACS inline citations require an index parameter"
      );
    });
  });

  describe("formatReference - acs", () => {
    it("formats ACS reference for single author", () => {
      const result = engine.formatReference(singleAuthorCitation, "acs", 0);
      expect(result).toBe(
        "1. Wilson, B. Single Author Paper. arXiv. 2023. https://arxiv.org/abs/2401.12346."
      );
    });

    it("formats ACS reference for two authors", () => {
      const result = engine.formatReference(mockCitation, "acs", 1);
      expect(result).toBe(
        "2. Smith, J.; Jones, A. Test Paper Title. arXiv. 2024. https://arxiv.org/abs/2401.12345."
      );
    });

    it("throws without index for ACS", () => {
      expect(() => engine.formatReference(mockCitation, "acs")).toThrow(
        "ACS references require an index parameter"
      );
    });
  });

  // ==================== generateReferenceList ====================

  describe("generateReferenceList", () => {
    it("generates sorted APA 7 reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "apa7");
      expect(result).toBe(
        "Brown, C., Lee, D., \u0026 Taylor, E. (2022). Three Author Paper. https://doi.org/10.1234/multi\n\n" +
          "Smith, J., \u0026 Jones, A. (2024). Test Paper Title. arXiv. https://arxiv.org/abs/2401.12345\n\n" +
          "Wilson, B. (2023). Single Author Paper. arXiv. https://arxiv.org/abs/2401.12346"
      );
    });

    it("generates sorted MLA 9 reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "mla9");
      expect(result).toBe(
        'Carol Brown, et al. "Three Author Paper." 2022, https://doi.org/10.1234/multi\n\n' +
          'John Smith, and Alice Jones. "Test Paper Title." arXiv, 2024, https://arxiv.org/abs/2401.12345\n\n' +
          'Bob Wilson. "Single Author Paper." arXiv, 2023, https://arxiv.org/abs/2401.12346'
      );
    });

    it("generates sorted Chicago 17 reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "chicago17");
      expect(result).toBe(
        'Carol Brown, David Lee, and Eve Taylor. 2022. "Three Author Paper." https://doi.org/10.1234/multi\n\n' +
          'John Smith, and Alice Jones. 2024. "Test Paper Title." arXiv. https://arxiv.org/abs/2401.12345\n\n' +
          'Bob Wilson. 2023. "Single Author Paper." arXiv. https://arxiv.org/abs/2401.12346'
      );
    });

    it("generates sequentially numbered IEEE reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "ieee");
      expect(result).toBe(
        '[1] C. Brown, D. Lee, and E. Taylor, "Three Author Paper," doi:10.1234/multi, 2022.\n\n' +
          '[2] J. Smith and A. Jones, "Test Paper Title," arXiv:2401.12345, 2024.\n\n' +
          '[3] B. Wilson, "Single Author Paper," arXiv:2401.12346, 2023.'
      );
    });

    it("generates sequentially numbered Vancouver reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "vancouver");
      expect(result).toBe(
        "1. Brown C, Lee D, Taylor E. Three Author Paper. 2022;10.1234/multi.\n\n" +
          "2. Smith J, Jones A. Test Paper Title. arXiv. 2024;2401.12345.\n\n" +
          "3. Wilson B. Single Author Paper. arXiv. 2023;2401.12346."
      );
    });

    it("generates sorted Harvard reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "harvard");
      expect(result).toBe(
        "Brown, C. et al. (2022) 'Three Author Paper', Available at: https://doi.org/10.1234/multi\n\n" +
          "Smith, J. and Jones, A. (2024) 'Test Paper Title', arXiv. Available at: https://arxiv.org/abs/2401.12345\n\n" +
          "Wilson, B. (2023) 'Single Author Paper', arXiv. Available at: https://arxiv.org/abs/2401.12346"
      );
    });

    it("generates sorted APA 6 reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "apa6");
      expect(result).toBe(
        "Brown, C., Lee, D., \u0026 Taylor, E. (2022). Three Author Paper. doi:10.1234/multi\n\n" +
          "Smith, J., \u0026 Jones, A. (2024). Test Paper Title. arXiv. https://arxiv.org/abs/2401.12345\n\n" +
          "Wilson, B. (2023). Single Author Paper. arXiv. https://arxiv.org/abs/2401.12346"
      );
    });

    it("generates sorted MLA 8 reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "mla8");
      expect(result).toBe(
        'Carol Brown, et al. "Three Author Paper." 2022, https://doi.org/10.1234/multi\n\n' +
          'John Smith, and Alice Jones. "Test Paper Title." arXiv, 2024, https://arxiv.org/abs/2401.12345\n\n' +
          'Bob Wilson. "Single Author Paper." arXiv, 2023, https://arxiv.org/abs/2401.12346'
      );
    });

    it("generates sorted Chicago 17 Notes reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "chicago17_notes");
      expect(result).toBe(
        'Carol Brown, David Lee, and Eve Taylor, "Three Author Paper," 2022, https://doi.org/10.1234/multi.\n\n' +
          'John Smith, and Alice Jones, "Test Paper Title," arXiv, 2024, https://arxiv.org/abs/2401.12345.\n\n' +
          'Bob Wilson, "Single Author Paper," arXiv, 2023, https://arxiv.org/abs/2401.12346.'
      );
    });

    it("generates sequentially numbered AMA 11 reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "ama11");
      expect(result).toBe(
        "1. Brown C, Lee D, Taylor E. Three Author Paper. 2022. doi:10.1234/multi.\n\n" +
          "2. Smith J, Jones A. Test Paper Title. arXiv. 2024. https://arxiv.org/abs/2401.12345.\n\n" +
          "3. Wilson B. Single Author Paper. arXiv. 2023. https://arxiv.org/abs/2401.12346."
      );
    });

    it("generates sequentially numbered AMA 10 reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "ama10");
      expect(result).toBe(
        "1. Brown C., Lee D., Taylor E. Three Author Paper. 2022. doi:10.1234/multi.\n\n" +
          "2. Smith J., Jones A. Test Paper Title. arXiv. 2024. https://arxiv.org/abs/2401.12345.\n\n" +
          "3. Wilson B. Single Author Paper. arXiv. 2023. https://arxiv.org/abs/2401.12346."
      );
    });

    it("generates sequentially numbered ACS reference list", () => {
      const citations = [threeAuthorCitation, mockCitation, singleAuthorCitation];
      const result = engine.generateReferenceList(citations, "acs");
      expect(result).toBe(
        "1. Brown, C.; Lee, D.; Taylor, E. Three Author Paper. 2022. doi:10.1234/multi.\n\n" +
          "2. Smith, J.; Jones, A. Test Paper Title. arXiv. 2024. https://arxiv.org/abs/2401.12345.\n\n" +
          "3. Wilson, B. Single Author Paper. arXiv. 2023. https://arxiv.org/abs/2401.12346."
      );
    });

    it("handles empty citation list", () => {
      const result = engine.generateReferenceList([], "apa7");
      expect(result).toBe("");
    });

    it("throws for unsupported style", () => {
      expect(() => engine.generateReferenceList([mockCitation], "invalid")).toThrow(
        "Unsupported citation style"
      );
    });
  });

  // ==================== parseCitation ====================

  describe("parseCitation", () => {
    it("throws not implemented error", () => {
      expect(() => engine.parseCitation("some random text")).toThrow("Not implemented");
    });
  });

  // ==================== generateCitationKey ====================

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
      expect(key).toBe("Smith2024_1");
    });

    it("increments suffix for multiple duplicates", () => {
      const keys = new Set<string>(["Smith2024", "Smith2024_1"]);
      const key = generateCitationKey(mockCitation, keys);
      expect(key).toBe("Smith2024_2");
    });

    it("generates key without year when year is missing", () => {
      const keys = new Set<string>();
      const key = generateCitationKey(noYearCitation, keys);
      expect(key).toBe("Miller");
    });
  });
});
