import { describe, it, expect } from "vitest";
import { createCitationEngine, generateCitationKey } from "../../../_utils/CitationEngine";
import type { Citation } from "../../../_utils/CitationEngine";

/**
 * Integration tests for CitationEngine with realistic academic data.
 *
 * These tests verify citation formatting works correctly with real-world
 * paper metadata from various sources (arXiv, Semantic Scholar, PubMed).
 */

const engine = createCitationEngine();

describe("CitationEngine Integration - Realistic Data", () => {
  describe("Real arXiv papers", () => {
    const arxivPapers: Citation[] = [
      {
        paperId: "arxiv.1706.03762",
        title: "Attention Is All You Need",
        authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit", "Llion Jones", "Aidan N. Gomez", "Łukasz Kaiser", "Illia Polosukhin"],
        year: 2017,
        doi: "10.5555/3295222.3295349",
        url: "https://arxiv.org/abs/1706.03762",
        sourceApi: "arxiv",
      },
      {
        paperId: "arxiv.1810.04805",
        title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
        authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee", "Kristina Toutanova"],
        year: 2019,
        doi: "10.18653/v1/N19-1423",
        url: "https://arxiv.org/abs/1810.04805",
        sourceApi: "arxiv",
      },
      {
        paperId: "arxiv.1409.3215",
        title: "Sequence to Sequence Learning with Neural Networks",
        authors: ["Ilya Sutskever", "Oriol Vinyals", "Quoc V. Le"],
        year: 2014,
        url: "https://arxiv.org/abs/1409.3215",
        sourceApi: "arxiv",
      },
    ];

    it("formats inline citations for multi-author arXiv papers", () => {
      const vaswani = arxivPapers[0];
      const result = engine.formatInline(vaswani, "apa7");
      expect(result).toBe("(Vaswani et al., 2017)");
    });

    it("formats inline citations for 4-author arXiv papers", () => {
      const devlin = arxivPapers[1];
      const result = engine.formatInline(devlin, "apa7");
      expect(result).toBe("(Devlin et al., 2019)");
    });

    it("formats inline citations for 3-author papers", () => {
      const sutskever = arxivPapers[2];
      const result = engine.formatInline(sutskever, "apa7");
      expect(result).toBe("(Sutskever et al., 2014)");
    });

    it("formats reference for arXiv paper (uses arXiv URL even with DOI)", () => {
      const devlin = arxivPapers[1];
      const result = engine.formatReference(devlin, "apa7");
      expect(result).toContain("Devlin, J.");
      expect(result).toContain("(2019)");
      expect(result).toContain("BERT: Pre-training of Deep Bidirectional Transformers");
      expect(result).toContain("arXiv");
      expect(result).toContain("https://arxiv.org/abs/1810.04805");
    });

    it("formats reference for arXiv paper without DOI", () => {
      const sutskever = arxivPapers[2];
      const result = engine.formatReference(sutskever, "apa7");
      expect(result).toContain("Sutskever, I.");
      expect(result).toContain("(2014)");
      expect(result).toContain("arXiv");
      expect(result).toContain("https://arxiv.org/abs/1409.3215");
    });
  });

  describe("Real Semantic Scholar papers", () => {
    const semanticScholarPapers: Citation[] = [
      {
        paperId: "s2.123456789",
        title: "Deep Residual Learning for Image Recognition",
        authors: ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
        year: 2016,
        doi: "10.1109/CVPR.2016.90",
        url: "https://www.semanticscholar.org/paper/Deep-Residual-Learning-for-Image-Recognition-He-Zhang",
        sourceApi: "semantic_scholar",
      },
      {
        paperId: "s2.987654321",
        title: "Generative Adversarial Networks",
        authors: ["Ian J. Goodfellow", "Jean Pouget-Abadie", "Mehdi Mirza", "Bing Xu", "David Warde-Farley", "Sherjil Ozair", "Aaron Courville", "Yoshua Bengio"],
        year: 2014,
        doi: "10.5555/2969033.2969125",
        url: "https://www.semanticscholar.org/paper/Generative-Adversarial-Nets-Goodfellow-Pouget-Abadie",
        sourceApi: "semantic_scholar",
      },
    ];

    it("formats inline citation for Semantic Scholar paper", () => {
      const he = semanticScholarPapers[0];
      const result = engine.formatInline(he, "apa7");
      expect(result).toBe("(He et al., 2016)");
    });

    it("formats reference with DOI for non-arXiv source", () => {
      const he = semanticScholarPapers[0];
      const result = engine.formatReference(he, "apa7");
      expect(result).toContain("He, K.");
      expect(result).toContain("(2016)");
      expect(result).toContain("https://doi.org/10.1109/CVPR.2016.90");
      expect(result).not.toContain("arXiv");
    });

    it("handles 8 authors correctly", () => {
      const goodfellow = semanticScholarPapers[1];
      const result = engine.formatInline(goodfellow, "apa7");
      expect(result).toBe("(Goodfellow et al., 2014)");
    });
  });

  describe("PubMed papers", () => {
    const pubmedPapers: Citation[] = [
      {
        paperId: "pubmed.29145578",
        title: "Dermatologist-level classification of skin cancer with deep neural networks",
        authors: ["Andre Esteva", "Brett Kuprel", "Roberto A. Novoa", "Justin Ko", "Susan M. Swetter", "Helen M. Blau", "Sebastian Thrun"],
        year: 2017,
        doi: "10.1038/nature21056",
        url: "https://pubmed.ncbi.nlm.nih.gov/28117445/",
        sourceApi: "pubmed",
      },
      {
        paperId: "pubmed.12345678",
        title: "A Novel Approach to Something Medical",
        authors: ["John Smith", "Jane Doe", "Robert Johnson"],
        year: 2023,
        url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
        sourceApi: "pubmed",
      },
    ];

    it("formats PubMed paper with full DOI", () => {
      const esteva = pubmedPapers[0];
      const result = engine.formatReference(esteva, "apa7");
      expect(result).toContain("Esteva, A.");
      expect(result).toContain("(2017)");
      expect(result).toContain("https://doi.org/10.1038/nature21056");
    });

    it("handles standard author names", () => {
      const smith = pubmedPapers[1];
      const result = engine.formatInline(smith, "apa7");
      expect(result).toBe("(Smith et al., 2023)");
    });
  });

  describe("Edge cases and special formatting", () => {
    it("handles paper with no authors", () => {
      const noAuthors: Citation = {
        paperId: "test.123",
        title: "Anonymous Paper",
        year: 2022,
        url: "https://example.com",
        sourceApi: "arxiv",
      };

      const inline = engine.formatInline(noAuthors, "apa7");
      expect(inline).toBe("(Unknown, 2022)");

      const reference = engine.formatReference(noAuthors, "apa7");
      expect(reference).toContain("Ano2022. (2022)");
    });

    it("handles paper with no year", () => {
      const noYear: Citation = {
        paperId: "test.456",
        title: "Timeless Paper",
        authors: ["Timeless Author"],
        url: "https://example.com",
        sourceApi: "semantic_scholar",
      };

      const inline = engine.formatInline(noYear, "apa7");
      expect(inline).toBe("(Author, n.d.)");

      const reference = engine.formatReference(noYear, "apa7");
      expect(reference).toContain("(n.d.)");
    });

    it("handles single author correctly", () => {
      const singleAuthor: Citation = {
        paperId: "test.789",
        title: "Solo Work",
        authors: ["Solo Researcher"],
        year: 2020,
        url: "https://example.com",
        sourceApi: "arxiv",
      };

      const inline = engine.formatInline(singleAuthor, "apa7");
      expect(inline).toBe("(Researcher, 2020)");
    });

    it("handles two authors with ampersand", () => {
      const twoAuthors: Citation = {
        paperId: "test.abc",
        title: "Dual Authorship",
        authors: ["First Author", "Second Author"],
        year: 2021,
        url: "https://example.com",
        sourceApi: "arxiv",
      };

      const inline = engine.formatInline(twoAuthors, "apa7");
      expect(inline).toBe("(Author & Author, 2021)");
    });
  });

  describe("Citation key generation with duplicates", () => {
    it("handles multiple papers from same author in same year", () => {
      const keys = new Set<string>();

      const paper1: Citation = {
        paperId: "test.1",
        title: "Paper One",
        authors: ["John Smith"],
        year: 2024,
        url: "https://example.com/1",
        sourceApi: "arxiv",
      };

      const paper2: Citation = {
        paperId: "test.2",
        title: "Paper Two",
        authors: ["John Smith"],
        year: 2024,
        url: "https://example.com/2",
        sourceApi: "arxiv",
      };

      const paper3: Citation = {
        paperId: "test.3",
        title: "Paper Three",
        authors: ["John Smith"],
        year: 2024,
        url: "https://example.com/3",
        sourceApi: "arxiv",
      };

      const key1 = generateCitationKey(paper1, keys);
      keys.add(key1);
      expect(key1).toBe("Smith2024");

      const key2 = generateCitationKey(paper2, keys);
      keys.add(key2);
      expect(key2).toBe("Smith2024a");

      const key3 = generateCitationKey(paper3, keys);
      keys.add(key3);
      expect(key3).toBe("Smith2024b");
    });

    it("generates different keys for different authors in same year", () => {
      const keys = new Set<string>();

      const smith: Citation = {
        paperId: "test.1",
        title: "Smith Paper",
        authors: ["John Smith"],
        year: 2024,
        url: "https://example.com",
        sourceApi: "arxiv",
      };

      const jones: Citation = {
        paperId: "test.2",
        title: "Jones Paper",
        authors: ["Jane Jones"],
        year: 2024,
        url: "https://example.com",
        sourceApi: "arxiv",
      };

      const smithKey = generateCitationKey(smith, keys);
      const jonesKey = generateCitationKey(jones, keys);

      expect(smithKey).toBe("Smith2024");
      expect(jonesKey).toBe("Jones2024");
      expect(smithKey).not.toBe(jonesKey);
    });
  });

  describe("Reference list generation", () => {
    it("generates properly sorted reference list", () => {
      const citations: Citation[] = [
        {
          paperId: "test.1",
          title: "Zebra Paper",
          authors: ["Zebra Z."],
          year: 2024,
          url: "https://example.com/z",
          sourceApi: "arxiv",
        },
        {
          paperId: "test.2",
          title: "Apple Paper",
          authors: ["Apple A."],
          year: 2023,
          url: "https://example.com/a",
          sourceApi: "arxiv",
        },
        {
          paperId: "test.3",
          title: "Banana Paper",
          authors: ["Banana B."],
          year: 2024,
          url: "https://example.com/b",
          sourceApi: "semantic_scholar",
          doi: "10.1234/banana",
        },
      ];

      const result = engine.generateReferenceList(citations, "apa7");
      const lines = result.split("\n\n");

      // Should be sorted alphabetically by first author last name
      expect(lines[0]).toContain("A.");
      expect(lines[1]).toContain("B.");
      expect(lines[2]).toContain("Z.");
    });

    it("handles empty citation list", () => {
      const result = engine.generateReferenceList([], "apa7");
      expect(result).toBe("");
    });

    it("handles single citation", () => {
      const citations: Citation[] = [
        {
          paperId: "test.1",
          title: "Only Paper",
          authors: ["Only One"],
          year: 2024,
          url: "https://example.com",
          sourceApi: "arxiv",
        },
      ];

      const result = engine.generateReferenceList(citations, "apa7");
      expect(result).toContain("One, O. (2024)");
      expect(result.split("\n\n")).toHaveLength(1);
    });
  });
});
