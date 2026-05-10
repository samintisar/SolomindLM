import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { PaperRecord } from "./DoiResolverService";

export interface ParseResult {
  papers: PaperRecord[];
  stats: {
    total: number;
    withDoi: number;
    withoutDoi: number;
    malformed: number;
  };
  warnings?: string[];
}

export class BibliographyParserService {
  private logger = createServiceLogger("bibliography_parser", "BibliographyParserService");

  parse(content: string, format: "bibtex" | "ris" | "auto" = "auto"): ParseResult {
    this.logger.operationStart({ format });

    const normalizedContent = this.normalizeEncoding(content);
    const detectedFormat = format === "auto" ? this.detectFormat(normalizedContent) : format;

    let papers: PaperRecord[];
    let malformed: number;
    let total: number;

    try {
      if (detectedFormat === "bibtex") {
        const result = this.parseBibTeX(normalizedContent);
        papers = result.papers;
        malformed = result.malformed;
        total = result.total;
      } else if (detectedFormat === "ris") {
        const result = this.parseRIS(normalizedContent);
        papers = result.papers;
        malformed = result.malformed;
        total = result.total;
      } else {
        this.logger.warn("Could not auto-detect format, attempting BibTeX fallback");
        const result = this.parseBibTeX(normalizedContent);
        papers = result.papers;
        malformed = result.malformed;
        total = result.total;
      }
    } catch (error) {
      this.logger.operationError(error, { format: detectedFormat });
      throw error;
    }

    // Deduplicate by DOI within batch
    const dedupedPapers = this.deduplicateByDoi(papers);

    const withDoi = dedupedPapers.filter((p) => p.doi).length;
    const withoutDoi = dedupedPapers.filter((p) => !p.doi).length;

    const warnings: string[] = [];
    if (normalizedContent !== content) {
      warnings.push("Encoding fallback used: content was decoded from Latin-1");
    }

    const result: ParseResult = {
      papers: dedupedPapers,
      stats: {
        total,
        withDoi,
        withoutDoi,
        malformed,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    this.logger.operationComplete({
      format: detectedFormat,
      total: result.stats.total,
      withDoi,
      withoutDoi,
      malformed,
    });

    return result;
  }

  private detectFormat(content: string): "bibtex" | "ris" {
    const trimmed = content.trim();
    if (trimmed.startsWith("@")) {
      return "bibtex";
    }
    if (trimmed.includes("TY  -")) {
      return "ris";
    }
    // Default to bibtex if we can't tell
    return "bibtex";
  }

  private normalizeEncoding(content: string): string {
    // Check for invalid UTF-8 replacement characters
    if (content.includes("\uFFFD")) {
      try {
        // Try to decode as Latin-1
        const bytes = new Uint8Array(content.length);
        for (let i = 0; i < content.length; i++) {
          bytes[i] = content.charCodeAt(i) & 0xff;
        }
        const decoder = new TextDecoder("iso-8859-1", { fatal: false });
        return decoder.decode(bytes);
      } catch {
        // If decoding fails, return original with replacement chars
        return content;
      }
    }
    return content;
  }

  private deduplicateByDoi(papers: PaperRecord[]): PaperRecord[] {
    const seenDois = new Set<string>();
    const result: PaperRecord[] = [];

    for (const paper of papers) {
      if (paper.doi) {
        const normalizedDoi = paper.doi.toLowerCase().trim();
        if (seenDois.has(normalizedDoi)) {
          continue;
        }
        seenDois.add(normalizedDoi);
      }
      result.push(paper);
    }

    return result;
  }

  private parseBibTeX(content: string): { papers: PaperRecord[]; malformed: number; total: number } {
    const papers: PaperRecord[] = [];
    let malformed = 0;
    let total = 0;

    // Split into entries by looking for @type{...} blocks
    const entryRegex = /@(\w+)\s*\{\s*([^,]*)\s*,([^@]*)\}/gs;
    let match;

    while ((match = entryRegex.exec(content)) !== null) {
      total++;
      const entryType = match[1].toLowerCase();
      const entryBody = match[3];

      try {
        const convertedBody = this.convertLaTeXAccents(entryBody);
        console.log('DEBUG entryBody:', JSON.stringify(entryBody));
        console.log('DEBUG convertedBody:', JSON.stringify(convertedBody));
        const fields = this.parseBibTeXFields(convertedBody);
        const paper = this.buildPaperRecordFromBibTeX(fields, entryType);
        if (paper) {
          papers.push(paper);
        } else {
          malformed++;
        }
      } catch {
        malformed++;
      }
    }

    // If no entries found with regex, try line-by-line parsing for malformed entries
    if (total === 0) {
      const lines = content.split("\n");
      let inEntry = false;
      let currentEntry: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("@")) {
          if (inEntry && currentEntry.length > 0) {
            total++;
            malformed++;
          }
          inEntry = true;
          currentEntry = [trimmed];
        } else if (inEntry) {
          currentEntry.push(trimmed);
          if (trimmed === "}") {
            total++;
            try {
              const entryText = currentEntry.join("\n");
              const entryMatch = entryText.match(/@(\w+)\s*\{\s*([^,]*)\s*,(.*)\}/s);
              if (entryMatch) {
                const fields = this.parseBibTeXFields(this.convertLaTeXAccents(entryMatch[3]));
                const paper = this.buildPaperRecordFromBibTeX(fields, entryMatch[1].toLowerCase());
                if (paper) {
                  papers.push(paper);
                  malformed--; // Decrement since we successfully parsed it
                }
              } else {
                malformed++;
              }
            } catch {
              malformed++;
            }
            inEntry = false;
            currentEntry = [];
          }
        }
      }

      if (inEntry && currentEntry.length > 0) {
        total++;
        malformed++;
      }
    }

    return { papers, malformed, total };
  }

  private parseBibTeXFields(body: string): Map<string, string> {
    const fields = new Map<string, string>();
    // Match field = {value} or field = "value" or field = value
    // The brace pattern handles one level of nesting: {outer {inner} rest}
    const fieldRegex = /(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|([^,\n]*))\s*,?/g;
    let match;

    while ((match = fieldRegex.exec(body)) !== null) {
      const key = match[1].toLowerCase().trim();
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      fields.set(key, value.trim());
    }

    return fields;
  }

  private buildPaperRecordFromBibTeX(fields: Map<string, string>, entryType: string): PaperRecord | null {
    const title = this.cleanBibTeXValue(fields.get("title") ?? "");
    if (!title) {
      return null;
    }

    const authors = this.parseBibTeXAuthors(fields.get("author") ?? "");
    const abstract = this.cleanBibTeXValue(fields.get("abstract") ?? "");
    const doi = this.cleanBibTeXValue(fields.get("doi") ?? "");
    const venue = this.extractBibTeXVenue(fields, entryType);
    const publicationYear = this.parseYear(fields.get("year") ?? "");

    return {
      title,
      authors,
      abstract,
      doi: doi || undefined,
      venue: venue || undefined,
      publicationYear,
      isOa: false,
      sourceType: "bibtex",
    };
  }

  private cleanBibTeXValue(value: string): string {
    if (!value) return "";
    let cleaned = value.trim();
    // Strip outer braces if present
    while (cleaned.startsWith("{") && cleaned.endsWith("}")) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return this.convertLaTeXAccents(cleaned);
  }

  private parseBibTeXAuthors(authorField: string): string[] {
    if (!authorField) return [];

    // Split by " and " or " & "
    const authors = authorField
      .split(/\s+(?:and|&)\s+/i)
      .map((a) => this.cleanBibTeXValue(a.trim()))
      .filter((a) => a.length > 0);

    return authors;
  }

  private extractBibTeXVenue(fields: Map<string, string>, entryType: string): string {
    const venueFields = ["journal", "booktitle", "publisher", "series", "venue"];
    for (const field of venueFields) {
      const value = fields.get(field);
      if (value) {
        return this.cleanBibTeXValue(value);
      }
    }

    // For specific entry types
    if (entryType === "article") {
      return this.cleanBibTeXValue(fields.get("journal") ?? "");
    }
    if (entryType === "inproceedings" || entryType === "incollection") {
      return this.cleanBibTeXValue(fields.get("booktitle") ?? "");
    }
    if (entryType === "book") {
      return this.cleanBibTeXValue(fields.get("publisher") ?? "");
    }

    return "";
  }

  private parseRIS(content: string): { papers: PaperRecord[]; malformed: number; total: number } {
    const papers: PaperRecord[] = [];
    let malformed = 0;
    let total = 0;

    const lines = content.split(/\r?\n/);
    let currentFields = new Map<string, string[]>();
    let inEntry = false;
    let hasRequiredFields = false;

    for (const line of lines) {
      // Match RIS tags: 2-3 uppercase letters/numbers followed by space-space-dash-space
      const tagMatch = line.match(/^([A-Z][A-Z0-9]{1,2})\s+-\s+(.*)$/);

      if (tagMatch) {
        const tag = tagMatch[1];
        const value = tagMatch[2].trim();

        if (tag === "TY") {
          // Start of new entry
          if (inEntry) {
            total++;
            // Save previous entry if it has required fields
            const paper = this.buildPaperRecordFromRIS(currentFields);
            if (paper && hasRequiredFields) {
              papers.push(paper);
            } else {
              malformed++;
            }
          }
          inEntry = true;
          hasRequiredFields = false;
          currentFields = new Map();
          currentFields.set(tag, [value]);
        } else if (inEntry) {
          const existing = currentFields.get(tag) ?? [];
          existing.push(value);
          currentFields.set(tag, existing);

          if (tag === "TI") {
            hasRequiredFields = true;
          }
        }
      } else if (line.trim() === "ER  -" && inEntry) {
        // End of entry
        total++;
        const paper = this.buildPaperRecordFromRIS(currentFields);
        if (paper && hasRequiredFields) {
          papers.push(paper);
        } else {
          malformed++;
        }
        inEntry = false;
        hasRequiredFields = false;
        currentFields = new Map();
      }
    }

    // Handle last entry if file doesn't end with ER
    if (inEntry) {
      total++;
      const paper = this.buildPaperRecordFromRIS(currentFields);
      if (paper && hasRequiredFields) {
        papers.push(paper);
      } else {
        malformed++;
      }
    }

    return { papers, malformed, total };
  }

  private buildPaperRecordFromRIS(fields: Map<string, string[]>): PaperRecord | null {
    const titles = fields.get("TI");
    const title = titles?.[0] ?? "";
    if (!title) {
      return null;
    }

    const authors = fields.get("AU") ?? [];
    const abstracts = fields.get("AB") ?? [];
    const abstract = abstracts[0] ?? "";
    const dois = fields.get("DO") ?? fields.get("DOI") ?? [];
    const doi = dois[0] ?? "";
    const journals = fields.get("JO") ?? fields.get("JF") ?? fields.get("T2") ?? [];
    const venue = journals[0] ?? "";
    const years = fields.get("PY") ?? fields.get("Y1") ?? [];
    const publicationYear = this.parseYear(years[0] ?? "");

    return {
      title: title.trim(),
      authors: authors.map((a) => a.trim()).filter((a) => a.length > 0),
      abstract: abstract.trim(),
      doi: doi || undefined,
      venue: venue || undefined,
      publicationYear,
      isOa: false,
      sourceType: "ris",
    };
  }

  private parseYear(yearStr: string): number | undefined {
    if (!yearStr) return undefined;
    // Extract just the year portion (e.g., "2023/05/01" or "2023")
    const match = yearStr.match(/(\d{4})/);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 1000 && year <= 9999) {
        return year;
      }
    }
    return undefined;
  }

  private convertLaTeXAccents(text: string): string {
    if (!text) return "";

    let result = text;

    const applyReplacements = (
      replacements: Array<{ pattern: RegExp; map: Record<string, string> }>
    ) => {
      for (const { pattern, map } of replacements) {
        result = result.replace(pattern, (match, letter) => map[letter] || match);
      }
    };

    // 1. Double-braced forms: {\'{i}}, {\"{u}}, {\`{a}}, etc.
    applyReplacements([
      { pattern: /{\\`{([aeiouAEIOU])}}/g, map: { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" } },
      { pattern: /{\\'{([aeiouAEIOU])}}/g, map: { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" } },
      { pattern: /{\\"{([aeiouAEIOU])}}/g, map: { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" } },
      { pattern: /{\\\^{([aeiouAEIOU])}}/g, map: { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" } },
      { pattern: /{\\~{([nNaAoO])}}/g, map: { n: "ñ", N: "Ñ", a: "ã", o: "õ", A: "Ã", O: "Õ" } },
      { pattern: /{\\c{([cC])}}/g, map: { c: "ç", C: "Ç" } },
    ]);

    // 2. Command with braced argument: \`{a}, \'{e}, \"{u}, etc.
    applyReplacements([
      { pattern: /\\`{([aeiouAEIOU])}/g, map: { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" } },
      { pattern: /\\'{([aeiouAEIOU])}/g, map: { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" } },
      { pattern: /\\"{([aeiouAEIOU])}/g, map: { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" } },
      { pattern: /\\\^{([aeiouAEIOU])}/g, map: { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" } },
      { pattern: /\\~{([nNaAoO])}/g, map: { n: "ñ", N: "Ñ", a: "ã", o: "õ", A: "Ã", O: "Õ" } },
      { pattern: /\\c{([cC])}/g, map: { c: "ç", C: "Ç" } },
    ]);

    // 3. Braced forms: {\`a}, {\'e}, {\"u}, etc.
    applyReplacements([
      { pattern: /{\\`([aeiouAEIOU])}/g, map: { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" } },
      { pattern: /{\\'([aeiouAEIOU])}/g, map: { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" } },
      { pattern: /{\\"([aeiouAEIOU])}/g, map: { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" } },
      { pattern: /{\\\^([aeiouAEIOU])}/g, map: { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" } },
      { pattern: /{\\~([nNaAoO])}/g, map: { n: "ñ", N: "Ñ", a: "ã", o: "õ", A: "Ã", O: "Õ" } },
    ]);

    // 4. Simple forms: \`a, \'e, \"u, etc.
    applyReplacements([
      { pattern: /\\`([aeiouAEIOU])/g, map: { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" } },
      { pattern: /\\'([aeiouAEIOU])/g, map: { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" } },
      { pattern: /\\"([aeiouAEIOU])/g, map: { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" } },
      { pattern: /\\\^([aeiouAEIOU])/g, map: { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" } },
      { pattern: /\\~([nNaAoO])/g, map: { n: "ñ", N: "Ñ", a: "ã", o: "õ", A: "Ã", O: "Õ" } },
    ]);

    // 5. Special characters
    result = result
      .replace(/\\ae/g, "æ").replace(/\\AE/g, "Æ")
      .replace(/\\oe/g, "œ").replace(/\\OE/g, "Œ")
      .replace(/\\aa/g, "å").replace(/\\AA/g, "Å")
      .replace(/\\o\b/g, "ø").replace(/\\O\b/g, "Ø")
      .replace(/\\ss/g, "ß");

    return result;
  }
}
