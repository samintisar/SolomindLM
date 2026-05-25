export interface Citation {
  paperId: string;
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url: string;
  sourceApi: "openalex" | "arxiv" | "semantic_scholar" | "pubmed";
}

export interface CitationEngine {
  formatInline(citation: Citation, style: string, index?: number): string;
  formatReference(citation: Citation, style: string, index?: number): string;
  generateReferenceList(citations: Citation[], style: string): string;
  parseCitation(raw: string): Citation | null;
}

export const SUPPORTED_STYLES = [
  "apa7",
  "apa6",
  "mla9",
  "mla8",
  "chicago17",
  "chicago17_notes",
  "ama11",
  "ama10",
  "acs",
  "ieee",
  "vancouver",
  "harvard",
] as const;

export type CitationStyle = (typeof SUPPORTED_STYLES)[number];

function validateStyle(style: string): asserts style is CitationStyle {
  if (!SUPPORTED_STYLES.includes(style as CitationStyle)) {
    throw new Error(
      `Unsupported citation style: ${style}. Supported styles: ${SUPPORTED_STYLES.join(", ")}`
    );
  }
}

// NOTE: Assumes Western name conventions where the last word is the surname.
// Non-Western names (e.g., Chinese, Japanese, Korean) may not be handled correctly.
function formatAuthorLastNameFirst(author: string): string {
  const parts = author.split(" ");
  const lastName = parts.pop() || author;
  const initials = parts.map((p) => p[0]).join(".");
  return initials ? `${lastName}, ${initials}.` : `${lastName}.`;
}

function formatAPA6Authors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];

  if (safeAuthors.length === 0) {
    return "";
  }

  if (safeAuthors.length === 1) {
    return formatAuthorLastNameFirst(safeAuthors[0]);
  }

  if (safeAuthors.length === 2) {
    return `${formatAuthorLastNameFirst(safeAuthors[0])}, & ${formatAuthorLastNameFirst(safeAuthors[1])}`;
  }

  if (safeAuthors.length <= 6) {
    const formatted = safeAuthors.map((a, i) => {
      if (i === safeAuthors.length - 1) {
        return `& ${formatAuthorLastNameFirst(a)}`;
      }
      return formatAuthorLastNameFirst(a);
    });
    return formatted.join(", ");
  }

  // 7+ authors: first 6 + et al.
  const formatted = safeAuthors.slice(0, 6).map(formatAuthorLastNameFirst);
  return `${formatted.join(", ")}, et al.`;
}

function formatMLA8Authors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  if (safeAuthors.length === 1) return safeAuthors[0];
  if (safeAuthors.length === 2) return `${safeAuthors[0]}, and ${safeAuthors[1]}`;
  return `${safeAuthors[0]}, et al`;
}

function formatChicago17NotesAuthors(authors: string[] | undefined): string {
  return formatChicago17Authors(authors);
}

function formatAMA11Author(author: string): string {
  const parts = author.split(" ");
  const lastName = parts.pop() || "";
  const initials = parts.map((p) => p[0]).join("");
  return initials ? `${lastName} ${initials}` : lastName;
}

function formatAMA11Authors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  if (safeAuthors.length <= 6) {
    return safeAuthors.map(formatAMA11Author).join(", ");
  }
  return `${safeAuthors.slice(0, 6).map(formatAMA11Author).join(", ")}, et al.`;
}

function formatAMA10Author(author: string): string {
  const parts = author.split(" ");
  const lastName = parts.pop() || "";
  const initials = parts.map((p) => p[0]).join(".");
  return initials ? `${lastName} ${initials}.` : `${lastName}.`;
}

function formatAMA10Authors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  if (safeAuthors.length <= 6) {
    return safeAuthors.map(formatAMA10Author).join(", ");
  }
  return `${safeAuthors.slice(0, 6).map(formatAMA10Author).join(", ")}, et al.`;
}

function formatACSAuthor(author: string): string {
  const parts = author.split(" ");
  const lastName = parts.pop() || "";
  const initials = parts.map((p) => p[0]).join(". ");
  return initials ? `${lastName}, ${initials}.` : `${lastName}.`;
}

function formatACSAuthors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  return safeAuthors.map(formatACSAuthor).join("; ");
}

function toSuperscript(num: number): string {
  const superscripts = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
  return String(num)
    .split("")
    .map((d) => superscripts[parseInt(d)])
    .join("");
}

function getFirstAuthorLastName(author: string): string {
  return author.split(" ").pop() || "Unknown";
}

// ==================== APA 7 ====================

function formatAPA7Authors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];

  if (safeAuthors.length === 0) {
    return "";
  }

  if (safeAuthors.length === 1) {
    return formatAuthorLastNameFirst(safeAuthors[0]);
  }

  if (safeAuthors.length === 2) {
    return `${formatAuthorLastNameFirst(safeAuthors[0])}, & ${formatAuthorLastNameFirst(safeAuthors[1])}`;
  }

  // 3+ authors
  const formatted = safeAuthors.map((a, i) => {
    if (i === safeAuthors.length - 1) {
      return `& ${formatAuthorLastNameFirst(a)}`;
    }
    return formatAuthorLastNameFirst(a);
  });
  return formatted.join(", ");
}

function formatAPA7(citation: Citation): string {
  const authors = formatAPA7Authors(citation.authors);
  const year = citation.year || "n.d.";

  if (!citation.authors || citation.authors.length === 0) {
    // Use title-based key when no authors
    const titleKey = citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");
    if (citation.sourceApi === "arxiv") {
      return `${titleKey}. (${year}). ${citation.title}. arXiv. ${citation.url}`;
    }
    return `${titleKey}. (${year}). ${citation.title}. ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${authors} (${year}). ${citation.title}. arXiv. ${citation.url}`;
  }

  return `${authors} (${year}). ${citation.title}. ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
}

function formatInlineAPA7(citation: Citation): string {
  const safeAuthors = citation.authors || [];
  const author = getFirstAuthorLastName(safeAuthors[0] || "Unknown");
  const year = citation.year || "n.d.";

  if (safeAuthors.length === 0) {
    return `(Unknown, ${year})`;
  }

  if (safeAuthors.length > 2) {
    return `(${author} et al., ${year})`;
  } else if (safeAuthors.length === 2) {
    const author2 = getFirstAuthorLastName(safeAuthors[1] || "Unknown");
    return `(${author} & ${author2}, ${year})`;
  }

  return `(${author}, ${year})`;
}

// ==================== MLA 9 ====================

function formatMLA9Authors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  if (safeAuthors.length === 1) return safeAuthors[0];
  if (safeAuthors.length === 2) return `${safeAuthors[0]}, and ${safeAuthors[1]}`;
  return `${safeAuthors[0]}, et al`;
}

function formatMLA9(citation: Citation): string {
  const authors = formatMLA9Authors(citation.authors);
  const year = citation.year || "n.d.";

  if (!citation.authors || citation.authors.length === 0) {
    const titleKey = citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");
    if (citation.sourceApi === "arxiv") {
      return `${titleKey}. "${citation.title}." arXiv, ${year}, ${citation.url}`;
    }
    return `${titleKey}. "${citation.title}." ${year}, ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${authors}. "${citation.title}." arXiv, ${year}, ${citation.url}`;
  }

  return `${authors}. "${citation.title}." ${year}, ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
}

function formatInlineMLA9(citation: Citation): string {
  const safeAuthors = citation.authors || [];
  const author = getFirstAuthorLastName(safeAuthors[0] || "Unknown");

  if (safeAuthors.length === 0) return "(Unknown)";
  if (safeAuthors.length > 2) return `(${author} et al.)`;
  if (safeAuthors.length === 2) {
    const author2 = getFirstAuthorLastName(safeAuthors[1] || "Unknown");
    return `(${author} and ${author2})`;
  }
  return `(${author})`;
}

// ==================== Chicago 17 ====================

function formatChicago17Authors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  if (safeAuthors.length === 1) return safeAuthors[0];
  if (safeAuthors.length === 2) return `${safeAuthors[0]}, and ${safeAuthors[1]}`;
  if (safeAuthors.length === 3)
    return `${safeAuthors[0]}, ${safeAuthors[1]}, and ${safeAuthors[2]}`;
  return `${safeAuthors[0]}, ${safeAuthors[1]}, ${safeAuthors[2]}, et al`;
}

function formatChicago17(citation: Citation): string {
  const authors = formatChicago17Authors(citation.authors);
  const year = citation.year || "n.d.";

  if (!citation.authors || citation.authors.length === 0) {
    const titleKey = citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");
    if (citation.sourceApi === "arxiv") {
      return `${titleKey}. ${year}. "${citation.title}." arXiv. ${citation.url}`;
    }
    return `${titleKey}. ${year}. "${citation.title}." ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${authors}. ${year}. "${citation.title}." arXiv. ${citation.url}`;
  }

  return `${authors}. ${year}. "${citation.title}." ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
}

function formatInlineChicago17(citation: Citation): string {
  const safeAuthors = citation.authors || [];
  const author = getFirstAuthorLastName(safeAuthors[0] || "Unknown");
  const year = citation.year || "n.d.";

  if (safeAuthors.length === 0) return `(Unknown ${year})`;
  return `(${author} ${year})`;
}

// ==================== IEEE ====================

function formatIEEEInitials(author: string): string {
  const parts = author.split(" ");
  const lastName = parts.pop() || "";
  const initials = parts.map((p) => p[0]).join(". ");
  return initials ? `${initials}. ${lastName}` : lastName;
}

function formatIEEEAuthors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  if (safeAuthors.length === 1) return formatIEEEInitials(safeAuthors[0]);
  if (safeAuthors.length === 2) {
    return `${formatIEEEInitials(safeAuthors[0])} and ${formatIEEEInitials(safeAuthors[1])}`;
  }
  if (safeAuthors.length === 3) {
    return `${formatIEEEInitials(safeAuthors[0])}, ${formatIEEEInitials(safeAuthors[1])}, and ${formatIEEEInitials(safeAuthors[2])}`;
  }
  // 4+ authors: first author + et al.
  return `${formatIEEEInitials(safeAuthors[0])} et al.`;
}

function getArxivIdFromUrl(url: string): string {
  const match = url.match(/abs\/(\d+\.\d+)/);
  return match ? match[1] : url;
}

function formatIEEE(citation: Citation, index: number): string {
  const authors = formatIEEEAuthors(citation.authors);
  const num = index + 1;
  const year = String(citation.year || "n.d.");
  const yearSuffix = year.endsWith(".") ? "" : ".";

  if (!citation.authors || citation.authors.length === 0) {
    if (citation.sourceApi === "arxiv") {
      const arxivId = getArxivIdFromUrl(citation.url);
      return `[${num}] "${citation.title}," arXiv:${arxivId}, ${year}${yearSuffix}`;
    }
    return `[${num}] "${citation.title}," ${citation.doi ? `doi:${citation.doi}` : citation.url}, ${year}${yearSuffix}`;
  }

  if (citation.sourceApi === "arxiv") {
    const arxivId = getArxivIdFromUrl(citation.url);
    return `[${num}] ${authors}, "${citation.title}," arXiv:${arxivId}, ${year}${yearSuffix}`;
  }

  return `[${num}] ${authors}, "${citation.title}," ${citation.doi ? `doi:${citation.doi}` : citation.url}, ${year}${yearSuffix}`;
}

function formatInlineIEEE(_citation: Citation, index: number): string {
  return `[${index + 1}]`;
}

// ==================== Vancouver ====================

function formatVancouverAuthor(author: string): string {
  const parts = author.split(" ");
  const lastName = parts.pop() || "";
  const initials = parts.map((p) => p[0]).join("");
  return initials ? `${lastName} ${initials}` : lastName;
}

function formatVancouverAuthors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  return safeAuthors.map(formatVancouverAuthor).join(", ");
}

function formatVancouver(citation: Citation, index: number): string {
  const authors = formatVancouverAuthors(citation.authors);
  const num = index + 1;

  if (!citation.authors || citation.authors.length === 0) {
    if (citation.sourceApi === "arxiv") {
      const arxivId = getArxivIdFromUrl(citation.url);
      return `${num}. ${citation.title}. arXiv. ${citation.year || "n.d."};${arxivId}.`;
    }
    return `${num}. ${citation.title}. ${citation.year || "n.d."};${citation.doi ? citation.doi : citation.url}.`;
  }

  if (citation.sourceApi === "arxiv") {
    const arxivId = getArxivIdFromUrl(citation.url);
    return `${num}. ${authors}. ${citation.title}. arXiv. ${citation.year || "n.d."};${arxivId}.`;
  }

  return `${num}. ${authors}. ${citation.title}. ${citation.year || "n.d."};${citation.doi ? citation.doi : citation.url}.`;
}

function formatInlineVancouver(_citation: Citation, index: number): string {
  return `(${index + 1})`;
}

// ==================== Harvard ====================

function formatHarvardAuthor(author: string): string {
  const parts = author.split(" ");
  const lastName = parts.pop() || "";
  const initials = parts.map((p) => p[0]).join(".");
  return initials ? `${lastName}, ${initials}.` : `${lastName}.`;
}

function formatHarvardAuthors(authors: string[] | undefined): string {
  const safeAuthors = authors || [];
  if (safeAuthors.length === 0) return "";
  if (safeAuthors.length === 1) return formatHarvardAuthor(safeAuthors[0]);
  if (safeAuthors.length === 2) {
    return `${formatHarvardAuthor(safeAuthors[0])} and ${formatHarvardAuthor(safeAuthors[1])}`;
  }
  // 3+
  return `${formatHarvardAuthor(safeAuthors[0])} et al.`;
}

function formatHarvard(citation: Citation): string {
  const authors = formatHarvardAuthors(citation.authors);
  const year = citation.year || "n.d.";

  if (!citation.authors || citation.authors.length === 0) {
    const titleKey = citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");
    if (citation.sourceApi === "arxiv") {
      return `${titleKey} (${year}) '${citation.title}', arXiv. Available at: ${citation.url}`;
    }
    return `${titleKey} (${year}) '${citation.title}', Available at: ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${authors} (${year}) '${citation.title}', arXiv. Available at: ${citation.url}`;
  }

  return `${authors} (${year}) '${citation.title}', Available at: ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
}

function formatAPA6(citation: Citation): string {
  const authors = formatAPA6Authors(citation.authors);
  const year = citation.year || "n.d.";

  if (!citation.authors || citation.authors.length === 0) {
    const titleKey = citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");
    if (citation.sourceApi === "arxiv") {
      return `${titleKey}. (${year}). ${citation.title}. arXiv. ${citation.url}`;
    }
    return `${titleKey}. (${year}). ${citation.title}. ${citation.doi ? `doi:${citation.doi}` : citation.url}`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${authors} (${year}). ${citation.title}. arXiv. ${citation.url}`;
  }

  return `${authors} (${year}). ${citation.title}. ${citation.doi ? `doi:${citation.doi}` : citation.url}`;
}

function formatMLA8(citation: Citation): string {
  const authors = formatMLA8Authors(citation.authors);
  const year = citation.year || "n.d.";

  if (!citation.authors || citation.authors.length === 0) {
    const titleKey = citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");
    if (citation.sourceApi === "arxiv") {
      return `${titleKey}. "${citation.title}." arXiv, ${year}, ${citation.url}`;
    }
    return `${titleKey}. "${citation.title}." ${year}, ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${authors}. "${citation.title}." arXiv, ${year}, ${citation.url}`;
  }

  return `${authors}. "${citation.title}." ${year}, ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
}

function formatChicago17Notes(citation: Citation): string {
  const authors = formatChicago17NotesAuthors(citation.authors);
  const year = citation.year || "n.d.";

  if (!citation.authors || citation.authors.length === 0) {
    const titleKey = citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");
    if (citation.sourceApi === "arxiv") {
      return `${titleKey}, "${citation.title}," arXiv, ${year}, ${citation.url}.`;
    }
    return `${titleKey}, "${citation.title}," ${year}, ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}.`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${authors}, "${citation.title}," arXiv, ${year}, ${citation.url}.`;
  }

  return `${authors}, "${citation.title}," ${year}, ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}.`;
}

function formatAMA11(citation: Citation, index: number): string {
  const authors = formatAMA11Authors(citation.authors);
  const num = index + 1;

  if (!citation.authors || citation.authors.length === 0) {
    if (citation.sourceApi === "arxiv") {
      return `${num}. ${citation.title}. arXiv. ${citation.year || "n.d."}. ${citation.url}.`;
    }
    return `${num}. ${citation.title}. ${citation.year || "n.d."}. ${citation.doi ? `doi:${citation.doi}` : citation.url}.`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${num}. ${authors}. ${citation.title}. arXiv. ${citation.year || "n.d."}. ${citation.url}.`;
  }

  return `${num}. ${authors}. ${citation.title}. ${citation.year || "n.d."}. ${citation.doi ? `doi:${citation.doi}` : citation.url}.`;
}

function formatAMA10(citation: Citation, index: number): string {
  const authors = formatAMA10Authors(citation.authors);
  const num = index + 1;

  if (!citation.authors || citation.authors.length === 0) {
    if (citation.sourceApi === "arxiv") {
      return `${num}. ${citation.title}. arXiv. ${citation.year || "n.d."}. ${citation.url}.`;
    }
    return `${num}. ${citation.title}. ${citation.year || "n.d."}. ${citation.doi ? `doi:${citation.doi}` : citation.url}.`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${num}. ${authors} ${citation.title}. arXiv. ${citation.year || "n.d."}. ${citation.url}.`;
  }

  return `${num}. ${authors} ${citation.title}. ${citation.year || "n.d."}. ${citation.doi ? `doi:${citation.doi}` : citation.url}.`;
}

function formatACS(citation: Citation, index: number): string {
  const authors = formatACSAuthors(citation.authors);
  const num = index + 1;

  if (!citation.authors || citation.authors.length === 0) {
    if (citation.sourceApi === "arxiv") {
      return `${num}. ${citation.title}. arXiv. ${citation.year || "n.d."}. ${citation.url}.`;
    }
    return `${num}. ${citation.title}. ${citation.year || "n.d."}. ${citation.doi ? `doi:${citation.doi}` : citation.url}.`;
  }

  if (citation.sourceApi === "arxiv") {
    return `${num}. ${authors} ${citation.title}. arXiv. ${citation.year || "n.d."}. ${citation.url}.`;
  }

  return `${num}. ${authors} ${citation.title}. ${citation.year || "n.d."}. ${citation.doi ? `doi:${citation.doi}` : citation.url}.`;
}

function formatInlineHarvard(citation: Citation): string {
  const safeAuthors = citation.authors || [];
  const author = getFirstAuthorLastName(safeAuthors[0] || "Unknown");
  const year = citation.year || "n.d.";

  if (safeAuthors.length === 0) return `(Unknown, ${year})`;
  if (safeAuthors.length > 2) return `(${author} et al., ${year})`;
  if (safeAuthors.length === 2) {
    const author2 = getFirstAuthorLastName(safeAuthors[1] || "Unknown");
    return `(${author} and ${author2}, ${year})`;
  }
  return `(${author}, ${year})`;
}

function formatInlineAPA6(citation: Citation): string {
  return formatInlineAPA7(citation);
}

function formatInlineMLA8(citation: Citation): string {
  return formatInlineMLA9(citation);
}

function formatInlineChicago17Notes(_citation: Citation, index: number): string {
  return toSuperscript(index + 1);
}

function formatInlineAMA11(_citation: Citation, index: number): string {
  return toSuperscript(index + 1);
}

function formatInlineAMA10(_citation: Citation, index: number): string {
  return toSuperscript(index + 1);
}

function formatInlineACS(_citation: Citation, index: number): string {
  return toSuperscript(index + 1);
}

// ==================== Engine ====================

export function generateCitationKey(citation: Citation, existingKeys: Set<string>): string {
  const safeAuthors = citation.authors || [];
  const base =
    safeAuthors.length > 0
      ? (safeAuthors[0].split(" ").pop() || "") + (citation.year || "")
      : citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");

  let key = base;
  let suffix = 1;
  while (existingKeys.has(key)) {
    key = `${base}_${suffix}`;
    suffix++;
  }
  return key;
}

export function createCitationEngine(): CitationEngine {
  return {
    formatInline(citation, style, index) {
      validateStyle(style);

      switch (style) {
        case "apa7":
          return formatInlineAPA7(citation);
        case "apa6":
          return formatInlineAPA6(citation);
        case "mla9":
          return formatInlineMLA9(citation);
        case "mla8":
          return formatInlineMLA8(citation);
        case "chicago17":
          return formatInlineChicago17(citation);
        case "chicago17_notes":
          if (index === undefined) {
            throw new Error("Chicago 17 Notes inline citations require an index parameter");
          }
          return formatInlineChicago17Notes(citation, index);
        case "ama11":
          if (index === undefined) {
            throw new Error("AMA 11 inline citations require an index parameter");
          }
          return formatInlineAMA11(citation, index);
        case "ama10":
          if (index === undefined) {
            throw new Error("AMA 10 inline citations require an index parameter");
          }
          return formatInlineAMA10(citation, index);
        case "acs":
          if (index === undefined) {
            throw new Error("ACS inline citations require an index parameter");
          }
          return formatInlineACS(citation, index);
        case "ieee":
          if (index === undefined) {
            throw new Error("IEEE inline citations require an index parameter");
          }
          return formatInlineIEEE(citation, index);
        case "vancouver":
          if (index === undefined) {
            throw new Error("Vancouver inline citations require an index parameter");
          }
          return formatInlineVancouver(citation, index);
        case "harvard":
          return formatInlineHarvard(citation);
        default:
          // Should never reach here due to validateStyle
          throw new Error(`Unsupported citation style: ${style}`);
      }
    },

    formatReference(citation, style, index) {
      validateStyle(style);

      switch (style) {
        case "apa7":
          return formatAPA7(citation);
        case "apa6":
          return formatAPA6(citation);
        case "mla9":
          return formatMLA9(citation);
        case "mla8":
          return formatMLA8(citation);
        case "chicago17":
          return formatChicago17(citation);
        case "chicago17_notes":
          return formatChicago17Notes(citation);
        case "ama11":
          if (index === undefined) {
            throw new Error("AMA 11 references require an index parameter");
          }
          return formatAMA11(citation, index);
        case "ama10":
          if (index === undefined) {
            throw new Error("AMA 10 references require an index parameter");
          }
          return formatAMA10(citation, index);
        case "acs":
          if (index === undefined) {
            throw new Error("ACS references require an index parameter");
          }
          return formatACS(citation, index);
        case "ieee":
          if (index === undefined) {
            throw new Error("IEEE references require an index parameter");
          }
          return formatIEEE(citation, index);
        case "vancouver":
          if (index === undefined) {
            throw new Error("Vancouver references require an index parameter");
          }
          return formatVancouver(citation, index);
        case "harvard":
          return formatHarvard(citation);
        default:
          // Should never reach here due to validateStyle
          throw new Error(`Unsupported citation style: ${style}`);
      }
    },

    generateReferenceList(citations, style) {
      validateStyle(style);

      if (
        style === "ieee" ||
        style === "vancouver" ||
        style === "ama11" ||
        style === "ama10" ||
        style === "acs"
      ) {
        // Numbered styles: preserve input order and number sequentially
        return citations.map((c, i) => this.formatReference(c, style, i)).join("\n\n");
      }

      // Author-date styles: sort by first author's last name
      return [...citations]
        .sort((a, b) => {
          const aLastName = (a.authors?.[0]?.split(" ").pop() || "").toLowerCase();
          const bLastName = (b.authors?.[0]?.split(" ").pop() || "").toLowerCase();
          return aLastName.localeCompare(bLastName);
        })
        .map((c) => this.formatReference(c, style))
        .join("\n\n");
    },

    parseCitation(_raw) {
      throw new Error("Not implemented");
    },
  };
}
