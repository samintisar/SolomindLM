"use node";

/**
 * Document Metadata Extractor
 *
 * Extracts document-level metadata during document processing.
 * This metadata is attached to the document and provides context for RAG.
 * Zero LLM overhead - all extraction is deterministic.
 */

export interface DocumentMetadata {
  wordCount: number;
  estimatedReadingTimeMinutes: number;
  totalPages: number | null;
  hasCodeBlocks: boolean;
  hasMathNotation: boolean;
  hasTables: boolean;
  hasImages: boolean;
  language: string;
  documentStructure: "flat" | "hierarchical";
  maxHeadingLevel: number;
}

/**
 * Extract document-level metadata from parsed content.
 */
export function extractDocumentMetadata(
  parsedContent: string,
  fileExtension?: string,
  pageCount?: number
): DocumentMetadata {
  const wordCount = countWords(parsedContent);
  const headingInfo = detectHeadings(parsedContent);
  const language = detectLanguage(parsedContent);

  return {
    wordCount,
    estimatedReadingTimeMinutes: Math.ceil(wordCount / 200), // 200 WPM average
    totalPages: pageCount ?? null,
    hasCodeBlocks: detectCodeBlocks(parsedContent),
    hasMathNotation: detectMathNotation(parsedContent),
    hasTables: detectTables(parsedContent),
    hasImages: detectImages(parsedContent, fileExtension),
    language,
    documentStructure: headingInfo.maxLevel >= 2 ? "hierarchical" : "flat",
    maxHeadingLevel: headingInfo.maxLevel,
  };
}

/**
 * Count words in text (handles various whitespace).
 */
function countWords(text: string): number {
  // Split on whitespace and filter empty strings
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Detect markdown headings and return max level.
 */
function detectHeadings(text: string): { maxLevel: number; count: number } {
  // Match markdown headings: # through ######
  const headingMatches = text.match(/^#{1,6}\s+.+$/gm);
  if (!headingMatches || headingMatches.length === 0) {
    return { maxLevel: 0, count: 0 };
  }

  let maxLevel = 0;
  for (const heading of headingMatches) {
    const hashMatch = heading.match(/^#+/);
    const level = hashMatch ? hashMatch[0].length : 0;
    if (level > maxLevel) maxLevel = level;
  }

  return { maxLevel, count: headingMatches.length };
}

/**
 * Detect code blocks (fenced or inline).
 */
function detectCodeBlocks(text: string): boolean {
  // Fenced code blocks: ```code```
  // Inline code: `code` (but not single backticks used for other purposes)
  return /```[\s\S]*?```/.test(text) || /`[^`\n]+`/.test(text);
}

/**
 * Detect math notation (LaTeX).
 */
function detectMathNotation(text: string): boolean {
  // Display math: $$...$$
  // Inline math: $...$ (avoid matching currency like $5.00)
  return /\$\$[\s\S]*?\$\$/.test(text) || /\$[^$\n]+?\$/.test(text);
}

/**
 * Detect markdown tables.
 */
function detectTables(text: string): boolean {
  // Markdown tables have | separators and header row dividers
  return /^\|.+\|[\r\n]+\|[-:| ]+\|/m.test(text);
}

/**
 * Detect images in content or by file type.
 */
function detectImages(text: string, fileExtension?: string): boolean {
  // Check for markdown image syntax
  const hasMarkdownImages = /!\[.*?\]\(.*?\)/.test(text);
  // Check for HTML img tags
  const hasHtmlImages = /<img\s/.test(text);

  // PDFs, PPTXs, DOCXs likely contain images
  const imageFormats = ['.pdf', '.pptx', '.docx'];
  const isLikelyImageDocument = fileExtension && imageFormats.includes(fileExtension.toLowerCase());

  return hasMarkdownImages || hasHtmlImages || !!isLikelyImageDocument;
}

/**
 * Simple language detection using character patterns.
 * Returns a language code or language group.
 */
function detectLanguage(text: string): string {
  // Sample first 5000 chars for detection
  const sample = text.slice(0, 5000);

  // Check for CJK characters (Chinese, Japanese, Korean)
  if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(sample)) {
    // Distinguish between Chinese, Japanese, Korean
    if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
    return 'zh';
  }

  // Check for Cyrillic (Russian, Ukrainian, etc.)
  if (/[\u0400-\u04FF]/.test(sample)) {
    return 'ru';
  }

  // Check for Arabic
  if (/[\u0600-\u06FF]/.test(sample)) {
    return 'ar';
  }

  // Check for Hebrew
  if (/[\u0590-\u05FF]/.test(sample)) {
    return 'he';
  }

  // Check for Thai
  if (/[\u0E00-\u0E7F]/.test(sample)) {
    return 'th';
  }

  // Check for extended Latin (European languages with diacritics)
  if (/[À-ÿ]/.test(sample)) {
    // Try to distinguish common European languages
    if (/[àâäéèêëïîôùûüÿç]/i.test(sample)) return 'fr';
    if (/[áéíóúüñ¿¡]/i.test(sample)) return 'es';
    if (/[äöüß]/i.test(sample)) return 'de';
    if (/[àèéìíîòóùú]/i.test(sample)) return 'it';
    if (/[ąćęłńóśźż]/i.test(sample)) return 'pl';
    if (/[ãõáéíóúâêîôûç]/i.test(sample)) return 'pt';
    return 'eu'; // European (generic)
  }

  // Default to English for ASCII-heavy content
  return 'en';
}

/**
 * Get file extension from filename.
 */
export function getFileExtension(fileName: string): string | undefined {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return undefined;
  return fileName.slice(lastDot).toLowerCase();
}

/**
 * Estimate if content has significant structure (multiple sections).
 */
export function hasSignificantStructure(text: string): boolean {
  const headingInfo = detectHeadings(text);
  // Consider significant if 3+ headings at level 2 or deeper
  return headingInfo.count >= 3 && headingInfo.maxLevel >= 2;
}
