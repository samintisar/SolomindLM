"use node";

import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse, ExternalServiceError } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { UserFacingSourceError } from "../../_lib/sourceFailure";
import { PAGE_LABEL_LINES } from "../processing/pageLabels";

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

/** A figure description on one line, for a placeholder that shares its line (a table cell, a sentence). */
function figureInline(annotation: FigureAnnotation): string {
  const head = `**Figure (${annotation.kind}):** ${annotation.description}`;
  const text = annotation.details ? `${head} Details: ${annotation.details}` : head;
  return text.replace(/\|/g, "\\|");
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Private-use marks hold each figure's place while `cleanText` runs; no media regex touches them. */
const figureMark = (index: number) => `${index}`;
const FIGURE_MARK_ON_OWN_LINE = /^[ \t]*(\d+)[ \t]*$/gm;
const FIGURE_MARK = /(\d+)/g;

/**
 * OCR leaves `![img-0.jpeg](img-0.jpeg)` where each figure was. Put the figure's description there: a blockquote
 * when the placeholder has its own line, one line otherwise, so table rows and sentences stay intact. A described
 * figure without a placeholder goes at the page end. Skipped figures keep their placeholder, which
 * `stripMistralOcrMedia` removes. `cleanText` runs on the OCR text before the descriptions go in, so it never
 * edits them.
 */
export function inlineOcrFigures(
  markdown: string,
  images: MistralOcrImage[] | undefined,
  onMalformed?: (imageId: string) => void,
  cleanText: (text: string) => string = (text) => text
): string {
  const placed: FigureAnnotation[] = [];
  const unplaced: FigureAnnotation[] = [];
  let md = markdown;
  for (const image of images ?? []) {
    if (!image.id) continue;
    // `||`: an empty image_annotation must not hide a bbox_annotation.
    const parsed = parseFigureAnnotation(image.image_annotation || image.bbox_annotation);
    if (parsed.status === "malformed") onMalformed?.(image.id);
    if (parsed.status !== "ok") continue;
    const placeholder = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(image.id)}\\)`);
    if (placeholder.test(md)) {
      md = md.replace(placeholder, figureMark(placed.length));
      placed.push(parsed.annotation);
    } else {
      unplaced.push(parsed.annotation);
    }
  }
  // Function replacers: descriptions can contain "$", which a string replacement would interpret.
  md = cleanText(md)
    .replace(FIGURE_MARK_ON_OWN_LINE, (_, i) => figureBlock(placed[Number(i)]))
    .replace(FIGURE_MARK, (_, i) => figureInline(placed[Number(i)]));
  for (const annotation of unplaced) md = `${md.trimEnd()}\n\n${figureBlock(annotation)}`;
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

export type MistralOcrResponse = {
  pages?: Array<{ markdown?: string; tables?: MistralOcrTable[]; images?: MistralOcrImage[] }>;
  markdown?: string;
  text?: string;
};

/**
 * Stitch OCR pages into one markdown string with visible page labels (HTML comments are hidden when rendered).
 * Tables and figure descriptions are put back where OCR left their placeholders. `cleanText` runs on each page's
 * OCR text, but not on the figure descriptions.
 */
export function markdownFromMistralOcrResponse(
  data: MistralOcrResponse,
  options: {
    onMalformedAnnotation?: (imageId: string) => void;
    cleanText?: (text: string) => string;
  } = {}
): string {
  if (data?.pages && Array.isArray(data.pages) && data.pages.length > 0) {
    return data.pages
      .map((page, index) => {
        const withTables = inlineOcrTables(page.markdown || "", page.tables);
        const md = inlineOcrFigures(
          withTables,
          page.images,
          options.onMalformedAnnotation,
          options.cleanText
        );
        const label = `**Page ${index + 1}**`;
        return index === 0 ? `${label}\n\n${md}` : `---\n\n${label}\n\n${md}`;
      })
      .join("\n\n");
  }
  const text = data.markdown || data.text || "";
  return options.cleanText ? options.cleanText(text) : text;
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

/**
 * Whether stitched OCR markdown holds anything beyond page labels and separators. Run it after
 * `stripMistralOcrMedia`: leftover image placeholders would otherwise count as content.
 */
export function hasOcrContent(markdown: string): boolean {
  return (
    markdown
      .replace(PAGE_LABEL_LINES, "")
      .replace(/^-{3,}[ \t]*$/gm, "")
      .trim().length > 0
  );
}

const OCR_MODEL = "mistral-ocr-latest";

/** File extensions OCR reads as a single image rather than a paged document. */
export const IMAGE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".avif"];

export type OcrInputKind = "image" | "document";

/** Storage URLs carry no extension, so callers decide the input kind from the file name. */
export function ocrInputKindForFile(fileName: string): OcrInputKind {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return IMAGE_FILE_EXTENSIONS.includes(ext) ? "image" : "document";
}

/** Schema for a figure description; its field descriptions steer the annotating model for any source. */
const FIGURE_ANNOTATION_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "figure_annotation",
    strict: true,
    schema: {
      title: "FigureAnnotation",
      type: "object",
      additionalProperties: false,
      required: ["kind", "description", "details"],
      properties: {
        kind: {
          type: "string",
          enum: ["chart", "diagram", "table", "photo", "screenshot", "equation", "logo", "other"],
          description: "What the image is.",
        },
        description: {
          type: "string",
          description: "What the image shows, in one or two plain sentences.",
        },
        details: {
          type: "string",
          description:
            "Text, labels, axis titles, values and trends visible in the image that a reader would need to answer questions about it. Empty for decorative images.",
        },
      },
    },
  },
};

export function buildOcrRequestBody(
  url: string,
  kind: OcrInputKind,
  annotate: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: OCR_MODEL,
    document:
      kind === "image"
        ? { type: "image_url", image_url: url }
        : { type: "document_url", document_url: url },
    table_format: "markdown",
    include_image_base64: false,
  };
  // No document_annotation_format: it restates the OCR text and invents content for photos.
  if (annotate) body.bbox_annotation_format = FIGURE_ANNOTATION_FORMAT;
  return body;
}

/**
 * Annotations add a vision pass per figure (13s for a 24-page paper with 22 figures); the plain fallback is the
 * request that worked before them, with its old 60s timeout and 3 attempts. Capping the annotated call at 2
 * attempts keeps the worst case (every attempt a slow 5xx) at 2 × 90s + 3 × 60s = 360s, plus at most ~5s of
 * retry backoff (1s and 2s delays, ±25% jitter). That leaves ~235s of the embedding job's 600s action limit for a
 * web scrape before OCR (links that serve a PDF, `urlSource`) or after it (`AcademicLoaderService`'s fallback),
 * then chunking and embedding. Each attempt's timeout covers reading the body too, so these bounds hold.
 */
const ANNOTATED_TIMEOUT_MS = 90_000;
const ANNOTATED_MAX_ATTEMPTS = 2;
const PLAIN_TIMEOUT_MS = 60_000;

export const NOTHING_READABLE_MESSAGE =
  "We couldn't find any text or images to read in this file. If it's a photo, try a clearer or higher-resolution version.";

export class MistralOcrTimeoutError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Mistral OCR request timed out", options);
    this.name = "MistralOcrTimeoutError";
  }
}

/** Rejections the plain request would get too: bad key, no access, unfetchable URL, file too large, rate limit. */
const STATUSES_PLAIN_OCR_SHARES = [401, 403, 404, 413, 429];

/**
 * Whether a failed annotated request should be retried as plain OCR: a timeout, a server error that outlasted
 * `invokeWithHttpRetry` (the annotation pass can fail where plain OCR works), or a rejection the annotations
 * may have caused.
 */
export function shouldRetryWithoutAnnotations(error: unknown): boolean {
  if (error instanceof MistralOcrTimeoutError) return true;
  if (!(error instanceof ExternalServiceError) || error.statusCode === undefined) return false;
  const status = error.statusCode;
  if (status >= 500) return true;
  return status >= 400 && status < 500 && !STATUSES_PLAIN_OCR_SHARES.includes(status);
}

export class MistralOCRService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callOcrEndpoint(
    body: Record<string, unknown>,
    timeoutMs: number,
    maxAttempts?: number
  ): Promise<MistralOcrResponse> {
    const logger = createServiceLogger("mistral", "ocr");

    return invokeWithHttpRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const t0 = Date.now();
          logger.apiCall("mistral", "/ocr", { model: OCR_MODEL });

          const response = await fetch(`${this.baseUrl}/ocr`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          // The timer stays armed while the body streams in: a response that stalls after its headers still times out.
          // Read text, not JSON: error bodies from gateways are HTML and must still become a status-coded error.
          const raw = await response.text();

          if (!response.ok) {
            logger.apiError("mistral", "/ocr", new Error(`HTTP ${response.status}`));
            throw createExternalServiceErrorFromResponse(
              "mistral",
              response.status,
              "/ocr",
              (raw || response.statusText).slice(0, 400)
            );
          }

          logger.apiSuccess("mistral", "/ocr", Date.now() - t0, {});
          return JSON.parse(raw) as MistralOcrResponse;
        } catch (error) {
          if (error instanceof Error) {
            if (error.name === "AbortError") {
              throw new MistralOcrTimeoutError({ cause: error });
            }
            throw error;
          }
          throw new Error("Failed to process document with Mistral OCR", { cause: error });
        } finally {
          clearTimeout(timeoutId);
        }
      },
      "mistral_ocr",
      maxAttempts ? { maxAttempts } : undefined
    );
  }

  /**
   * OCR a file into page-labelled markdown with figure descriptions. `kind` must be "image" for
   * PNG/JPEG/AVIF files (see `ocrInputKindForFile`). Throws `UserFacingSourceError` when the file
   * has no text and no describable images.
   */
  async processDocument(url: string, options: { kind?: OcrInputKind } = {}): Promise<string> {
    const kind = options.kind ?? "document";
    const logger = createServiceLogger("mistral", "ocr");

    let data: MistralOcrResponse;
    try {
      data = await this.callOcrEndpoint(
        buildOcrRequestBody(url, kind, true),
        ANNOTATED_TIMEOUT_MS,
        ANNOTATED_MAX_ATTEMPTS
      );
    } catch (error) {
      if (!shouldRetryWithoutAnnotations(error)) throw error;
      logger.warn("OCR with figure annotations failed; retrying without annotations", {
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
      // Exactly the request that worked before annotations, images included (they were sent as documents).
      data = await this.callOcrEndpoint(
        buildOcrRequestBody(url, "document", false),
        PLAIN_TIMEOUT_MS
      );
    }

    const markdown = markdownFromMistralOcrResponse(data, {
      onMalformedAnnotation: (imageId) =>
        logger.warn("Skipped a malformed figure annotation", { imageId }),
      cleanText: stripMistralOcrMedia,
    });
    if (!hasOcrContent(markdown)) {
      throw new UserFacingSourceError(
        NOTHING_READABLE_MESSAGE,
        "Mistral OCR returned no text or figure descriptions"
      );
    }
    return markdown;
  }
}
