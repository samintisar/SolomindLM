export type LiteratureReportSection = {
  heading: string;
  content: string;
};

const SKIP_CHAT_PREVIEW_HEADINGS = new Set(["abstract", "introduction", "methods"]);

/** Prefer synthesis sections over the formal abstract for in-chat previews. */
const CHAT_PREVIEW_SECTION_PRIORITY = ["conclusion", "discussion", "results"] as const;

export function stripMarkdownPreview(text: string, maxLength = 520): string {
  const plain = text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  const cut = plain.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function parseMarkdownSections(content: string): LiteratureReportSection[] {
  const parts = content.split(/^##\s+/m).filter(Boolean);
  if (parts.length <= 1 && !content.includes("\n## ")) {
    return [];
  }
  return parts.map((part) => {
    const newline = part.indexOf("\n");
    if (newline === -1) {
      return { heading: part.trim(), content: "" };
    }
    return {
      heading: part.slice(0, newline).trim(),
      content: part.slice(newline + 1).trim(),
    };
  });
}

function sectionMap(sections: LiteratureReportSection[]): Map<string, string> {
  return new Map(
    sections.map((section) => [section.heading.trim().toLowerCase(), section.content.trim()])
  );
}

/**
 * Short narrative preview for chat completion — synthesis from Conclusion/Discussion,
 * not the formal Abstract section.
 */
export function buildLiteratureReportChatPreview(
  report: { content: string; sections?: LiteratureReportSection[] },
  maxLength = 520
): string | null {
  const sections =
    report.sections && report.sections.length > 0
      ? report.sections
      : parseMarkdownSections(report.content);

  if (sections.length > 0) {
    const byHeading = sectionMap(sections);

    for (const heading of CHAT_PREVIEW_SECTION_PRIORITY) {
      const content = byHeading.get(heading);
      if (content) {
        return stripMarkdownPreview(content, maxLength);
      }
    }

    for (const section of sections) {
      const key = section.heading.trim().toLowerCase();
      if (!SKIP_CHAT_PREVIEW_HEADINGS.has(key) && section.content.trim()) {
        return stripMarkdownPreview(section.content, maxLength);
      }
    }
  }

  const trimmed = report.content.trim();
  return trimmed ? stripMarkdownPreview(trimmed, maxLength) : null;
}
