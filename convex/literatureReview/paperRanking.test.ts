import { describe, expect, it } from "vitest";
import {
  CITATION_WEIGHT,
  citationImpact,
  RELEVANCE_WEIGHT,
  rankByRelevanceAndInfluence,
} from "./paperRanking";

const CURRENT_YEAR = 2026;

function paper(title: string, citationCount?: number, year?: number) {
  return { title, citationCount, year, score: 0 };
}

describe("citationImpact", () => {
  it("is log1p of citations per year since publication", () => {
    // Published this year: one year of exposure.
    expect(citationImpact(9, 2026, CURRENT_YEAR)).toBeCloseTo(Math.log1p(9));
    // Four years of exposure (2023..2026).
    expect(citationImpact(400, 2023, CURRENT_YEAR)).toBeCloseTo(Math.log1p(100));
  });

  it("rates a young paper with fewer citations above an old paper with more", () => {
    const young = citationImpact(50, 2025, CURRENT_YEAR) ?? 0;
    const old = citationImpact(100, 2016, CURRENT_YEAR) ?? 0;
    expect(young).toBeGreaterThan(old);
  });

  it("is undefined when the citation count is unknown", () => {
    expect(citationImpact(undefined, 2020, CURRENT_YEAR)).toBeUndefined();
  });

  it("is zero for an uncited paper", () => {
    expect(citationImpact(0, 2026, CURRENT_YEAR)).toBe(0);
  });

  it("does not divide by zero for a paper dated in the future or without a year", () => {
    expect(citationImpact(10, 2030, CURRENT_YEAR)).toBeCloseTo(Math.log1p(10));
    expect(Number.isFinite(citationImpact(10, undefined, CURRENT_YEAR))).toBe(true);
  });
});

describe("rankByRelevanceAndInfluence", () => {
  it("weights relevance above influence", () => {
    expect(RELEVANCE_WEIGHT).toBeGreaterThan(CITATION_WEIGHT);
    expect(RELEVANCE_WEIGHT + CITATION_WEIGHT).toBeCloseTo(1);
  });

  it("ranks a widely cited paper above a slightly more relevant uncited one", () => {
    const papers = [
      paper("Recent uncited workshop paper", 0, 2026),
      paper("Recent paper with a few citations", 14, 2025),
      paper("Widely cited foundational paper", 2700, 2023),
      paper("Loosely related paper", 3, 2024),
    ];
    const relevance = [0.82, 0.8, 0.76, 0.4];

    const ranked = rankByRelevanceAndInfluence(papers, relevance, CURRENT_YEAR);

    expect(ranked[0].title).toBe("Widely cited foundational paper");
  });

  it("lets citations decide when relevance scores sit in a narrow band", () => {
    const papers = [
      paper("Slightly more relevant, uncited", 0, 2025),
      paper("Slightly less relevant, widely cited", 500, 2022),
    ];

    const ranked = rankByRelevanceAndInfluence(papers, [0.84, 0.78], CURRENT_YEAR);

    expect(ranked[0].title).toBe("Slightly less relevant, widely cited");
  });

  it("keeps an off-topic highly cited paper below relevant ones", () => {
    const papers = [
      paper("Relevant uncited paper", 0, 2026),
      paper("Off-topic landmark paper", 50_000, 2017),
    ];
    const relevance = [0.85, 0.1];

    const ranked = rankByRelevanceAndInfluence(papers, relevance, CURRENT_YEAR);

    expect(ranked.map((p) => p.title)).toEqual([
      "Relevant uncited paper",
      "Off-topic landmark paper",
    ]);
  });

  it("gives a paper with an unknown citation count the pool's median influence", () => {
    const papers = [
      paper("Low influence", 0, 2024),
      paper("Unknown influence"),
      paper("High influence", 1000, 2024),
      paper("Mid influence", 30, 2024),
    ];
    // Same relevance for all, so influence alone orders them.
    const ranked = rankByRelevanceAndInfluence(papers, [0.5, 0.5, 0.5, 0.5], CURRENT_YEAR);
    const titles = ranked.map((p) => p.title);

    expect(titles[0]).toBe("High influence");
    expect(titles.at(-1)).toBe("Low influence");
    expect(titles.indexOf("Unknown influence")).toBeLessThan(titles.indexOf("Low influence"));
  });

  it("treats a paper without a relevance score as least relevant", () => {
    const papers = [paper("Not scored", 10, 2024), paper("Scored", 10, 2024)];

    const ranked = rankByRelevanceAndInfluence(papers, [undefined, 0.3], CURRENT_YEAR);

    expect(ranked[0].title).toBe("Scored");
  });

  it("keeps a highly cited paper without a relevance score below scored papers", () => {
    const papers = [paper("Not scored, landmark", 50_000, 2017), paper("Scored, uncited", 0, 2026)];

    const ranked = rankByRelevanceAndInfluence(papers, [undefined, 0.05], CURRENT_YEAR);

    expect(ranked.map((p) => p.title)).toEqual(["Scored, uncited", "Not scored, landmark"]);
  });

  it("writes the blended score, between 0 and 1, onto each paper", () => {
    const papers = [paper("A", 5, 2024), paper("B", 500, 2020), paper("C")];

    const ranked = rankByRelevanceAndInfluence(papers, [0.9, 0.2, 0.5], CURRENT_YEAR);

    for (const p of ranked) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(1);
    }
    expect(ranked.map((p) => p.score)).toEqual(
      [...ranked.map((p) => p.score)].sort((a, b) => b - a)
    );
  });

  it("keeps the input order for ties", () => {
    const papers = [paper("First"), paper("Second"), paper("Third")];

    const ranked = rankByRelevanceAndInfluence(papers, [0.5, 0.5, 0.5], CURRENT_YEAR);

    expect(ranked.map((p) => p.title)).toEqual(["First", "Second", "Third"]);
  });

  it("returns an empty list for no papers", () => {
    expect(rankByRelevanceAndInfluence([], [], CURRENT_YEAR)).toEqual([]);
  });
});
