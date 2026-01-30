"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { MistralOCRService } from '../../lib/services/extraction/MistralOCRService';
import { SupadataLoaderService } from '../../lib/services/extraction/SupadataLoaderService';
import { TextSplitterService } from '../../lib/services/processing/TextSplitterService';

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

/**
 * Check if a file requires OCR processing based on its extension
 */
function needsOCR(fileName: string): boolean {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  return OCR_FILE_EXTENSIONS.includes(ext);
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

    console.log('[DocEmbedding] Processing document:', documentId);

    try {
      // Update status to processing
      await ctx.runMutation(internal.documents.updateStatus, {
        documentId,
        status: 'processing',
      });

      // Get document details
      const docDetails = await ctx.runQuery(internal.documents.getDocumentDetails, {
        documentId,
      });

      let extractedText = '';

      // Step 1: Extraction
      console.log('[DocEmbedding] Step 1: Extracting content...');

      const mistralOCR = new MistralOCRService(process.env.MISTRAL_API_KEY || '');
      const supadataLoader = new SupadataLoaderService();

      if (docDetails.fileType === 'youtube') {
        // For YouTube, use the fileUrl as the source
        extractedText = await supadataLoader.loadTranscript(docDetails.fileUrl || '');
      } else if (docDetails.fileType === 'text') {
        // Text is already extracted, stored in metadata
        extractedText = docDetails.fileUrl || ''; // fileUrl contains the text for type 'text'
      } else if (docDetails.fileType === 'file') {
        if (!docDetails.storageId && !docDetails.fileUrl) {
          throw new Error('File storage ID or URL not found for document: ' + documentId);
        }

        // Check if file needs OCR or can be read directly as text
        if (needsOCR(docDetails.fileName)) {
          console.log(`[DocEmbedding] File '${docDetails.fileName}' requires OCR processing`);

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
        } else {
          console.log(`[DocEmbedding] File '${docDetails.fileName}' is plaintext, reading directly (no OCR)`);

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
        }
      } else if (docDetails.fileType === 'url') {
        extractedText = await supadataLoader.loadWebPage(docDetails.fileUrl || '');
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text extracted from document');
      }

      // Sanitize extracted text
      const originalLength = extractedText.length;
      extractedText = extractedText.replace(/\u0000/g, '');
      if (originalLength !== extractedText.length) {
        console.warn(`[DocEmbedding] Removed ${originalLength - extractedText.length} null byte(s)`);
      }

      console.log(`[DocEmbedding] Extracted ${extractedText.length} characters`);

      // Step 2: Split text (LangChain RecursiveCharacterTextSplitter + js-tiktoken)
      console.log('[DocEmbedding] Step 2: Splitting text into chunks...');
      const chunks = await TextSplitterService.splitText(extractedText, 1000, 200);
      console.log(`[DocEmbedding] Split into ${chunks.length} chunks`);

      // Step 3: Set title from source
      console.log('[DocEmbedding] Step 3: Setting title from source...');
      let title: string;

      if (docDetails.fileType === 'file') {
        // Use the file name (remove extension)
        const fileName = docDetails.fileName || '';
        title = fileName.replace(/\.[^/.]+$/, '');
      } else if (docDetails.fileType === 'url') {
        // For URLs, use the hostname
        try {
          const url = new URL(docDetails.fileUrl || '');
          title = url.hostname;
        } catch {
          title = docDetails.fileUrl || 'Web Page';
        }
      } else if (docDetails.fileType === 'youtube') {
        // For YouTube, use the video ID or URL
        const match = (docDetails.fileUrl || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (match) {
          title = `YouTube: ${match[1]}`;
        } else {
          title = 'YouTube Video';
        }
      } else {
        // For text input
        title = 'Pasted Text';
      }

      console.log(`[DocEmbedding] Set title: ${title}`);

      await ctx.runMutation(internal.documents.updateTitle, {
        documentId,
        title,
      });

      // Step 4: Generate embeddings via shared lib (uses OpenAI; cacheable per chunk)
      console.log('[DocEmbedding] Step 4: Generating embeddings...');

      const embeddingVectors = await Promise.all(
        chunks.map((text) =>
          ctx.runAction(internal.lib.embeddings.generateEmbeddingInternal, { text })
        )
      );

      // Store chunks with embeddings
      for (let i = 0; i < chunks.length; i++) {
        await ctx.runMutation(internal.documents.storeChunk, {
          documentId,
          userId,
          notebookId,
          content: chunks[i],
          chunkIndex: i,
          embedding: embeddingVectors[i],
        });
      }

      console.log('[DocEmbedding] Embeddings generated and stored');

      // Update status to completed
      await ctx.runMutation(internal.documents.updateStatus, {
        documentId,
        status: 'completed',
      });

      console.log(`[DocEmbedding] Document ${documentId} processed successfully`);
    } catch (error) {
      console.error('[DocEmbedding] Error processing document:', documentId, error);

      // Mark as failed
      await ctx.runMutation(internal.documents.updateStatus, {
        documentId,
        status: 'failed',
      });

      // Store error in metadata
      await ctx.runMutation(internal.documents.patch, {
        documentId,
        patch: {
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      });

      throw error;
    }
  },
});
