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

/** True when a column id/name refers to bibliographic title (not generic "title" row key). */
export function isTitleLikeColumnName(columnLabel: string): boolean {
  const id = columnLabel.toLowerCase().replace(/\s+/g, "_");
  const name = columnLabel.toLowerCase();
  return (
    id === "title" ||
    id.includes("paper_title") ||
    name.includes("paper title") ||
    (name.includes("title") && name.includes("year"))
  );
}

export function formatPaperTitleYear(title: string, year: string): string {
  const t = title.trim();
  if (!t) return "";
  const y = year.trim();
  return y ? `${t} (${y})` : t;
}

/** Resolve an extraction cell for display, including metadata fallbacks. */
export function resolveStudyTableCellValue(paper: ReportPaperRow, columnLabel: string): string {
  const normalized = columnLabel.toLowerCase().replace(/\s+/g, "_");
  const direct = paper.rowData[columnLabel] ?? paper.rowData[normalized];
  if (direct?.trim() && direct.trim() !== "N/A") {
    return direct.trim();
  }

  const fuzzyKey = Object.keys(paper.rowData).find((k) => {
    const kn = k.toLowerCase();
    return kn === normalized || kn.replace(/_/g, "") === normalized.replace(/_/g, "");
  });
  const fuzzy = fuzzyKey ? paper.rowData[fuzzyKey] : "";
  if (fuzzy?.trim() && fuzzy.trim() !== "N/A") {
    return fuzzy.trim();
  }

  if (isTitleLikeColumnName(columnLabel) && paper.title.trim()) {
    return formatPaperTitleYear(paper.title, paper.year);
  }

  return "";
}

/** Minimum word counts for narrative sections (full-report single-call mode). */
export const REPORT_SECTION_MIN_WORDS: Record<string, number> = {
  abstract: 100,
  introduction: 150,
  methods: 50,
  results: 120,
  discussion: 150,
  conclusion: 80,
};

function reportSectionWordCount(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

/** LLM copied JSON examples or stub phrases instead of writing prose. */
export function isTrivialReportSectionContent(content: string, heading?: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();

  if (lower === "..." || lower === "…" || lower === "n/a" || lower === "na") {
    return true;
  }
  if (trimmed.length < 40 && /^\.+$/.test(trimmed)) return true;
  if (/^<[^>]{1,200}>$/i.test(trimmed)) return true;
  if (/content here\.?$/i.test(lower)) return true;
  if (/^(tbd|todo|placeholder|pending|fill in)\.?$/i.test(lower)) return true;
  if (/^[\w\s]{2,40}\s+content\s+here\.?$/i.test(trimmed)) return true;

  if (heading) {
    const key = heading.trim().toLowerCase();
    if (lower === `${key} content here` || lower === `${key} content here.`) {
      return true;
    }
    const minWords = REPORT_SECTION_MIN_WORDS[key];
    if (minWords !== undefined && reportSectionWordCount(trimmed) < minWords) {
      const hasCitation = /\[[A-Za-z][\w,.-\s]{0,50}\d{2,4}\]/.test(trimmed);
      const hasStructure = /^#{1,3}\s/m.test(trimmed) || trimmed.length >= 500;
      if (!hasCitation && !hasStructure) {
        return true;
      }
    }
  }

  return false;
}

/** Section headings that still need per-section LLM generation. */
export function getReportSectionsNeedingRegeneration(
  sections: Array<{ heading: string; content: string }>,
  requiredHeadings: string[]
): string[] {
  const byHeading = new Map(
    sections.map((s) => [s.heading.trim().toLowerCase(), s.content] as const)
  );
  return requiredHeadings.filter((name) => {
    const content = byHeading.get(name.toLowerCase()) ?? "";
    return isTrivialReportSectionContent(content, name);
  });
}

/** @deprecated Use getReportSectionsNeedingRegeneration — kept for tests. */
export function fullReportHasOnlyTrivialContent(
  sections: Array<{ heading: string; content: string }>
): boolean {
  const headings = sections.map((s) => s.heading);
  return (
    getReportSectionsNeedingRegeneration(sections, headings).length >=
    Math.ceil(headings.length / 2)
  );
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
        const val = resolveStudyTableCellValue(p, col);
        const trimmed = val.slice(0, 120);
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

export function findUnknownCitationKeys(content: string, allowedKeys: Set<string>): string[] {
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
  // Collapse extra spaces per line only — preserve newlines (tables, ### headings).
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Removes a leading `#` / `##` line when it repeats the structured section heading
 * (the UI renders `section.heading` separately).
 */
export function stripLeadingSectionHeadingLine(content: string, heading: string): string {
  const h = escapeRegex(heading.trim());
  if (!h) return content;
  let out = content.trim();
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(new RegExp(`^#{1,2}\\s*${h}\\s*:?\\s*\\n+`, "i"), "").trim();
  }
  return out;
}

/**
 * Fixes common LLM markdown issues before render/export: duplicate section titles,
 * inline ### headings, and row separators like |||.
 */
export function normalizeLiteratureReportSectionContent(
  content: string,
  sectionHeading?: string
): string {
  let out = content.trim();
  if (sectionHeading?.trim()) {
    out = stripLeadingSectionHeadingVariants(out, sectionHeading.trim());
  }
  return ensureMarkdownBlockBoundaries(out);
}

/** Bold/plain title lines and "Results ### …" echoes not covered by ATX strip. */
function stripLeadingSectionHeadingVariants(content: string, heading: string): string {
  const h = escapeRegex(heading);
  let out = content;
  out = out.replace(new RegExp(`^\\*\\*${h}\\*\\*\\s*\\n+`, "i"), "");
  out = out.replace(new RegExp(`^${h}\\s*\\n+`, "i"), "");
  out = out.replace(new RegExp(`^${h}\\s+(#{1,6}\\s+)`, "i"), "$1");
  return out.trim();
}

function ensureMarkdownBlockBoundaries(content: string): string {
  let out = content;
  // ### mid-paragraph → own line (requires blank line before for most parsers)
  out = out.replace(/([^\n#])\s+(#{1,6}\s+\S)/g, "$1\n\n$2");
  // Table row after prose (not already separated)
  out = out.replace(/([^\n|])\n(\|)/g, "$1\n\n$2");
  // LLM row breaks (||| or || before next row)
  out = out.replace(/\s*\|\|\|\s*/g, "\n");
  out = out.replace(/\|\|\s*(?=\|)/g, "\n");
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findUngroundedNumericClaims(content: string, grounded: Set<string>): string[] {
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
    content = stripLeadingSectionHeadingLine(content, section.heading);
    content = normalizeLiteratureReportSectionContent(content, section.heading);
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
  const byHeading = new Map(llmSections.map((s) => [s.heading.trim().toLowerCase(), s.content]));

  const methodsNarrative = normalizeLiteratureReportSectionContent(
    byHeading.get("methods") ?? "",
    "Methods"
  );
  const methodsContent = `${deterministic.methodsBlock}\n\n${methodsNarrative}`.trim();

  const resultsNarrative = normalizeLiteratureReportSectionContent(
    byHeading.get("results") ?? "",
    "Results"
  );
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
      const raw = byHeading.get(key) ?? `[${name} not generated]`;
      const content = normalizeLiteratureReportSectionContent(raw, name);
      out.push({ heading: name, content });
    }
  }

  return out;
}
