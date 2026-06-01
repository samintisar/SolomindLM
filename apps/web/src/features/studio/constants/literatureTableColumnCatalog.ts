import type { TableColumn } from "../components/ColumnManager";

/** Optional extraction columns users can add from Manage Columns → Default Columns. */
export const LITERATURE_TABLE_COLUMN_CATALOG: Omit<TableColumn, "isVisible" | "order">[] = [
  {
    id: "insights",
    name: "Insights",
    type: "custom",
    instructions: "Key insights and takeaways",
    isSystem: false,
  },
  {
    id: "tldr",
    name: "TL;DR",
    type: "custom",
    instructions: "One or two sentence summary",
    isSystem: false,
  },
  {
    id: "summary",
    name: "Summary",
    type: "custom",
    instructions: "Structured summary",
    isSystem: false,
  },
  {
    id: "research_question",
    name: "Research Question",
    type: "custom",
    instructions: "Research question addressed",
    isSystem: false,
  },
  {
    id: "methodology",
    name: "Methodology",
    type: "custom",
    instructions: "Methods and evaluation approach",
    isSystem: false,
  },
  {
    id: "key_findings",
    name: "Key Findings",
    type: "custom",
    instructions: "Primary findings",
    isSystem: false,
  },
  {
    id: "primary_outcomes",
    name: "Primary Outcomes",
    type: "custom",
    instructions: "Primary outcomes measured",
    isSystem: false,
  },
  {
    id: "limitations",
    name: "Limitations",
    type: "custom",
    instructions: "Stated limitations",
    isSystem: false,
  },
  {
    id: "interventions",
    name: "Interventions",
    type: "custom",
    instructions: "Interventions studied",
    isSystem: false,
  },
  {
    id: "conclusion",
    name: "Conclusion",
    type: "custom",
    instructions: "Authors' conclusions",
    isSystem: false,
  },
  {
    id: "research_gaps",
    name: "Research Gaps",
    type: "custom",
    instructions: "Identified research gaps",
    isSystem: false,
  },
  {
    id: "funding_source",
    name: "Funding Source",
    type: "custom",
    instructions: "Funding sources",
    isSystem: false,
  },
  {
    id: "introduction_summary",
    name: "Introduction Summary",
    type: "custom",
    instructions: "Introduction summary",
    isSystem: false,
  },
  {
    id: "discussion_summary",
    name: "Discussion Summary",
    type: "custom",
    instructions: "Discussion summary",
    isSystem: false,
  },
  {
    id: "hypotheses_tested",
    name: "Hypotheses Tested",
    type: "custom",
    instructions: "Hypotheses tested",
    isSystem: false,
  },
  {
    id: "future_research",
    name: "Future Research",
    type: "custom",
    instructions: "Future research directions",
    isSystem: false,
  },
  {
    id: "dependent_variables",
    name: "Dependent Variables",
    type: "custom",
    instructions: "Dependent variables",
    isSystem: false,
  },
  {
    id: "independent_variables",
    name: "Independent Variables",
    type: "custom",
    instructions: "Independent variables",
    isSystem: false,
  },
  {
    id: "study_design_col",
    name: "Study design",
    type: "custom",
    instructions: "Study design",
    isSystem: false,
  },
  {
    id: "objectives",
    name: "Objectives",
    type: "custom",
    instructions: "Study objectives",
    isSystem: false,
  },
  {
    id: "sample_size",
    name: "Sample Size",
    type: "custom",
    instructions: "Sample size",
    isSystem: false,
  },
  {
    id: "notable_results",
    name: "Notable Results & Trends",
    type: "custom",
    instructions: "Notable results and trends",
    isSystem: false,
  },
  {
    id: "real_world_metric",
    name: "Real-World Performance Metric",
    type: "custom",
    instructions: "Real-world metrics",
    isSystem: false,
  },
  {
    id: "domain",
    name: "Application Domain",
    type: "custom",
    instructions: "Application domain",
    isSystem: false,
  },
];

export function catalogColumnInTable(
  catalogId: string,
  columns: TableColumn[]
): TableColumn | undefined {
  const catalogEntry = LITERATURE_TABLE_COLUMN_CATALOG.find((c) => c.id === catalogId);
  const catalogName = catalogEntry?.name.toLowerCase();
  return columns.find(
    (c) => c.id === catalogId || (catalogName && c.name.toLowerCase() === catalogName)
  );
}
