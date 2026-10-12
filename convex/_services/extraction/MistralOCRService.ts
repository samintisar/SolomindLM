"use node";

import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

type MistralOcrTable = { id?: string; content?: string; format?: string };

/** OCR returns a figure's annotation under one of these names, as a JSON string or an object. */
type MistralOcrImage = { id?: string; image_annotation?: unknown; bbox_annotation?: unknown };

export interface FigureAnnotation {
  kind: string;
  description: string;
  details: string;
}

type ParsedFigureAnnotation =
  | { status: "ok"; annotation: FigureAnnotation }
  | { status: "skip" }
  | { status: "malformed" };

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * A figure annotation worth keeping. Absent, empty and logo annotations are skipped (decoration);
 * an annotation that isn't JSON or lacks a description is malformed.
 */
export function parseFigureAnnotation(raw: unknown): ParsedFigureAnnotation {
  if (raw === undefined || raw === null || raw === "") return { status: "skip" };
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { status: "malformed" };
    }
  }
  if (typeof value !== "object" || value === null) return { status: "malformed" };
  const { kind, description, details } = value as Record<string, unknown>;
  if (typeof description !== "string") return { status: "malformed" };
  const text = oneLine(description);
  if (!text || kind === "logo") return { status: "skip" };
  return {
    status: "ok",
    annotation: {
      kind: typeof kind === "string" && kind.trim() ? oneLine(kind) : "other",
      description: text,
      details: typeof details === "string" ? oneLine(details) : "",
    },
  };
}

/** A figure description as a blockquote, so chunks and the source viewer show it as quoted figure text. */
export function figureBlock(annotation: FigureAnnotation): string {
  const head = `> **Figure (${annotation.kind}):** ${annotation.description}`;
  return annotation.details ? `${head}\n> Details: ${annotation.details}` : head;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * OCR leaves `![img-0.jpeg](img-0.jpeg)` where each figure was. Put the figure's description there;
 * a described figure without a placeholder goes at the page end. Skipped figures keep their
 * placeholder, which `stripMistralOcrMedia` removes.
 */
export function inlineOcrFigures(
  markdown: string,
  images: MistralOcrImage[] | undefined,
  onMalformed?: (imageId: string) => void
): string {
  let md = markdown;
  for (const image of images ?? []) {
    if (!image.id) continue;
    const parsed = parseFigureAnnotation(image.image_annotation ?? image.bbox_annotation);
    if (parsed.status === "malformed") onMalformed?.(image.id);
    if (parsed.status !== "ok") continue;
    const block = figureBlock(parsed.annotation);
    const placeholder = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(image.id)}\\)`);
    // Function replacer: descriptions can contain "$", which a string replacement would interpret.
    md = placeholder.test(md)
      ? md.replace(placeholder, () => block)
      : `${md.trimEnd()}\n\n${block}`;
  }
  return md;
}

/**
 * With `table_format` set, OCR returns each table in `tables` and leaves a link
 * placeholder (`[tbl-0.md](tbl-0.md)`) in the page markdown. Put the table back
 * where its placeholder is; a table without a placeholder goes at the page end.
 */
function inlineOcrTables(markdown: string, tables: MistralOcrTable[] | undefined): string {
  let md = markdown;
  for (const table of tables ?? []) {
    if (!table.id || !table.content) continue;
    const placeholder = `[${table.id}](${table.id})`;
    const content = table.content.trim();
    // Function replacer: table text often contains "$" (prices), which a string replacement would interpret.
    md = md.includes(placeholder)
      ? md.replace(placeholder, () => content)
      : `${md.trimEnd()}\n\n${content}`;
  }
  return md;
}

/**
 * Stitch OCR pages into one markdown string with visible page labels (HTML comments are hidden when rendered).
 */
export function markdownFromMistralOcrResponse(data: {
  pages?: Array<{ markdown?: string; tables?: MistralOcrTable[] }>;
  markdown?: string;
  text?: string;
}): string {
  if (data?.pages && Array.isArray(data.pages) && data.pages.length > 0) {
    return data.pages
      .map((page, index) => {
        const md = inlineOcrTables(page.markdown || "", page.tables);
        const label = `**Page ${index + 1}**`;
        return index === 0 ? `${label}\n\n${md}` : `---\n\n${label}\n\n${md}`;
      })
      .join("\n\n");
  }
  return data.markdown || data.text || "";
}

/**
 * Strip all media references from text (images, videos, audio, etc.)
 * This ensures only text content is returned
 */
function stripMistralOcrMedia(text: string): string {
  return (
    text
      // Remove markdown images: ![alt](url) or ![alt][ref]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
      .replace(/!\[([^\]]*)\]\[[^\]]+\]/g, "")
      // Remove reference-style image definitions: [id]: url
      .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
      // Remove HTML <img> tags
      .replace(/<img[^>]*>/gi, "")
      .replace(/<img[^>]*\/>/gi, "")
      // Remove HTML <video> tags
      .replace(/<video[^>]*>.*?<\/video>/gis, "")
      // Remove HTML <audio> tags
      .replace(/<audio[^>]*>.*?<\/audio>/gis, "")
      // Remove HTML <picture> tags
      .replace(/<picture[^>]*>.*?<\/picture>/gis, "")
      // Remove HTML <source> tags
      .replace(/<source[^>]*>/gi, "")
      .replace(/<source[^>]*\/>/gi, "")
      // Remove HTML <embed> tags
      .replace(/<embed[^>]*>/gi, "")
      .replace(/<embed[^>]*\/>/gi, "")
      // Remove HTML <object> tags
      .replace(/<object[^>]*>.*?<\/object>/gis, "")
      // Remove HTML <figure> tags with media (keep caption text)
      .replace(/<figure[^>]*>(.*?)<\/figure>/gis, (_, content) => {
        // Extract text from <figcaption> if present, otherwise remove
        const figcaption = content.match(/<figcaption[^>]*>(.*?)<\/figcaption>/is);
        return figcaption ? figcaption[1].trim() : "";
      })
      // Remove SVG elements
      .replace(/<svg[^>]*>.*?<\/svg>/gis, "")
      // Remove data URIs (embedded images)
      .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
      .replace(/data:video\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
      .replace(/data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
      // Remove markdown-style media file references
      .replace(
        /\[([^\]]*)\]\([^)]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)[^)]*\)/gi,
        ""
      )
      // Remove standalone media URLs (http/https)
      .replace(
        /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)(\?[^\s]*)?\b/gi,
        ""
      )
      // Remove file paths with media extensions
      .replace(/[^\s]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, "")
      // Clean up extra whitespace and line breaks
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .replace(/^\s+|\s+$/g, "")
      .trim()
  );
}

export class MistralOCRService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private model = "mistral-ocr-latest";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callOcrEndpoint(documentUrl: string): Promise<string> {
    const logger = createServiceLogger("mistral", "ocr");

    return invokeWithHttpRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      try {
        const t0 = Date.now();
        logger.apiCall("mistral", "/ocr", { model: this.model });

        const response = await fetch(`${this.baseUrl}/ocr`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            document: {
              type: "document_url",
              document_url: documentUrl,
            },
            table_format: "markdown",
            include_image_base64: false,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
          const details = data ? JSON.stringify(data) : response.statusText;
          logger.apiError("mistral", "/ocr", new Error(`HTTP ${response.status}`));
          throw createExternalServiceErrorFromResponse(
            "mistral",
            response.status,
            "/ocr",
            details.slice(0, 400)
          );
        }

        logger.apiSuccess("mistral", "/ocr", Date.now() - t0, {});

        const content = markdownFromMistralOcrResponse(data);
        return stripMistralOcrMedia(content);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw new Error("Mistral OCR request timed out", { cause: error });
          }
          throw error;
        }
        throw new Error("Failed to process document with Mistral OCR", { cause: error });
      }
    }, "mistral_ocr");
  }

  async processDocument(fileUrl: string): Promise<string> {
    return this.callOcrEndpoint(fileUrl);
  }

  async processFromUrl(url: string): Promise<string> {
    return this.callOcrEndpoint(url);
  }
}
