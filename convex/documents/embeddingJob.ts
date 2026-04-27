"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { MistralOCRService } from "../_services/extraction/MistralOCRService";
import { AudioTranscriptionService } from "../_services/extraction/AudioTranscriptionService";
import { SupadataLoaderService } from "../_services/extraction/SupadataLoaderService";
import {
  extractDocumentMetadata,
  getFileExtension,
} from "../_services/processing/DocumentMetadataExtractor";
import {
  StructuralChunker,
} from "../_services/processing/StructuralChunker";
import {
  E5_RAG_CHUNK_OVERLAP_TOKENS,
  E5_RAG_CHUNK_SIZE_TOKENS,
  E5_TOGETHER_EMBED_BATCH_SIZE,
} from "../_lib/e5Embedding";
import { createJobLogger, createErrorMetadata } from "../_agents/_shared/logging";
import { resolveOpenAlexSourceUrlToArticleUrl } from "../_lib/resolveOpenAlexSourceUrl";
import { buildPaperMetadataMarkdown } from "./paperRecord";

// File extensions that require OCR processing
const OCR_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".avif", ".pdf", ".pptx", ".docx"];

const AUDIO_FILE_EXTENSIONS = [".wav", ".mp3", ".m4a", ".webm", ".flac"];

/**
 * Check if a file requires OCR processing based on its extension
 */
function needsOCR(fileName: string): boolean {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
  return OCR_FILE_EXTENSIONS.includes(ext);
}

function needsAudioTranscription(fileName: string): boolean {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
  return AUDIO_FILE_EXTENSIONS.includes(ext);
}

/**
 * True when `fileName` is still the raw URL string (or empty), not a human title from discovery or rename.
 */
function isLikelyRawUrlFileName(value: string | undefined): boolean {
  const t = (value ?? "").trim();
  if (!t) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  return false;
}

function titleForUrlDocument(
  fileName: string | undefined,
  fileUrl: string | undefined,
  extractedTitle: string | undefined
): string {
  if (!isLikelyRawUrlFileName(fileName)) {
    return (fileName ?? "").trim();
  }
  const fromPage = extractedTitle?.trim();
  if (fromPage) return fromPage;
  try {
    return new URL(fileUrl || "").hostname;
  } catch {
    return fileUrl?.trim() || "Web Page";
  }
}

/**
 * Document embedding job handler
 * This is an internal action that handles document processing and embedding
 */
export const docEmbedding = internalAction({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    "use node";

    const { documentId, userId, notebookId } = args;

    // Initialize structured logger
    const logger = createJobLogger({
      jobType: "document_embedding",
      jobId: documentId,
      notebookId,
      userId,
    });

    logger.jobStart();

    let currentPhase = "initializing";
    let fileTypeForError = "";

    try {
      // Phase: Initializing
      logger.phaseStart("initializing");
      await ctx.runMutation(internal.documents.index.updateStatus, {
        documentId,
        status: "processing",
      });
      logger.phaseComplete("initializing");

      // Phase: Loading document
      logger.phaseStart("loading_document");
      currentPhase = "loading_document";

      // Get document details
      const docDetails = await ctx.runQuery(internal.documents.index.getDocumentDetails, {
        documentId,
      });

      const notebookRow = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
        notebookId,
      });
      const chunkUserId = (notebookRow?.userId ?? userId) as string;

      logger.phaseComplete("loading_document", {
        fileType: docDetails.fileType,
        fileName: docDetails.fileName,
      });

      fileTypeForError = docDetails.fileType;

      /** For URL docs, updated when OpenAlex metadata URL is resolved to DOI / publisher. */
      let effectiveFileUrl: string | undefined = docDetails.fileUrl;

      let extractedText = "";
      let extractedTitle: string | undefined;

      // Phase: Extraction
      logger.phaseStart("extraction");
      currentPhase = "extraction";

      const mistralOCR = new MistralOCRService(process.env.MISTRAL_API_KEY || "");
      const supadataLoader = new SupadataLoaderService();

      if (docDetails.fileType === "youtube") {
        logger.info("Extracting YouTube transcript");
        const meta = await supadataLoader.loadTranscriptWithMeta(docDetails.fileUrl || "");
        extractedText = meta.content;
        if (meta.title?.trim()) extractedTitle = meta.title.trim();
        logger.phaseComplete("extraction", {
          contentLength: extractedText.length,
          title: extractedTitle,
        });
      } else if (docDetails.fileType === "text") {
        logger.info("Processing pasted text");
        // Text is already extracted, stored in metadata
        extractedText = docDetails.fileUrl || ""; // fileUrl contains the text for type 'text'
        logger.phaseComplete("extraction", { contentLength: extractedText.length });
      } else if (docDetails.fileType === "file") {
        if (!docDetails.storageId && !docDetails.fileUrl) {
          throw new Error("File storage ID or URL not found for document: " + documentId);
        }

        // Check if file is audio and needs transcription
        if (needsAudioTranscription(docDetails.fileName)) {
          logger.info("Processing audio file with transcription", {
            fileName: docDetails.fileName,
          });

          // Get file URL from Convex storage
          let fileUrl = docDetails.fileUrl;
          if (!fileUrl && docDetails.storageId) {
            fileUrl = (await ctx.storage.getUrl(docDetails.storageId)) ?? undefined;
          }

          if (!fileUrl) {
            throw new Error("Could not get file URL for audio document: " + documentId);
          }

          const audioTranscription = new AudioTranscriptionService(
            process.env.TOGETHER_AI_API_KEY || ""
          );
          extractedText = await audioTranscription.transcribe(fileUrl);
          logger.phaseComplete("extraction", {
            contentLength: extractedText.length,
            method: "audio_transcription",
          });
        } else if (needsOCR(docDetails.fileName)) {
          logger.info("Processing file with OCR", {
            fileName: docDetails.fileName,
          });

          // Get file URL from Convex storage
          let fileUrl = docDetails.fileUrl;
          if (!fileUrl && docDetails.storageId) {
            // If we have a storageId, get the URL from Convex storage
            fileUrl = (await ctx.storage.getUrl(docDetails.storageId)) ?? undefined;
          }

          if (!fileUrl) {
            throw new Error("Could not get file URL for document: " + documentId);
          }

          extractedText = await mistralOCR.processDocument(fileUrl);
          logger.phaseComplete("extraction", {
            contentLength: extractedText.length,
            method: "OCR",
          });
        } else {
          logger.info("Processing plaintext file", {
            fileName: docDetails.fileName,
          });

          // For text files, read from storage or URL
          if (docDetails.storageId) {
            // Read from Convex storage
            const file = await ctx.storage.get(docDetails.storageId);
            if (!file) {
              throw new Error("File not found in storage");
            }
            extractedText = await file.text();
          } else if (docDetails.fileUrl) {
            // For external URLs, we'd need to fetch them
            // This is a placeholder - implement URL fetching if needed
            extractedText = "";
          }
          logger.phaseComplete("extraction", {
            contentLength: extractedText.length,
            method: "direct_read",
          });
        }
      } else if (docDetails.fileType === "url") {
        logger.info("Extracting web page content");
        const rawUrl = docDetails.fileUrl || "";
        const scrapeUrl = await resolveOpenAlexSourceUrlToArticleUrl(rawUrl);
        if (scrapeUrl !== rawUrl) {
          logger.info("Resolved OpenAlex work URL to article URL for scraping", {
            from: rawUrl,
            to: scrapeUrl,
          });
          await ctx.runMutation(internal.documents.index.setDocumentFileUrl, {
            documentId,
            fileUrl: scrapeUrl,
          });
        }
        effectiveFileUrl = scrapeUrl;
        const meta = await supadataLoader.loadWebPageWithMeta(scrapeUrl);
        extractedText = meta.content;
        if (meta.title?.trim()) extractedTitle = meta.title.trim();
        logger.phaseComplete("extraction", {
          contentLength: extractedText.length,
          title: extractedTitle,
        });
      } else if (docDetails.fileType === "paper_record") {
        logger.info("Processing paper_record (OA PDF → Supadata PDF → repository/landing URLs → metadata stub)");
        const pr = docDetails.paperRecord;
        if (!pr) {
          throw new Error("paper_record document missing paperRecord");
        }
        const pdfUrl = pr.pdfUrl?.trim();
        const landing = pr.landingPageUrl?.trim();
        const primaryDocUrl = docDetails.fileUrl?.trim();
        let paperIngestion: "ingested" | "metadata_only" = "metadata_only";

        if (pdfUrl) {
          try {
            extractedText = await mistralOCR.processDocument(pdfUrl);
            if (extractedText?.trim()) {
              paperIngestion = "ingested";
              logger.phaseComplete("extraction", {
                contentLength: extractedText.length,
                method: "oa_pdf_ocr",
              });
            }
          } catch (e) {
            logger.warn("OA PDF extraction failed", { message: e instanceof Error ? e.message : String(e) });
          }
        }

        // Mistral often fails on institutional PDFs; Supadata may still extract text from the same URL.
        if (!extractedText?.trim() && pdfUrl) {
          try {
            const meta = await supadataLoader.loadWebPageWithMeta(pdfUrl);
            extractedText = meta.content;
            if (meta.title?.trim()) extractedTitle = meta.title.trim();
            if (extractedText?.trim()) {
              paperIngestion = "ingested";
              logger.phaseComplete("extraction", {
                contentLength: extractedText.length,
                title: extractedTitle,
                method: "oa_pdf_scrape",
              });
            }
          } catch (e) {
            logger.warn("Supadata PDF URL failed", {
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // Landing from OpenAlex is sometimes missing even when `fileUrl` (DOI, handle, publisher) is set.
        const scrapeUrls = [...new Set([landing, primaryDocUrl].filter(Boolean) as string[])];
        for (const url of scrapeUrls) {
          if (extractedText?.trim()) break;
          if (url === pdfUrl) continue;
          try {
            const meta = await supadataLoader.loadWebPageWithMeta(url);
            extractedText = meta.content;
            if (meta.title?.trim()) extractedTitle = meta.title.trim();
            if (extractedText?.trim()) {
              paperIngestion = "ingested";
              logger.phaseComplete("extraction", {
                contentLength: extractedText.length,
                title: extractedTitle,
                method: "repository_or_landing_scrape",
              });
              break;
            }
          } catch (e) {
            logger.warn("Scrape failed for paper URL", {
              url: url.slice(0, 80),
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }

        if (!extractedText?.trim()) {
          extractedText = buildPaperMetadataMarkdown(pr, docDetails.fileName || "Research paper");
          paperIngestion = "metadata_only";
          logger.phaseComplete("extraction", {
            contentLength: extractedText.length,
            method: "metadata_stub",
          });
        }

        await ctx.runMutation(internal.documents.index.patch, {
          documentId,
          patch: { ingestionStatus: paperIngestion },
        });
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text extracted from document");
      }

      // Sanitize extracted text
      const originalLength = extractedText.length;
      extractedText = extractedText.split("\u0000").join("");
      if (originalLength !== extractedText.length) {
        logger.warn("Removed null bytes from text", {
          bytesRemoved: originalLength - extractedText.length,
        });
      }

      logger.info("Text extraction complete", { contentLength: extractedText.length });

      // Full markdown for source viewer / copy (no overlapping chunk boundaries).
      // Convex document field limit ~1MB UTF-8; cap stored copy for huge PDFs.
      const MAX_STORED_MARKDOWN_CHARS = 800_000;
      let extractedMarkdownForUi = extractedText;
      if (extractedMarkdownForUi.length > MAX_STORED_MARKDOWN_CHARS) {
        extractedMarkdownForUi =
          extractedMarkdownForUi.slice(0, MAX_STORED_MARKDOWN_CHARS) +
          "\n\n---\n\n**Note:** Display copy was truncated for a very large document. Use **Original PDF** to view the full file.";
      }
      await ctx.runMutation(internal.documents.index.setExtractedMarkdown, {
        documentId,
        extractedMarkdown: extractedMarkdownForUi,
      });

      // Phase: Chunking
      logger.phaseStart("chunking");
      currentPhase = "chunking";

      const fileExtension = getFileExtension(docDetails.fileName);
      const docMetadata = extractDocumentMetadata(extractedText, fileExtension);
      logger.info("Document metadata extracted", {
        wordCount: docMetadata.wordCount,
        readingTime: docMetadata.estimatedReadingTimeMinutes,
        structure: docMetadata.documentStructure,
        language: docMetadata.language,
      });

      // E5 (Together) max ~512 real tokens; chunk below that so RAG index matches embed input (see e5Embedding)
      const chunker = new StructuralChunker();
      const chunksWithMetadata = await chunker.chunk(
        extractedText,
        E5_RAG_CHUNK_SIZE_TOKENS,
        E5_RAG_CHUNK_OVERLAP_TOKENS
      );

      logger.phaseComplete("chunking", { chunkCount: chunksWithMetadata.length });

      // Phase: Setting title
      logger.phaseStart("setting_title");
      currentPhase = "setting_title";

      let title: string;

      if (docDetails.fileType === "file") {
        // Keep full file name (with extension) so the UI can show correct type (PDF, DOCX, etc.)
        title = docDetails.fileName || "";
      } else if (docDetails.fileType === "url") {
        title = titleForUrlDocument(docDetails.fileName, effectiveFileUrl, extractedTitle);
      } else if (docDetails.fileType === "youtube") {
        title =
          extractedTitle ||
          (() => {
            const match = (docDetails.fileUrl || "").match(
              /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
            );
            return match ? `YouTube: ${match[1]}` : "YouTube Video";
          })();
      } else if (docDetails.fileType === "paper_record") {
        title = (docDetails.fileName || "").trim() || extractedTitle || "Research paper";
      } else {
        // For text input
        title = "Pasted Text";
      }

      logger.info("Title set", { title });

      await ctx.runMutation(internal.documents.index.updateTitle, {
        documentId,
        title,
      });

      // Store document-level metadata
      await ctx.runMutation(internal.documents.index.updateMetadata, {
        documentId,
        metadata: {
          wordCount: docMetadata.wordCount,
          estimatedReadingTimeMinutes: docMetadata.estimatedReadingTimeMinutes,
          totalPages: docMetadata.totalPages ?? undefined,
          totalChunks: chunksWithMetadata.length,
          hasCodeBlocks: docMetadata.hasCodeBlocks,
          hasMathNotation: docMetadata.hasMathNotation,
          hasTables: docMetadata.hasTables,
          hasImages: docMetadata.hasImages,
          language: docMetadata.language,
          documentStructure: docMetadata.documentStructure,
          maxHeadingLevel: docMetadata.maxHeadingLevel,
        },
      });

      logger.phaseComplete("setting_title");

      // Phase: Embedding
      logger.phaseStart("embedding");
      currentPhase = "embedding";

      const embeddingTimer = logger.createTimer();

      // Together E5: batched `input: string[]` (fewer HTTP calls than one-per-chunk) + sequential batches to avoid 429s
      const chunkTexts = chunksWithMetadata.map((c) => c.content);
      const embeddingVectors: number[][] = [];
      for (let off = 0; off < chunkTexts.length; off += E5_TOGETHER_EMBED_BATCH_SIZE) {
        const batch = chunkTexts.slice(off, off + E5_TOGETHER_EMBED_BATCH_SIZE);
        const part = await ctx.runAction(
          internal._services.ai.embeddings.generateEmbeddingsBatchInternal,
          { texts: batch, inputType: "passage" }
        );
        embeddingVectors.push(...part);
      }

      const embeddingDuration = embeddingTimer.end();
      logger.phaseComplete("embedding", {
        chunkCount: chunksWithMetadata.length,
        durationMs: embeddingDuration,
      });

      // Phase: Storing chunks
      logger.phaseStart("storing_chunks");
      currentPhase = "storing_chunks";

      // Store chunks with embeddings and metadata
      for (let i = 0; i < chunksWithMetadata.length; i++) {
        const chunk = chunksWithMetadata[i];
        await ctx.runMutation(internal.documents.index.storeChunk, {
          documentId,
          userId: chunkUserId as any,
          notebookId,
          content: chunk.content,
          chunkIndex: chunk.metadata.chunkIndex,
          embedding: embeddingVectors[i],
          metadata: {
            totalChunks: chunk.metadata.totalChunks ?? undefined,
            relativePosition: chunk.metadata.relativePosition ?? undefined,
            chunkLengthChars: chunk.metadata.chunkLengthChars ?? undefined,
            wordCount: chunk.metadata.wordCount ?? undefined,
            sentenceCount: chunk.metadata.sentenceCount ?? undefined,
            pageNumber: chunk.metadata.pageNumber ?? undefined,
            sectionTitle: chunk.metadata.sectionTitle ?? undefined,
            sectionLevel: chunk.metadata.sectionLevel ?? undefined,
            headingPath: chunk.metadata.headingPath ?? undefined,
            previousChunkPreview: chunk.metadata.previousChunkPreview ?? undefined,
            nextChunkPreview: chunk.metadata.nextChunkPreview ?? undefined,
            hasCodeBlock: chunk.metadata.hasCodeBlock ?? undefined,
            hasMathNotation: chunk.metadata.hasMathNotation ?? undefined,
            hasTable: chunk.metadata.hasTable ?? undefined,
            hasBulletList: chunk.metadata.hasBulletList ?? undefined,
            hasNumberedList: chunk.metadata.hasNumberedList ?? undefined,
          },
        });
      }

      logger.phaseComplete("storing_chunks", { chunksStored: chunksWithMetadata.length });

      // Update status to completed
      await ctx.runMutation(internal.documents.index.updateStatus, {
        documentId,
        status: "completed",
      });

      logger.jobComplete({
        title,
        chunkCount: chunksWithMetadata.length,
        wordCount: docMetadata.wordCount,
      });
    } catch (error) {
      const errorMeta = createErrorMetadata(error, currentPhase);

      logger.jobError(error, {
        phase: currentPhase,
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
      });

      // Mark as failed
      await ctx.runMutation(internal.documents.index.updateStatus, {
        documentId,
        status: "failed",
      });

      if (fileTypeForError === "paper_record") {
        await ctx.runMutation(internal.documents.index.patch, {
          documentId,
          patch: { ingestionStatus: "failed" },
        });
      }

      // Store error in metadata
      await ctx.runMutation(internal.documents.index.patch, {
        documentId,
        patch: {
          metadata: {
            error: errorMeta.message,
            errorPhase: currentPhase,
            errorType: errorMeta.type,
            retryable: errorMeta.retryable,
            failedAt: Date.now(),
            stack: errorMeta.stackTrace,
          },
        },
      });

      throw error;
    }
  },
});
