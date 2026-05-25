import type { RankedPaper } from "../types/rankedPaper";

function escapeBibtex(value: string): string {
  return value.replace(/[{}\\]/g, (m) => `\\${m}`);
}

function bibtexKey(paper: RankedPaper, index: number): string {
  const last =
    paper.authors[0]
      ?.split(/\s+/)
      .pop()
      ?.replace(/[^a-zA-Z]/g, "") ?? "unknown";
  const year = paper.year ?? "nd";
  return `${last}${year}_${index}`;
}

export function exportPapersToBibtex(papers: RankedPaper[], filename: string) {
  const entries = papers.map((p, i) => {
    const key = bibtexKey(p, i);
    const authors = p.authors.map((a) => escapeBibtex(a)).join(" and ");
    const lines = [
      `@article{${key},`,
      `  title = {${escapeBibtex(p.title)}},`,
      `  author = {${authors}},`,
      p.year != null ? `  year = {${p.year}},` : null,
      p.doi ? `  doi = {${escapeBibtex(p.doi)}},` : null,
      p.url ? `  url = {${escapeBibtex(p.url)}},` : null,
      p.abstract ? `  abstract = {${escapeBibtex(p.abstract.slice(0, 2000))}},` : null,
      `}`,
    ].filter(Boolean);
    return lines.join("\n");
  });

  downloadText(entries.join("\n\n"), filename, "application/x-bibtex");
}

export function exportPapersToCsv(papers: RankedPaper[], filename: string) {
  const headers = [
    "Title",
    "Authors",
    "Year",
    "Citations",
    "DOI",
    "URL",
    "PDF URL",
    "Source",
    "Abstract",
  ];
  const escape = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const rows = papers.map((p) =>
    [
      p.title,
      p.authors.join("; "),
      p.year != null ? String(p.year) : "",
      p.citationCount != null ? String(p.citationCount) : "",
      p.doi ?? "",
      p.url,
      p.pdfUrl ?? "",
      p.source,
      p.abstract,
    ]
      .map(escape)
      .join(",")
  );

  downloadText([headers.join(","), ...rows].join("\n"), filename, "text/csv;charset=utf-8");
}

/** Excel-compatible CSV with .xlsx extension (no sheetjs dependency). */
export function exportPapersToExcel(papers: RankedPaper[], filename: string) {
  exportPapersToCsv(papers, filename.replace(/\.xlsx$/i, ".csv"));
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
