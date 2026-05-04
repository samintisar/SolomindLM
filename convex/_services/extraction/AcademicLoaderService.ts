"use node";

import { MistralOCRService } from "./MistralOCRService";
import { WebLoaderService } from "./WebLoaderService";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { env } from "../../_lib/env";

export interface AcademicPaper {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string;
  pdfUrl?: string;
  source: "arxiv" | "semantic_scholar" | "pubmed";
  citationCount?: number;
  doi?: string;
}

export class AcademicLoaderService {
  private mistralOCR: MistralOCRService;
  private loadWebPage: (url: string) => Promise<{ title: string; content: string }>;

  constructor(loadWebPage?: (url: string) => Promise<{ title: string; content: string }>) {
    this.mistralOCR = new MistralOCRService(env.MISTRAL_API_KEY);
    this.loadWebPage =
      loadWebPage ??
      (async (url: string) => {
        const loader = new WebLoaderService();
        return loader.loadWebPageWithMeta(url);
      });
  }

  async loadPaper(
    paper: AcademicPaper
  ): Promise<{ title: string; content: string; source: AcademicPaper["source"] }> {
    const logger = createServiceLogger("academic_loader", "loadPaper");
    logger.operationStart({ title: paper.title, source: paper.source });

    // 1. If pdfUrl exists, download PDF and pass to MistralOCRService.processDocument
    if (paper.pdfUrl) {
      try {
        logger.info("Attempting PDF OCR", { pdfUrl: paper.pdfUrl });
        const content = await this.mistralOCR.processDocument(paper.pdfUrl);
        logger.operationComplete({
          method: "pdf_ocr",
          contentLength: content.length,
        });
        return { title: paper.title, content, source: paper.source };
      } catch (error) {
        logger.warn("PDF OCR failed, falling back to web scraping", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 2. If no PDF but URL exists, use loadWebPage to scrape
    if (paper.url) {
      try {
        logger.info("Attempting web scrape", { url: paper.url });
        const result = await this.loadWebPage(paper.url);
        logger.operationComplete({
          method: "web_scrape",
          contentLength: result.content.length,
        });
        return {
          title: result.title || paper.title,
          content: result.content,
          source: paper.source,
        };
      } catch (error) {
        logger.warn("Web scrape failed, falling back to metadata", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 3. If neither works, return structured markdown from metadata
    const content = this.buildFallbackMarkdown(paper);
    logger.operationComplete({
      method: "metadata_fallback",
      contentLength: content.length,
    });
    return { title: paper.title, content, source: paper.source };
  }

  private buildFallbackMarkdown(paper: AcademicPaper): string {
    const parts: string[] = [];

    parts.push(`# ${paper.title}`);
    parts.push("");

    if (paper.authors?.length) {
      parts.push(`**Authors:** ${paper.authors.join(", ")}`);
      parts.push("");
    }

    if (paper.year !== undefined) {
      parts.push(`**Year:** ${paper.year}`);
      parts.push("");
    }

    if (paper.doi) {
      parts.push(`**DOI:** ${paper.doi}`);
      parts.push("");
    }

    if (paper.citationCount !== undefined) {
      parts.push(`**Citations:** ${paper.citationCount}`);
      parts.push("");
    }

    parts.push("## Abstract");
    parts.push("");
    parts.push(paper.abstract);

    return parts.join("\n");
  }
}
