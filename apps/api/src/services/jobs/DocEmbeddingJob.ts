import { supabase } from '../../config/database.js';
import { MistralOCRService } from '../extraction/MistralOCRService.js';
import { SupadataLoaderService } from '../extraction/SupadataLoaderService.js';
import { TextSplitterService } from '../processing/TextSplitterService.js';
import { EmbeddingService } from '../processing/EmbeddingService.js';
import { VectorStoreService } from '../storage/VectorStoreService.js';
import { SupabaseStorageService } from '../storage/SupabaseStorageService.js';
import { env } from '../../config/env.js';

// Initialize services
const mistralOCR = new MistralOCRService(env.MISTRAL_API_KEY);
const supadataLoader = new SupadataLoaderService();
const textSplitter = new TextSplitterService();
const embeddingService = new EmbeddingService(env.COHERE_API_KEY);
const vectorStore = new VectorStoreService();
const storageService = new SupabaseStorageService();

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

function extractStoragePath(fileUrlOrPath: string | null | undefined): string | null {
  if (!fileUrlOrPath) {
    return null;
  }

  const marker = '/documents/';
  let path = fileUrlOrPath;

  if (path.includes(marker)) {
    path = path.split(marker)[1];
  } else if (path.startsWith('documents/')) {
    path = path.substring('documents/'.length);
  }

  try {
    return decodeURIComponent(path);
  } catch (err) {
    console.warn('[DocEmbedding] Failed to decode storage path, using raw value');
    return path;
  }
}

export interface DocEmbeddingJobPayload {
  documentId: string;
  userId: string;
  noteId: string;
  type: 'file' | 'url' | 'youtube' | 'text';
  source: string;
}

// Graphile Worker task handler
export async function docEmbeddingJob(payload: DocEmbeddingJobPayload) {
  const { documentId, userId, noteId, type, source } = payload;

  console.log(`[DocEmbedding] Processing document ${documentId} of type ${type}`);

  try {
    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    let extractedText = '';

    // Step 1: Extraction
    console.log(`[DocEmbedding] Step 1: Extracting content...`);
    if (type === 'youtube') {
      extractedText = await supadataLoader.loadTranscript(source);
    } else if (type === 'text') {
      extractedText = source; // Text is already extracted
    } else if (type === 'file') {
      const { data: doc } = await supabase
        .from('documents')
        .select('file_url, file_name')
        .eq('id', documentId)
        .single();

      const fileUrlToUse = doc?.file_url || source;
      const fileName = doc?.file_name || '';

      if (!fileUrlToUse) {
        throw new Error('File URL not found for document: ' + documentId);
      }

      const filePath = extractStoragePath(fileUrlToUse);

      if (!filePath) {
        throw new Error('Could not extract storage path from file URL: ' + fileUrlToUse);
      }

      // Check if file needs OCR or can be read directly as text
      if (needsOCR(fileName)) {
        console.log(`[DocEmbedding] File '${fileName}' requires OCR processing`);

        const { data: signedData, error: signError } = await supabase.storage
          .from('documents')
          .createSignedUrl(filePath, 60);

        if (signError || !signedData?.signedUrl) {
          console.error(`[DocEmbedding] Failed to create signed URL for path ${filePath}:`, signError);
          throw new Error('Could not generate signed URL for document: ' + documentId);
        }

        console.log(`[DocEmbedding] Generated signed URL for OCR processing: ${filePath}`);

        extractedText = await mistralOCR.processDocument(signedData.signedUrl);
      } else {
        console.log(`[DocEmbedding] File '${fileName}' is plaintext, reading directly (no OCR)`);

        extractedText = await storageService.downloadFileAsText(filePath);
      }
    } else if (type === 'url') {
      extractedText = await supadataLoader.loadWebPage(source);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text extracted from document');
    }

    console.log(`[DocEmbedding] Extracted ${extractedText.length} characters`);

    // Step 2: Split text
    console.log(`[DocEmbedding] Step 2: Splitting text into chunks...`);
    const chunks = await textSplitter.splitText(extractedText);
    console.log(`[DocEmbedding] Split into ${chunks.length} chunks`);

    // Step 3: Get title (use original file name instead of generating)
    console.log(`[DocEmbedding] Step 3: Setting title from source...`);
    let title: string;

    if (type === 'file') {
      // Use the original file name (remove extension for cleaner display)
      const { data: doc } = await supabase
        .from('documents')
        .select('file_name')
        .eq('id', documentId)
        .single();

      const fileName = doc?.file_name || source;
      // Remove file extension
      title = fileName.replace(/\.[^/.]+$/, '');
    } else if (type === 'url') {
      // For URLs, use the hostname
      try {
        const url = new URL(source);
        title = url.hostname;
      } catch {
        title = source;
      }
    } else if (type === 'youtube') {
      // For YouTube, use the video ID or URL
      const match = source.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
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

    await supabase
      .from('documents')
      .update({ title })
      .eq('id', documentId);

    // Step 4: Generate embeddings
    console.log(`[DocEmbedding] Step 4: Generating embeddings...`);
    const embeddings = await embeddingService.embedBatch(chunks);
    console.log(`[DocEmbedding] Generated ${embeddings.length} embeddings`);

    // Step 5: Store vectors
    console.log(`[DocEmbedding] Step 5: Storing vectors in database...`);
    const chunksWithEmbeddings = chunks.map((content, index) => ({
      content,
      embedding: embeddings[index],
      index,
    }));

    await vectorStore.storeChunks(documentId, userId, noteId, chunksWithEmbeddings);
    console.log(`[DocEmbedding] Stored ${chunksWithEmbeddings.length} chunks`);

    // Update status to completed
    await supabase
      .from('documents')
      .update({ status: 'completed' })
      .eq('id', documentId);

    console.log(`[DocEmbedding] Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`[DocEmbedding] Error processing document ${documentId}:`, error);

    await supabase
      .from('documents')
      .update({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .eq('id', documentId);

    throw error; // Re-throw so Graphile Worker knows it failed
  }
}
