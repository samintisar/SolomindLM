import { describe, it, expect, beforeEach } from "vitest";
import { BibliographyParserService, PaperRecord } from "./BibliographyParserService";

describe("BibliographyParserService", () => {
  let service: BibliographyParserService;

  beforeEach(() => {
    service = new BibliographyParserService();
  });

  describe("BibTeX parsing", () => {
    it("parses a single BibTeX entry", () => {
      const bibtex = `@article{smith2023,
        title = {A Great Paper},
        author = {Smith, J.},
        journal = {Journal of Testing},
        year = {2023},
        doi = {10.1234/test},
        abstract = {This is a test abstract.}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(1);
      expect(result.papers[0]).toMatchObject({
        title: "A Great Paper",
        authors: ["Smith, J."],
        venue: "Journal of Testing",
        publicationYear: 2023,
        doi: "10.1234/test",
        abstract: "This is a test abstract.",
        sourceType: "bibtex",
        isOa: false,
      } as Partial<PaperRecord>);
      expect(result.stats).toEqual({
        total: 1,
        withDoi: 1,
        withoutDoi: 0,
        malformed: 0,
      });
    });

    it("parses multiple BibTeX entries", () => {
      const bibtex = `@article{smith2023,
        title = {Paper One},
        author = {Smith, J. and Jones, A.},
        journal = {Journal One},
        year = {2023},
        doi = {10.1234/one}
      }

      @book{doe2022,
        title = {Book Title},
        author = {Doe, Jane},
        publisher = {Test Publisher},
        year = {2022},
        doi = {10.1234/two}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(2);
      expect(result.papers[0].title).toBe("Paper One");
      expect(result.papers[0].authors).toEqual(["Smith, J.", "Jones, A."]);
      expect(result.papers[0].venue).toBe("Journal One");
      expect(result.papers[1].title).toBe("Book Title");
      expect(result.papers[1].venue).toBe("Test Publisher");
      expect(result.stats.total).toBe(2);
      expect(result.stats.withDoi).toBe(2);
    });

    it("parses multiple authors correctly", () => {
      const bibtex = `@article{multi2023,
        title = {Many Authors},
        author = {Smith, J. and Jones, A. and Brown, B.},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].authors).toEqual(["Smith, J.", "Jones, A.", "Brown, B."]);
    });

    it("handles entries with inproceedings type", () => {
      const bibtex = `@inproceedings{conf2023,
        title = {Conference Paper},
        author = {Author, One},
        booktitle = {Proceedings of the Test Conference},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].venue).toBe("Proceedings of the Test Conference");
    });

    it("handles missing optional fields", () => {
      const bibtex = `@article{minimal2023,
        title = {Minimal Paper}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(1);
      expect(result.papers[0].title).toBe("Minimal Paper");
      expect(result.papers[0].authors).toEqual([]);
      expect(result.papers[0].abstract).toBe("");
      expect(result.papers[0].doi).toBeUndefined();
      expect(result.papers[0].publicationYear).toBeUndefined();
    });
  });

  describe("RIS parsing", () => {
    it("parses a single RIS entry", () => {
      const ris = `TY  - JOUR
TI  - A Great Paper
AU  - Smith, J.
JO  - Journal of Testing
PY  - 2023
DO  - 10.1234/test
AB  - This is a test abstract.
ER  -`;

      const result = service.parse(ris, "ris");

      expect(result.papers).toHaveLength(1);
      expect(result.papers[0]).toMatchObject({
        title: "A Great Paper",
        authors: ["Smith, J."],
        venue: "Journal of Testing",
        publicationYear: 2023,
        doi: "10.1234/test",
        abstract: "This is a test abstract.",
        sourceType: "ris",
        isOa: false,
      } as Partial<PaperRecord>);
    });

    it("parses multiple RIS entries", () => {
      const ris = `TY  - JOUR
TI  - Paper One
AU  - Smith, J.
JO  - Journal One
PY  - 2023
DO  - 10.1234/one
ER  -

TY  - BOOK
TI  - Book Title
AU  - Doe, Jane
PY  - 2022
DO  - 10.1234/two
ER  -`;

      const result = service.parse(ris, "ris");

      expect(result.papers).toHaveLength(2);
      expect(result.papers[0].title).toBe("Paper One");
      expect(result.papers[1].title).toBe("Book Title");
      expect(result.stats.total).toBe(2);
      expect(result.stats.withDoi).toBe(2);
    });

    it("handles multiple authors in RIS", () => {
      const ris = `TY  - JOUR
TI  - Multi Author Paper
AU  - Smith, J.
AU  - Jones, A.
AU  - Brown, B.
PY  - 2023
ER  -`;

      const result = service.parse(ris, "ris");

      expect(result.papers[0].authors).toEqual(["Smith, J.", "Jones, A.", "Brown, B."]);
    });

    it("handles RIS without ER  - at end of file", () => {
      const ris = `TY  - JOUR
TI  - Last Paper
AU  - Smith, J.
PY  - 2023`;

      const result = service.parse(ris, "ris");

      expect(result.papers).toHaveLength(1);
      expect(result.papers[0].title).toBe("Last Paper");
    });

    it("handles alternate RIS tags", () => {
      const ris = `TY  - JOUR
TI  - Alternate Tags
AU  - Author, One
JF  - Journal Full
Y1  - 2022/01/01
DOI - 10.1234/doi
ER  -`;

      const result = service.parse(ris, "ris");

      expect(result.papers[0].venue).toBe("Journal Full");
      expect(result.papers[0].publicationYear).toBe(2022);
      expect(result.papers[0].doi).toBe("10.1234/doi");
    });
  });

  describe("auto-detection", () => {
    it("detects BibTeX format from content", () => {
      const bibtex = `@article{test2023, title = {Test}}`;

      const result = service.parse(bibtex, "auto");

      expect(result.papers).toHaveLength(1);
      expect(result.papers[0].title).toBe("Test");
    });

    it("detects RIS format from content", () => {
      const ris = `TY  - JOUR
TI  - Test
ER  -`;

      const result = service.parse(ris, "auto");

      expect(result.papers).toHaveLength(1);
      expect(result.papers[0].title).toBe("Test");
    });

    it("defaults to BibTeX when format cannot be detected", () => {
      const unknown = `Some random text that is neither BibTeX nor RIS`;

      const result = service.parse(unknown, "auto");

      expect(result.papers).toHaveLength(0);
      expect(result.stats.malformed).toBe(0);
    });
  });

  describe("deduplication", () => {
    it("removes duplicate DOIs within the same import", () => {
      const bibtex = `@article{first,
        title = {First},
        doi = {10.1234/duplicate},
        year = {2023}
      }

      @article{second,
        title = {Second},
        doi = {10.1234/duplicate},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(1);
      expect(result.papers[0].title).toBe("First");
      expect(result.stats.total).toBe(2);
      expect(result.stats.withDoi).toBe(1);
    });

    it("keeps entries without DOI (no dedup)", () => {
      const bibtex = `@article{first,
        title = {First},
        year = {2023}
      }

      @article{second,
        title = {Second},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(2);
      expect(result.stats.total).toBe(2);
      expect(result.stats.withoutDoi).toBe(2);
    });

    it("handles case-insensitive DOI deduplication", () => {
      const bibtex = `@article{first,
        title = {First},
        doi = {10.1234/MixedCase},
        year = {2023}
      }

      @article{second,
        title = {Second},
        doi = {10.1234/mixedcase},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(1);
    });
  });

  describe("LaTeX accent handling", () => {
    it("converts basic LaTeX accents", () => {
      const bibtex = `@article{accents,
        title = {The {\\"u}mlaut Paper},
        author = {M{\\"u}ller, Hans and Jos{\\'e} Garc{\\'{i}}a},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].title).toBe("The ümlaut Paper");
      expect(result.papers[0].authors).toContain("Müller, Hans");
      expect(result.papers[0].authors).toContain("José García");
    });

    it("converts various accent types", () => {
      const bibtex = "@article{allaccents,\n" +
        "  title = {{\\`a}{\\^e}{\\~n}{\\c{c}}},\n" +
        "  year = {2023}\n" +
        "}";

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].title).toBe("àêñç");
    });
  });

  describe("malformed entries", () => {
    it("counts entries without title as malformed", () => {
      const bibtex = `@article{notitle,
        author = {Smith, J.},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(0);
      expect(result.stats.malformed).toBeGreaterThan(0);
    });

    it("handles completely empty input", () => {
      const result = service.parse("", "bibtex");

      expect(result.papers).toHaveLength(0);
      expect(result.stats).toEqual({
        total: 0,
        withDoi: 0,
        withoutDoi: 0,
        malformed: 0,
      });
    });

    it("handles RIS entry without title", () => {
      const ris = `TY  - JOUR
AU  - Smith, J.
PY  - 2023
ER  -`;

      const result = service.parse(ris, "ris");

      expect(result.papers).toHaveLength(0);
      expect(result.stats.malformed).toBeGreaterThan(0);
    });

    it("reports stats correctly for mixed valid and invalid entries", () => {
      const bibtex = `@article{valid,
        title = {Valid Paper},
        doi = {10.1234/valid},
        year = {2023}
      }

      @article{invalid,
        author = {No Title Here},
        year = {2023}
      }

      @article{valid2,
        title = {Another Valid},
        year = {2022}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers).toHaveLength(2);
      expect(result.stats.total).toBe(3);
      expect(result.stats.withDoi).toBe(1);
      expect(result.stats.withoutDoi).toBe(1);
      expect(result.stats.malformed).toBe(1);
    });
  });

  describe("encoding handling", () => {
    it("handles UTF-8 content correctly", () => {
      const bibtex = `@article{utf8,
        title = {Ümlaut and Ñoño},
        author = {Müller, J.},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].title).toBe("Ümlaut and Ñoño");
      expect(result.warnings).toBeUndefined();
    });

    it("adds warning when Latin-1 fallback is used", () => {
      // Simulate content with replacement characters (would come from invalid UTF-8)
      const bibtex = `@article{fallback,
        title = {Test\uFFFD},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain("Encoding fallback");
    });
  });

  describe("edge cases", () => {
    it("handles entries with no DOI field", () => {
      const bibtex = `@article{nodoi,
        title = {No DOI},
        author = {Smith, J.},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].doi).toBeUndefined();
      expect(result.stats.withDoi).toBe(0);
      expect(result.stats.withoutDoi).toBe(1);
    });

    it("handles entries with empty DOI", () => {
      const bibtex = `@article{emptydoi,
        title = {Empty DOI},
        doi = {},
        year = {2023}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].doi).toBeUndefined();
      expect(result.stats.withoutDoi).toBe(1);
    });

    it("handles year in various formats", () => {
      const bibtex = `@article{year1,
        title = {Year Test 1},
        year = {2023}
      }
      @article{year2,
        title = {Year Test 2},
        year = {2023/05/01}
      }
      @article{year3,
        title = {Year Test 3},
        year = {invalid}
      }`;

      const result = service.parse(bibtex, "bibtex");

      expect(result.papers[0].publicationYear).toBe(2023);
      expect(result.papers[1].publicationYear).toBe(2023);
      expect(result.papers[2].publicationYear).toBeUndefined();
    });

    it("handles RIS with PY date format", () => {
      const ris = `TY  - JOUR
TI  - Date Test
PY  - 2023/05/01
ER  -`;

      const result = service.parse(ris, "ris");

      expect(result.papers[0].publicationYear).toBe(2023);
    });
  });
});
