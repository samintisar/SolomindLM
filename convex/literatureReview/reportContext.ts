import type { Id } from "../_generated/dataModel";
import type { LiteratureReviewWorkflowProvenance } from "./workflowProvenance.js";

export type ReportCitationEntry = {
  citationId: Id<"citations">;
  key: string;
  title: string;
  authors: string[];
  year?: number;
};

export type ReportPaperRow = {
  citationKey: string;
  title: string;
  authors: string;
  year: string;
  rowData: Record<string, string>;
};

export type LiteratureReportContext = {
  query: string;
  reviewTitle?: string;
  provenance: LiteratureReviewWorkflowProvenance;
  citations: ReportCitationEntry[];
  papers: ReportPaperRow[];
  columnNames: string[];
  allowedCitationKeys: Set<string>;
  groundedNumericTokens: Set<string>;
};

/** Extract numeric tokens (%, r=, F1, decimals) for grounding checks. */
export function extractNumericTokens(text: string): string[] {
  const tokens = new Set<string>();
  const patterns = [
    /\b\d+(?:\.\d+)?\s*%/g,
    /\br\s*[=≈]\s*0?\.\d+/gi,
    /\bF1\s*[=:]\s*0?\.\d+/gi,
    /\b0?\.\d{2,4}\b/g,
    /\b\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*%/g,
    /\b\d{1,4}\b/g,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        tokens.add(m.replace(/\s+/g, " ").trim().toLowerCase());
      }
    }
  }
  return [...tokens];
}

export function buildGroundedNumericSet(
  provenance: LiteratureReviewWorkflowProvenance,
  papers: ReportPaperRow[]
): Set<string> {
  const parts: string[] = [];
  if (provenance.recordsIdentified != null) parts.push(String(provenance.recordsIdentified));
  if (provenance.recordsAfterDedupe != null) parts.push(String(provenance.recordsAfterDedupe));
  if (provenance.recordsScreened != null) parts.push(String(provenance.recordsScreened));
  if (provenance.recordsIncluded != null) parts.push(String(provenance.recordsIncluded));
  if (provenance.recordsExcluded != null) parts.push(String(provenance.recordsExcluded));
  if (provenance.extractedRowCount != null) parts.push(String(provenance.extractedRowCount));

  for (const paper of papers) {
    for (const value of Object.values(paper.rowData)) {
      parts.push(value);
    }
  }

  const tokens = new Set<string>();
  for (const part of parts) {
    for (const t of extractNumericTokens(part)) {
      tokens.add(t);
    }
  }
  return tokens;
}

export function buildPrismaMethodsBlock(provenance: LiteratureReviewWorkflowProvenance): string {
  const queries = provenance.searchQueries ?? [];
  const databases = provenance.databasesUsed?.join(", ") ?? "academic search APIs";
  const identified = provenance.recordsIdentified ?? "not recorded";
  const deduped = provenance.recordsAfterDedupe ?? identified;
  const screened = provenance.recordsScreened ?? "not recorded";
  const included = provenance.recordsIncluded ?? "not recorded";
  const excluded = provenance.recordsExcluded ?? "not recorded";

  const queryList =
    queries.length > 0
      ? queries.map((q, i) => `${i + 1}. \`${q}\``).join("\n")
      : "_No search queries were logged._";

  return `### Search Strategy

We searched ${databases} using ${queries.length || "multiple"} structured queries:

${queryList}

### Study Selection

PRISMA-style flow (counts from this review run):

| Stage | Count |
|-------|------:|
| Records identified | ${identified} |
| After deduplication | ${deduped} |
| Records screened | ${screened} |
| Records excluded | ${excluded} |
| Studies included | ${included} |

### Data Extraction

Data were extracted into a structured evidence table using question-specific columns. Extracted fields were used for narrative synthesis; numeric claims in this report are limited to values present in extracted cells or the counts above.`;
}

export function buildStudyCharacteristicsTable(
  papers: ReportPaperRow[],
  columnNames: string[]
): string {
  if (papers.length === 0) {
    return "_No included studies._";
  }

  const displayCols = columnNames.filter(
    (n) => !["title", "authors", "year", "summary"].includes(n.toLowerCase())
  );
  const headers = ["Study", "Year", ...displayCols.slice(0, 4)];

  const rows = papers.map((p) => {
    const authorLabel = p.authors.split(",")[0]?.trim() ?? "Unknown";
    const studyCell = `${authorLabel} et al. [${p.citationKey}]`;
    const cells = [
      studyCell,
      p.year || "N/A",
      ...displayCols.slice(0, 4).map((col) => {
        const key = Object.keys(p.rowData).find(
          (k) => k.toLowerCase() === col.toLowerCase().replace(/\s+/g, "_")
        );
        const val =
          p.rowData[col] ??
          p.rowData[col.toLowerCase().replace(/\s+/g, "_")] ??
          (key ? p.rowData[key] : "");
        const trimmed = (val ?? "").slice(0, 120);
        return trimmed || "—";
      }),
    ];
    return `| ${cells.join(" | ")} |`;
  });

  return `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.join("\n")}`;
}

const DETERMINISTIC_RESULTS_MARKER = "Characteristics of Included Studies";

/** True when LLM sections have not yet been merged with PRISMA methods / study table. */
export function needsDeterministicReportMerge(
  sections: Array<{ heading: string; content: string }>
): boolean {
  const results = sections.find((s) => s.heading.trim().toLowerCase() === "results");
  return !results?.content.includes(DETERMINISTIC_RESULTS_MARKER);
}

const CITATION_KEY_PATTERN = /\[([^\]]+)\]/g;

export function findUnknownCitationKeys(
  content: string,
  allowedKeys: Set<string>
): string[] {
  const unknown: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(CITATION_KEY_PATTERN.source, "g");
  while ((match = re.exec(content)) !== null) {
    const key = match[1].trim();
    if (!key) continue;
    if (/^\d+$/.test(key)) continue;
    if (key.toLowerCase() === "not quantified") continue;
    if (!allowedKeys.has(key)) {
      unknown.push(key);
    }
  }
  return [...new Set(unknown)];
}

export function stripUnknownCitationMarkers(content: string, unknownKeys: string[]): string {
  let out = content;
  for (const key of unknownKeys) {
    out = out.replace(new RegExp(`\\[${escapeRegex(key)}\\]`, "g"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findUngroundedNumericClaims(
  content: string,
  grounded: Set<string>
): string[] {
  const claims = extractNumericTokens(content);
  const ungrounded: string[] = [];
  for (const claim of claims) {
    if (claim.length < 2) continue;
    let found = grounded.has(claim);
    if (!found) {
      for (const g of grounded) {
        if (g.includes(claim) || claim.includes(g)) {
          found = true;
          break;
        }
      }
    }
    if (!found && /\d/.test(claim)) {
      ungrounded.push(claim);
    }
  }
  return [...new Set(ungrounded)].slice(0, 20);
}

export function validateAndSanitizeReportSections(
  sections: Array<{ heading: string; content: string }>,
  allowedKeys: Set<string>,
  grounded: Set<string>
): {
  sections: Array<{ heading: string; content: string }>;
  unknownCitations: string[];
  ungroundedNumerics: string[];
} {
  const allUnknown: string[] = [];
  const allUngrounded: string[] = [];
  const sanitized = sections.map((section) => {
    const unknown = findUnknownCitationKeys(section.content, allowedKeys);
    allUnknown.push(...unknown);
    const ungrounded = findUngroundedNumericClaims(section.content, grounded);
    allUngrounded.push(...ungrounded);
    let content = section.content;
    if (unknown.length > 0) {
      content = stripUnknownCitationMarkers(content, unknown);
    }
    return { ...section, content };
  });
  return {
    sections: sanitized,
    unknownCitations: [...new Set(allUnknown)],
    ungroundedNumerics: [...new Set(allUngrounded)],
  };
}

export function mergeDeterministicReportSections(
  llmSections: Array<{ heading: string; content: string }>,
  deterministic: {
    methodsBlock: string;
    studyTable: string;
  }
): Array<{ heading: string; content: string }> {
  const byHeading = new Map(
    llmSections.map((s) => [s.heading.trim().toLowerCase(), s.content])
  );

  const methodsNarrative = byHeading.get("methods") ?? "";
  const methodsContent = `${deterministic.methodsBlock}\n\n${methodsNarrative}`.trim();

  const resultsNarrative = byHeading.get("results") ?? "";
  const resultsContent = `### Characteristics of Included Studies

${deterministic.studyTable}

### Thematic Findings

${resultsNarrative}

_Ensure subsections above include a **Summary of Evidence** table when synthesizing themes._`;

  const out: Array<{ heading: string; content: string }> = [];

  for (const name of [
    "Abstract",
    "Introduction",
    "Methods",
    "Results",
    "Discussion",
    "Conclusion",
  ]) {
    const key = name.toLowerCase();
    if (key === "methods") {
      out.push({ heading: "Methods", content: methodsContent });
    } else if (key === "results") {
      out.push({ heading: "Results", content: resultsContent });
    } else {
      const content = byHeading.get(key) ?? `[${name} not generated]`;
      out.push({ heading: name, content });
    }
  }

  return out;
}
