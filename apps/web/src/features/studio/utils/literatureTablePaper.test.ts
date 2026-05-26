import { describe, expect, it } from "vitest";
import type { TableColumn } from "../components/ColumnManager";
import {
  collectStudyTypeLabels,
  getStudyTypePillStyle,
  inferStudyTypeLabel,
} from "./literatureTablePaper";

const basePaper = {
  citationId: "c1",
  isIncluded: true,
  citation: {
    title: "",
    authors: ["A. Author"],
    url: "https://example.com",
    sourceApi: "pubmed" as const,
    abstract: "",
  },
  rowData: {} as Record<string, string>,
};

describe("collectStudyTypeLabels", () => {
  it("reads study_type system column", () => {
    const columns: TableColumn[] = [
      {
        id: "stype",
        name: "Study Type",
        type: "study_type",
        isVisible: false,
        isSystem: true,
        order: 0,
      },
    ];
    const labels = collectStudyTypeLabels(
      { ...basePaper, rowData: { stype: "Systematic Review" } },
      columns
    );
    expect(labels).toEqual(["Systematic Review"]);
  });

  it("reads custom study design column by name", () => {
    const columns: TableColumn[] = [
      {
        id: "study_design",
        name: "Study design",
        type: "custom",
        isVisible: true,
        isSystem: false,
        order: 1,
      },
    ];
    const labels = collectStudyTypeLabels(
      { ...basePaper, rowData: { study_design: "Literature Review" } },
      columns
    );
    expect(labels).toEqual(["Literature Review"]);
  });

  it("infers empirical study from title when extraction is empty", () => {
    const paper = {
      ...basePaper,
      citation: {
        ...basePaper.citation!,
        title:
          "Auditing frontier general-purpose large language models in biomedical tasks: reasoning gains, extraction limits, and benchmark reliability",
        abstract: "We benchmark multiple LLMs on clinical extraction tasks.",
      },
    };
    expect(collectStudyTypeLabels(paper, [])).toEqual(["Empirical study"]);
  });
});

describe("inferStudyTypeLabel", () => {
  it("does not treat systematic evaluation as systematic review", () => {
    const label = inferStudyTypeLabel({
      ...basePaper,
      citation: {
        ...basePaper.citation!,
        title: "Benchmark^2: Systematic Evaluation of LLM Benchmarks",
        abstract: "We evaluate benchmark quality.",
      },
    });
    expect(label).toBe("Empirical study");
  });
});

describe("getStudyTypePillStyle", () => {
  it("uses neutral muted styling for all study types", () => {
    const systematic = getStudyTypePillStyle("Systematic Review");
    const observational = getStudyTypePillStyle("Observational study");
    expect(systematic.className).toBe(observational.className);
    expect(systematic.className).toContain("text-muted-foreground");
    expect(systematic.className).not.toMatch(/emerald|amber|violet|teal|sky/);
    expect(systematic.iconClassName).toBe("text-muted-foreground");
  });

  it("maps review types to distinct icons", () => {
    expect(getStudyTypePillStyle("Literature Review").icon).toBe("literature");
    expect(getStudyTypePillStyle("Systematic Review").icon).toBe("systematic");
    expect(getStudyTypePillStyle("Empirical study").icon).toBe("empirical");
  });
});
