import { describe, expect, it } from "vitest";
import {
  buildPrismaMethodsBlock,
  buildStudyCharacteristicsTable,
  findUnknownCitationKeys,
  mergeDeterministicReportSections,
  needsDeterministicReportMerge,
  validateAndSanitizeReportSections,
} from "./reportContext";

describe("reportContext", () => {
  it("findUnknownCitationKeys flags keys not in allowlist", () => {
    const allowed = new Set(["Kim2026", "Smith2024"]);
    const text = "Gap noted [Kim2026] and typo [im, 2026] vs [Unknown2020].";
    const unknown = findUnknownCitationKeys(text, allowed);
    expect(unknown).toContain("im, 2026");
    expect(unknown).toContain("Unknown2020");
    expect(unknown).not.toContain("Kim2026");
  });

  it("validateAndSanitizeReportSections strips unknown citations", () => {
    const allowed = new Set(["Kim2026"]);
    const { sections, unknownCitations } = validateAndSanitizeReportSections(
      [{ heading: "Results", content: "Finding [Kim2026] and [bad]." }],
      allowed,
      new Set(["0.6"])
    );
    expect(unknownCitations).toEqual(["bad"]);
    expect(sections[0].content).not.toContain("[bad]");
    expect(sections[0].content).toContain("[Kim2026]");
  });

  it("buildPrismaMethodsBlock uses provenance counts", () => {
    const block = buildPrismaMethodsBlock({
      searchQueries: ["LLM benchmark reliability"],
      databasesUsed: ["arxiv", "semantic_scholar"],
      recordsIdentified: 112,
      recordsAfterDedupe: 80,
      recordsScreened: 30,
      recordsIncluded: 21,
      recordsExcluded: 9,
    });
    expect(block).toContain("112");
    expect(block).toContain("21");
    expect(block).toContain("LLM benchmark reliability");
  });

  it("mergeDeterministicReportSections prepends PRISMA methods and study table", () => {
    const merged = mergeDeterministicReportSections(
      [
        { heading: "Abstract", content: "Summary." },
        { heading: "Results", content: "Themes here." },
      ],
      {
        methodsBlock: "### Search Strategy\n\nQueries listed.",
        studyTable: "| Study | Year |\n| --- | --- |",
      }
    );
    expect(merged[0].heading).toBe("Abstract");
    expect(merged.find((s) => s.heading === "Methods")?.content).toContain("Search Strategy");
    expect(merged.find((s) => s.heading === "Results")?.content).toContain(
      "Characteristics of Included Studies"
    );
  });

  it("needsDeterministicReportMerge detects unmerged LLM sections", () => {
    expect(
      needsDeterministicReportMerge([{ heading: "Results", content: "Themes only." }])
    ).toBe(true);
    expect(
      needsDeterministicReportMerge([
        {
          heading: "Results",
          content: "### Characteristics of Included Studies\n\n| Study |",
        },
      ])
    ).toBe(false);
  });

  it("buildStudyCharacteristicsTable renders rows", () => {
    const table = buildStudyCharacteristicsTable(
      [
        {
          citationKey: "Kim2026",
          title: "Benchmark saturation",
          authors: "Kim, J.",
          year: "2026",
          rowData: { domain: "medicine" },
        },
      ],
      ["domain"]
    );
    expect(table).toContain("Kim2026");
    expect(table).toContain("medicine");
  });

});
