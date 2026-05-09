export interface Citation {
  paperId: string;
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url: string;
  sourceApi: "arxiv" | "semantic_scholar" | "pubmed";
}

export interface CitationEngine {
  formatInline(citation: Citation, style: string): string;
  formatReference(citation: Citation, style: string): string;
  generateReferenceList(citations: Citation[], style: string): string;
  parseCitation(raw: string): Citation | null;
}

export const SUPPORTED_STYLES = ["apa7"] as const;

export type CitationStyle = typeof SUPPORTED_STYLES[number];

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
  const initials = parts.map(p => p[0]).join(".");
  return initials ? `${lastName}, ${initials}.` : `${lastName}.`;
}

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
  const author = safeAuthors[0]?.split(" ").pop() || "Unknown";
  const year = citation.year || "n.d.";

  if (safeAuthors.length === 0) {
    return `(Unknown, ${year})`;
  }

  if (safeAuthors.length > 2) {
    return `(${author} et al., ${year})`;
  } else if (safeAuthors.length === 2) {
    const author2 = safeAuthors[1]?.split(" ").pop() || "Unknown";
    return `(${author} & ${author2}, ${year})`;
  }

  return `(${author}, ${year})`;
}

export function generateCitationKey(
  citation: Citation,
  existingKeys: Set<string>
): string {
  const safeAuthors = citation.authors || [];
  const base = safeAuthors.length > 0
    ? (safeAuthors[0].split(" ").pop() || "") + (citation.year || "")
    : citation.title.replace(/\s/g, "").slice(0, 3) + (citation.year || "");

  let key = base;
  let suffix = "a";
  while (existingKeys.has(key)) {
    key = base + suffix;
    suffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
  }
  return key;
}

export function createCitationEngine(): CitationEngine {
  return {
    formatInline(citation, style) {
      validateStyle(style);
      return formatInlineAPA7(citation);
    },

    formatReference(citation, style) {
      validateStyle(style);
      return formatAPA7(citation);
    },

    generateReferenceList(citations, style) {
      validateStyle(style);
      return [...citations]
        .sort((a, b) => {
          const aLastName = (a.authors?.[0]?.split(" ").pop() || "").toLowerCase();
          const bLastName = (b.authors?.[0]?.split(" ").pop() || "").toLowerCase();
          return aLastName.localeCompare(bLastName);
        })
        .map(c => this.formatReference(c, style))
        .join("\n\n");
    },

    parseCitation(_raw) {
      throw new Error("Not implemented");
    }
  };
}
