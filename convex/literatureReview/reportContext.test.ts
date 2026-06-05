import { describe, expect, it } from "vitest";
import {
  alignExtractedDataToColumns,
  buildPrismaMethodsBlock,
  buildStudyCharacteristicsTable,
  columnsForExtraction,
  findUnknownCitationKeys,
  fullReportHasOnlyTrivialContent,
  getReportSectionsNeedingRegeneration,
  isTrivialReportSectionContent,
  mergeDeterministicReportSections,
  needsDeterministicReportMerge,
  normalizeLiteratureReportSectionContent,
  resolveStudyTableCellValue,
  stripLeadingSectionHeadingLine,
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

  it("stripUnknownCitationMarkers preserves markdown newlines", () => {
    const content = "Line one.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    const { sections } = validateAndSanitizeReportSections(
      [{ heading: "Results", content: "Finding [Kim2026] and [bad].\n\n" + content }],
      new Set(["Kim2026"]),
      new Set()
    );
    expect(sections[0].content).toContain("\n| A | B |");
    expect(sections[0].content).not.toMatch(/Line one\. \| A/);
  });

  it("stripLeadingSectionHeadingLine removes leading # / ## duplicate titles", () => {
    expect(stripLeadingSectionHeadingLine("## Abstract\n\nBody text.", "Abstract")).toBe(
      "Body text."
    );
    expect(stripLeadingSectionHeadingLine("# Introduction\n\nBody.", "Introduction")).toBe("Body.");
    expect(stripLeadingSectionHeadingLine("### Overview\n\nBody.", "Results")).toBe(
      "### Overview\n\nBody."
    );
  });

  it("validateAndSanitizeReportSections strips duplicate ## heading", () => {
    const { sections } = validateAndSanitizeReportSections(
      [{ heading: "Abstract", content: "## Abstract\n\nFindings here." }],
      new Set(),
      new Set()
    );
    expect(sections[0].content).toBe("Findings here.");
  });

  it("normalizeLiteratureReportSectionContent fixes inline headings and duplicate titles", () => {
    const fixed = normalizeLiteratureReportSectionContent(
      "Results ### Overview\n\nMore text. End. ### Next",
      "Results"
    );
    expect(fixed).not.toMatch(/^Results\s+###/);
    expect(fixed).toContain("### Overview");
    expect(fixed).toContain("\n\n### Next");
  });

  it("normalizeLiteratureReportSectionContent splits ||| table rows", () => {
    const fixed = normalizeLiteratureReportSectionContent("| a | b ||| | c | d |");
    expect(fixed).toContain("\n| c | d |");
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
    expect(needsDeterministicReportMerge([{ heading: "Results", content: "Themes only." }])).toBe(
      true
    );
    expect(
      needsDeterministicReportMerge([
        {
          heading: "Results",
          content: "### Characteristics of Included Studies\n\n| Study |",
        },
      ])
    ).toBe(false);
  });

  it("alignExtractedDataToColumns maps display-name keys to column ids", () => {
    const aligned = alignExtractedDataToColumns(
      {
        "Framework Name": "Transformer-based RAG",
        performance_metrics: "F1 0.82 on benchmark X",
      },
      [
        { id: "framework_name", name: "Framework Name" },
        { id: "performance_metrics", name: "Performance Metrics" },
      ]
    );
    expect(aligned.framework_name).toBe("Transformer-based RAG");
    expect(aligned.performance_metrics).toBe("F1 0.82 on benchmark X");
  });

  it("alignExtractedDataToColumns prefers column id when id and display name conflict", () => {
    const aligned = alignExtractedDataToColumns(
      {
        framework_name: "Id-key value",
        "Framework Name": "Display-name value",
      },
      [{ id: "framework_name", name: "Framework Name" }]
    );
    expect(aligned.framework_name).toBe("Id-key value");
  });

  it("alignExtractedDataToColumns drops empty and N/A values", () => {
    const aligned = alignExtractedDataToColumns(
      {
        framework_name: "N/A",
        performance_metrics: "   ",
        sample_size: "N = 120",
      },
      [
        { id: "framework_name", name: "Framework Name" },
        { id: "performance_metrics", name: "Performance Metrics" },
        { id: "sample_size", name: "Sample Size" },
      ]
    );
    expect(aligned.framework_name).toBeUndefined();
    expect(aligned.performance_metrics).toBeUndefined();
    expect(aligned.sample_size).toBe("N = 120");
  });

  it("alignExtractedDataToColumns skips ambiguous compact-key collisions", () => {
    const aligned = alignExtractedDataToColumns(
      {
        sample_size: "From underscore key",
        "sample size": "From spaced key",
      },
      [{ id: "samplesize", name: "Size" }]
    );
    expect(aligned.samplesize).toBeUndefined();
  });

  it("columnsForExtraction returns only non-metadata columns", () => {
    const columns = [
      { id: "title", name: "Title" },
      { id: "authors", name: "Authors" },
      { id: "framework_name", name: "Framework Name" },
    ];
    expect(columnsForExtraction(columns)).toEqual([
      { id: "framework_name", name: "Framework Name" },
    ]);
  });

  it("columnsForExtraction returns empty when only metadata columns exist", () => {
    expect(
      columnsForExtraction([
        { id: "title", name: "Title" },
        { id: "year", name: "Year" },
      ])
    ).toEqual([]);
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
      [{ id: "domain", name: "Domain" }]
    );
    expect(table).toContain("Kim2026");
    expect(table).toContain("medicine");
  });

  it("buildStudyCharacteristicsTable resolves cells by column id when name differs", () => {
    const table = buildStudyCharacteristicsTable(
      [
        {
          citationKey: "Liu2026",
          title: "Example",
          authors: "Liu, D.",
          year: "2026",
          rowData: { framework_name: "Multi-agent orchestration" },
        },
      ],
      [{ id: "framework_name", name: "Framework Name" }]
    );
    expect(table).toContain("Framework Name");
    expect(table).toContain("Multi-agent orchestration");
  });

  it("resolveStudyTableCellValue backfills Paper Title & Year from metadata", () => {
    const val = resolveStudyTableCellValue(
      {
        citationKey: "Gao2023",
        title: "Retrieval-Augmented Generation for LLMs",
        authors: "Y. Gao",
        year: "2023",
        rowData: { retrieval_approach: "dense" },
      },
      "Paper Title & Year"
    );
    expect(val).toBe("Retrieval-Augmented Generation for LLMs (2023)");
  });

  it("resolveStudyTableCellValue does not use paper title for unrelated columns", () => {
    const val = resolveStudyTableCellValue(
      {
        citationKey: "Gao2023",
        title: "Retrieval-Augmented Generation for LLMs",
        authors: "Y. Gao",
        year: "2023",
        rowData: { title: "Wrong title cell", retrieval_approach: "dense" },
      },
      "retrieval_approach"
    );
    expect(val).toBe("dense");
  });

  it("resolveStudyTableCellValue leaves unrelated columns blank when missing", () => {
    const val = resolveStudyTableCellValue(
      {
        citationKey: "Gao2023",
        title: "Retrieval-Augmented Generation for LLMs",
        authors: "Y. Gao",
        year: "2023",
        rowData: { title: "Wrong title cell" },
      },
      "methodology"
    );
    expect(val).toBe("");
  });

  it("isTrivialReportSectionContent detects JSON example placeholders", () => {
    expect(isTrivialReportSectionContent("...")).toBe(true);
    expect(isTrivialReportSectionContent("Abstract content here", "Abstract")).toBe(true);
    expect(isTrivialReportSectionContent("Results content here", "Results")).toBe(true);
    expect(
      isTrivialReportSectionContent(
        "A substantive abstract with enough words to summarize the review purpose, methods, synthesized findings across thirty included studies on retrieval-augmented generation for question answering, and conclusions about hybrid retrieval and evaluation gaps [Gao2023].",
        "Abstract"
      )
    ).toBe(false);
  });

  it("fullReportHasOnlyTrivialContent triggers when majority are placeholders", () => {
    const substantive =
      "Retrieval-augmented generation for question answering integrates external corpora with large language models across thirty included studies from 2022 to 2025, comparing dense, sparse, and hybrid retrieval, graph-augmented variants, and evaluation benchmarks such as RAGAS and human judgments [Gao2023]. Findings highlight trade-offs between long-context models and retrieval, domain deployments in medicine and manufacturing, and gaps in standardized multi-hop QA evaluation.";
    expect(
      fullReportHasOnlyTrivialContent([
        { heading: "Abstract", content: "..." },
        { heading: "Introduction", content: "..." },
        { heading: "Methods", content: "..." },
        { heading: "Results", content: "..." },
      ])
    ).toBe(true);
    expect(
      fullReportHasOnlyTrivialContent([
        { heading: "Abstract", content: substantive },
        { heading: "Introduction", content: substantive },
        { heading: "Methods", content: "..." },
      ])
    ).toBe(false);
  });

  it("getReportSectionsNeedingRegeneration lists only trivial headings", () => {
    const substantive =
      "Retrieval-augmented generation for question answering integrates external corpora with large language models across thirty included studies from 2022 to 2025, comparing dense, sparse, and hybrid retrieval, graph-augmented variants, and evaluation benchmarks such as RAGAS and human judgments [Gao2023]. Findings highlight trade-offs between long-context models and retrieval, domain deployments in medicine and manufacturing, and gaps in standardized multi-hop QA evaluation.";
    expect(
      getReportSectionsNeedingRegeneration(
        [
          { heading: "Abstract", content: substantive },
          { heading: "Introduction", content: "Introduction content here" },
        ],
        ["Abstract", "Introduction", "Methods"]
      )
    ).toEqual(["Introduction", "Methods"]);
  });
});
