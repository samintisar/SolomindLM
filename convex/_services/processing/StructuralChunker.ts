"use node";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { countTokens } from "../../_agents/_shared/tokenizer.js";

/**
 * Chunk-level metadata extracted during chunking.
 * Provides context for RAG retrieval and LLM grounding.
 */
export interface ChunkMetadata {
  chunkIndex: number;
  totalChunks: number;
  relativePosition: number;
  chunkLengthChars: number;
  wordCount: number;
  sentenceCount: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  sectionLevel: number | null;
  headingPath: string[];
  previousChunkPreview: string | null;
  nextChunkPreview: string | null;
  hasCodeBlock: boolean;
  hasMathNotation: boolean;
  hasTable: boolean;
  hasBulletList: boolean;
  hasNumberedList: boolean;
}

/**
 * A chunk with its content and metadata.
 */
export interface ChunkWithMetadata {
  content: string;
  metadata: ChunkMetadata;
}

/**
 * Represents a section in the document (bounded by headings).
 */
interface DocumentSection {
  content: string;
  headingPath: string[];
  level: number;
  pageNumber: number;
  startOffset: number;
}

/**
 * Structural Chunker
 *
 * Enhanced text chunker that preserves document structure context.
 * Wraps LangChain's RecursiveCharacterTextSplitter with metadata extraction.
 */
export class StructuralChunker {
  private headingStack: Array<{ level: number; title: string }> = [];
  private currentPageNumber: number = 1;

  /**
   * Chunk document with structural context.
   *
   * @param document - Full document text
   * @param chunkSize - Target chunk size in tokens (default 1000)
   * @param chunkOverlap - Overlap between chunks in tokens (default 200)
   * @returns Array of chunks with metadata
   */
  async chunk(
    document: string,
    chunkSize: number = 1000,
    chunkOverlap: number = 200
  ): Promise<ChunkWithMetadata[]> {
    // Reset state
    this.headingStack = [];
    this.currentPageNumber = 1;

    // Parse document into sections (by headings)
    const sections = this.parseIntoSections(document);

    const chunks: ChunkWithMetadata[] = [];
    let globalChunkIndex = 0;

    // Process each section
    for (const section of sections) {
      // Split section content into chunks
      const sectionChunks = await this.chunkSection(section.content, chunkSize, chunkOverlap);

      for (const chunkContent of sectionChunks) {
        const metadata = this.extractChunkMetadata(
          chunkContent,
          globalChunkIndex,
          section,
          chunks.length > 0 ? chunks[chunks.length - 1].content : null
        );

        chunks.push({ content: chunkContent, metadata });
        globalChunkIndex++;
      }
    }

    // Post-process: add totalChunks, relativePosition, and nextChunkPreview
    const totalChunks = chunks.length;
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].metadata.totalChunks = totalChunks;
      chunks[i].metadata.relativePosition = totalChunks > 1 ? i / (totalChunks - 1) : 0;

      if (i < chunks.length - 1) {
        chunks[i].metadata.nextChunkPreview = chunks[i + 1].content.slice(0, 100);
      }
    }

    return chunks;
  }

  /**
   * Parse document into sections based on headings.
   */
  private parseIntoSections(document: string): DocumentSection[] {
    const lines = document.split("\n");
    const sections: DocumentSection[] = [];

    let currentSection: DocumentSection = {
      content: "",
      headingPath: [],
      level: 0,
      pageNumber: 1,
      startOffset: 0,
    };

    for (const line of lines) {
      // Detect markdown headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        // Save previous section if it has content
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }

        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        // Update heading stack
        this.updateHeadingStack(level, title);

        // Start new section
        currentSection = {
          content: "",
          headingPath: this.headingStack.map((h) => h.title),
          level,
          pageNumber: this.currentPageNumber,
          startOffset: 0, // Track approximate position if needed
        };
      } else if (line.includes("\x0C") || line.includes("PAGE_BREAK")) {
        // Form feed or explicit page break marker
        this.currentPageNumber++;
      } else {
        currentSection.content += line + "\n";
      }
    }

    // Don't forget the last section
    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Update the heading stack to maintain the current path.
   */
  private updateHeadingStack(level: number, title: string): void {
    // Remove headings at same or deeper level (we're entering a new sibling or parent)
    while (
      this.headingStack.length > 0 &&
      this.headingStack[this.headingStack.length - 1].level >= level
    ) {
      this.headingStack.pop();
    }

    this.headingStack.push({ level, title });
  }

  /**
   * Extract metadata for a single chunk.
   */
  private extractChunkMetadata(
    content: string,
    chunkIndex: number,
    section: DocumentSection,
    previousChunkContent: string | null
  ): ChunkMetadata {
    const words = content
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    return {
      chunkIndex,
      totalChunks: 0, // Will be set in post-processing
      relativePosition: 0, // Will be set in post-processing
      chunkLengthChars: content.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      pageNumber: section.pageNumber > 1 ? section.pageNumber : null,
      sectionTitle:
        section.headingPath.length > 0 ? section.headingPath[section.headingPath.length - 1] : null,
      sectionLevel: section.level > 0 ? section.level : null,
      headingPath: section.headingPath,
      previousChunkPreview: previousChunkContent ? previousChunkContent.slice(-100) : null,
      nextChunkPreview: null, // Will be set in post-processing
      hasCodeBlock: this.detectCodeBlock(content),
      hasMathNotation: this.detectMathNotation(content),
      hasTable: this.detectTable(content),
      hasBulletList: this.detectBulletList(content),
      hasNumberedList: this.detectNumberedList(content),
    };
  }

  /**
   * Chunk a section's content using LangChain splitter.
   */
  private async chunkSection(
    content: string,
    chunkSize: number,
    chunkOverlap: number
  ): Promise<string[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ["\n\n", "\n", ". ", " ", ""],
      lengthFunction: (t) => countTokens(t),
    });

    return await splitter.splitText(content);
  }

  // Content detection helpers

  private detectCodeBlock(content: string): boolean {
    return /```[\s\S]*?```/.test(content) || /`[^`\n]+`/.test(content);
  }

  private detectMathNotation(content: string): boolean {
    return /\$\$[\s\S]*?\$\$/.test(content) || /\$[^$\n]+?\$/.test(content);
  }

  private detectTable(content: string): boolean {
    return /^\|.+\|[\r\n]+\|[-:| ]+\|/m.test(content);
  }

  private detectBulletList(content: string): boolean {
    return /^[\s]*[-*]\s/m.test(content);
  }

  private detectNumberedList(content: string): boolean {
    return /^[\s]*\d+\.\s/m.test(content);
  }
}

/**
 * Utility function to chunk text with structural metadata.
 * Convenience wrapper for the StructuralChunker class.
 */
export async function chunkWithMetadata(
  text: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Promise<ChunkWithMetadata[]> {
  const chunker = new StructuralChunker();
  return chunker.chunk(text, chunkSize, chunkOverlap);
}
