"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { MistralOCRService } from '../_services/extraction/MistralOCRService';
import { AudioTranscriptionService } from '../_services/extraction/AudioTranscriptionService';
import { SupadataLoaderService } from '../_services/extraction/SupadataLoaderService';
import {
  extractDocumentMetadata,
  getFileExtension,
  type DocumentMetadata,
} from '../_services/processing/DocumentMetadataExtractor';
import {
  StructuralChunker,
  type ChunkWithMetadata,
} from '../_services/processing/StructuralChunker';
import { createJobLogger, createErrorMetadata } from '../_agents/_shared/logging';

// File extensions that require OCR processing
const OCR_FILE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.avif',
  '.pdf',
  '.pptx',
  '.docx',
];

const AUDIO_FILE_EXTENSIONS = [
  '.wav',
  '.mp3',
  '.m4a',
  '.webm',
  '.flac',
];

/**
 * Check if a file requires OCR processing based on its extension
 */
function needsOCR(fileName: string): boolean {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  return OCR_FILE_EXTENSIONS.includes(ext);
}

function needsAudioTranscription(fileName: string): boolean {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  return AUDIO_FILE_EXTENSIONS.includes(ext);
}


/**
 * Document embedding job handler
 * This is an internal action that handles document processing and embedding
 */
export const docEmbedding = internalAction({
  args: {
    documentId: v.id('documents'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
  },
  handler: async (ctx, args) => {
    "use node";

    const { documentId, userId, notebookId } = args;

    // Initialize structured logger
    const logger = createJobLogger({
      jobType: 'document_embedding',
      jobId: documentId,
      notebookId,
      userId,
    });

    logger.jobStart();

    let currentPhase = 'initializing';

    try {
      // Phase: Initializing
      logger.phaseStart('initializing');
      await ctx.runMutation(internal.documents.index.updateStatus, {
        documentId,
        status: 'processing',
      });
      logger.phaseComplete('initializing');

      // Phase: Loading document
      logger.phaseStart('loading_document');
      currentPhase = 'loading_document';

      // Get document details
      const docDetails = await ctx.runQuery(internal.documents.index.getDocumentDetails, {
        documentId,
      });

      const notebookRow = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
        notebookId,
      });
      const chunkUserId = (notebookRow?.userId ?? userId) as string;

      logger.phaseComplete('loading_document', {
        fileType: docDetails.fileType,
        fileName: docDetails.fileName,
      });

      let extractedText = '';
      let extractedTitle: string | undefined;

      // Phase: Extraction
      logger.phaseStart('extraction');
      currentPhase = 'extraction';

      const mistralOCR = new MistralOCRService(process.env.MISTRAL_API_KEY || '');
      const supadataLoader = new SupadataLoaderService();

      if (docDetails.fileType === 'youtube') {
        logger.info('Extracting YouTube transcript');
        const meta = await supadataLoader.loadTranscriptWithMeta(docDetails.fileUrl || '');
        extractedText = meta.content;
        if (meta.title?.trim()) extractedTitle = meta.title.trim();
        logger.phaseComplete('extraction', {
          contentLength: extractedText.length,
          title: extractedTitle,
        });
      } else if (docDetails.fileType === 'text') {
        logger.info('Processing pasted text');
        // Text is already extracted, stored in metadata
        extractedText = docDetails.fileUrl || ''; // fileUrl contains the text for type 'text'
        logger.phaseComplete('extraction', { contentLength: extractedText.length });
      } else if (docDetails.fileType === 'file') {
        if (!docDetails.storageId && !docDetails.fileUrl) {
          throw new Error('File storage ID or URL not found for document: ' + documentId);
        }

        // Check if file is audio and needs transcription
        if (needsAudioTranscription(docDetails.fileName)) {
          logger.info('Processing audio file with transcription', {
            fileName: docDetails.fileName,
          });

          // Get file URL from Convex storage
          let fileUrl = docDetails.fileUrl;
          if (!fileUrl && docDetails.storageId) {
            fileUrl = await ctx.storage.getUrl(docDetails.storageId) ?? undefined;
          }

          if (!fileUrl) {
            throw new Error('Could not get file URL for audio document: ' + documentId);
          }

          const audioTranscription = new AudioTranscriptionService(process.env.TOGETHER_AI_API_KEY || '');
          extractedText = await audioTranscription.transcribe(fileUrl);
          logger.phaseComplete('extraction', {
            contentLength: extractedText.length,
            method: 'audio_transcription',
          });
        } else if (needsOCR(docDetails.fileName)) {
          logger.info('Processing file with OCR', {
            fileName: docDetails.fileName,
          });

          // Get file URL from Convex storage
          let fileUrl = docDetails.fileUrl;
          if (!fileUrl && docDetails.storageId) {
            // If we have a storageId, get the URL from Convex storage
            fileUrl = await ctx.storage.getUrl(docDetails.storageId) ?? undefined;
          }

          if (!fileUrl) {
            throw new Error('Could not get file URL for document: ' + documentId);
          }

          extractedText = await mistralOCR.processDocument(fileUrl);
          logger.phaseComplete('extraction', {
            contentLength: extractedText.length,
            method: 'OCR',
          });
        } else {
          logger.info('Processing plaintext file', {
            fileName: docDetails.fileName,
          });

          // For text files, read from storage or URL
          if (docDetails.storageId) {
            // Read from Convex storage
            const file = await ctx.storage.get(docDetails.storageId);
            if (!file) {
              throw new Error('File not found in storage');
            }
            extractedText = await file.text();
          } else if (docDetails.fileUrl) {
            // For external URLs, we'd need to fetch them
            // This is a placeholder - implement URL fetching if needed
            extractedText = '';
          }
          logger.phaseComplete('extraction', {
            contentLength: extractedText.length,
            method: 'direct_read',
          });
        }
      } else if (docDetails.fileType === 'url') {
        logger.info('Extracting web page content');
        const meta = await supadataLoader.loadWebPageWithMeta(docDetails.fileUrl || '');
        extractedText = meta.content;
        if (meta.title?.trim()) extractedTitle = meta.title.trim();
        logger.phaseComplete('extraction', {
          contentLength: extractedText.length,
          title: extractedTitle,
        });
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text extracted from document');
      }

      // Sanitize extracted text
      const originalLength = extractedText.length;
      extractedText = extractedText.replace(/\u0000/g, '');
      if (originalLength !== extractedText.length) {
        logger.warn('Removed null bytes from text', {
          bytesRemoved: originalLength - extractedText.length,
        });
      }

      logger.info('Text extraction complete', { contentLength: extractedText.length });

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
      logger.phaseStart('chunking');
      currentPhase = 'chunking';

      const fileExtension = getFileExtension(docDetails.fileName);
      const docMetadata = extractDocumentMetadata(extractedText, fileExtension);
      logger.info('Document metadata extracted', {
        wordCount: docMetadata.wordCount,
        readingTime: docMetadata.estimatedReadingTimeMinutes,
        structure: docMetadata.documentStructure,
        language: docMetadata.language,
      });

      // Use structural chunker for enhanced metadata
      const chunker = new StructuralChunker();
      const chunksWithMetadata = await chunker.chunk(extractedText, 1000, 200);

      logger.phaseComplete('chunking', { chunkCount: chunksWithMetadata.length });

      // Phase: Setting title
      logger.phaseStart('setting_title');
      currentPhase = 'setting_title';

      let title: string;

      if (docDetails.fileType === 'file') {
        // Keep full file name (with extension) so the UI can show correct type (PDF, DOCX, etc.)
        title = docDetails.fileName || '';
      } else if (docDetails.fileType === 'url') {
        title = extractedTitle || (() => {
          try {
            return new URL(docDetails.fileUrl || '').hostname;
          } catch {
            return docDetails.fileUrl || 'Web Page';
          }
        })();
      } else if (docDetails.fileType === 'youtube') {
        title = extractedTitle || (() => {
          const match = (docDetails.fileUrl || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
          return match ? `YouTube: ${match[1]}` : 'YouTube Video';
        })();
      } else {
        // For text input
        title = 'Pasted Text';
      }

      logger.info('Title set', { title });

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

      logger.phaseComplete('setting_title');

      // Phase: Embedding
      logger.phaseStart('embedding');
      currentPhase = 'embedding';

      const embeddingTimer = logger.createTimer();

      // Generate embeddings via shared lib (uses OpenAI; cacheable per chunk)
      const embeddingVectors = await Promise.all(
        chunksWithMetadata.map((chunk) =>
          ctx.runAction(internal._services.ai.embeddings.generateEmbeddingInternal, { text: chunk.content })
        )
      );

      const embeddingDuration = embeddingTimer.end();
      logger.phaseComplete('embedding', {
        chunkCount: chunksWithMetadata.length,
        durationMs: embeddingDuration,
      });

      // Phase: Storing chunks
      logger.phaseStart('storing_chunks');
      currentPhase = 'storing_chunks';

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

      logger.phaseComplete('storing_chunks', { chunksStored: chunksWithMetadata.length });

      // Update status to completed
      await ctx.runMutation(internal.documents.index.updateStatus, {
        documentId,
        status: 'completed',
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
        status: 'failed',
      });

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
