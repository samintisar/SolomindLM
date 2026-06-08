import type { Doc, Id } from "../../_generated/dataModel";

const SYSTEM_COLUMN_TYPES = new Set(["paper_title", "authors", "year", "study_type"]);

type LiteratureTableColumn = Doc<"literatureTables">["columns"][number];
type LiteratureTablePaper = Doc<"literatureTables">["papers"][number];

function isDataColumn(col: LiteratureTableColumn): boolean {
  return col.isVisible && !SYSTEM_COLUMN_TYPES.has(col.type);
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getPaperTitle(
  paper: LiteratureTablePaper,
  columns: LiteratureTableColumn[],
  citationTitle?: string
): string {
  if (citationTitle?.trim()) return citationTitle;
  const titleCol = columns.find((col) => col.type === "paper_title");
  if (titleCol && paper.rowData[titleCol.id]) return paper.rowData[titleCol.id];
  return "Untitled Paper";
}

export function literatureTableToCsv(
  columns: LiteratureTableColumn[],
  papers: LiteratureTablePaper[],
  citationTitles: Map<Id<"citations">, string>
): string {
  const dataColumns = columns.filter(isDataColumn).toSorted((a, b) => a.order - b.order);
  const headers = ["Paper", ...dataColumns.map((col) => col.name)];

  const rows = papers
    .filter((paper) => paper.isIncluded)
    .map((paper) => {
      const title = getPaperTitle(paper, columns, citationTitles.get(paper.citationId));
      const values = dataColumns.map((col) => paper.rowData[col.id] || "");
      return [title, ...values];
    });

  return [headers.map(escapeCSV).join(","), ...rows.map((row) => row.map(escapeCSV).join(","))].join(
    "\n"
  );
}
