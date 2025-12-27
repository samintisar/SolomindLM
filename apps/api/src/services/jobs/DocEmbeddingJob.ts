import { supabase } from '../../config/database.js';
import { MistralOCRService } from '../extraction/MistralOCRService.js';
import { YouTubeLoaderService } from '../extraction/YouTubeLoaderService.js';
import { TextSplitterService } from '../processing/TextSplitterService.js';
import { TitleGeneratorService } from '../processing/TitleGeneratorService.js';
import { EmbeddingService } from '../processing/EmbeddingService.js';
import { VectorStoreService } from '../storage/VectorStoreService.js';
import { env } from '../../config/env.js';

// Initialize services
const mistralOCR = new MistralOCRService(env.MISTRAL_API_KEY);
const youtubeLoader = new YouTubeLoaderService();
const textSplitter = new TextSplitterService();
const titleGenerator = new TitleGeneratorService(env.TOGETHER_AI_API_KEY);
const embeddingService = new EmbeddingService(env.COHERE_API_KEY);
const vectorStore = new VectorStoreService();

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
  type: 'file' | 'url' | 'youtube';
  source: string;
}

// Graphile Worker task handler
export async function docEmbeddingJob(payload: DocEmbeddingJobPayload) {
  const { documentId, userId, noteId, type, source } = payload;

  console.log(`[DocEmbedding] Processing document ${documentId} of type ${type}`);

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'baseline',
      hypothesisId: 'H5',
      location: 'apps/api/src/services/jobs/DocEmbeddingJob.ts:33',
      message: 'DocEmbedding job started',
      data: { documentId, userId, noteId, type },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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
      extractedText = await youtubeLoader.loadTranscript(source);
    } else if (type === 'file') {
      const { data: doc } = await supabase
        .from('documents')
        .select('file_url, file_name')
        .eq('id', documentId)
        .single();

      const fileUrlToUse = doc?.file_url || source;

      if (!fileUrlToUse) {
        throw new Error('File URL not found for document: ' + documentId);
      }

      const filePath = extractStoragePath(fileUrlToUse);
      let signedUrlTarget = fileUrlToUse;

      if (filePath) {
        const { data: signedData, error: signError } = await supabase.storage
          .from('documents')
          .createSignedUrl(filePath, 60);

        if (signError || !signedData?.signedUrl) {
          console.error(`[DocEmbedding] Failed to create signed URL for path ${filePath}:`, signError);
          throw new Error('Could not generate signed URL for document: ' + documentId);
        }

        signedUrlTarget = signedData.signedUrl;
        console.log(`[DocEmbedding] Generated signed URL for path: ${filePath}`);
      } else {
        console.warn(`[DocEmbedding] Unable to derive storage path from ${fileUrlToUse}; sending raw URL to OCR`);
      }

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'debug-session',
          runId: 'baseline',
          hypothesisId: 'H5',
          location: 'apps/api/src/services/jobs/DocEmbeddingJob.ts:82',
          message: 'Submitting signed URL to OCR service',
          data: {
            documentId,
            signedUrlGenerated: signedUrlTarget !== fileUrlToUse,
            filePath,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      extractedText = await mistralOCR.processDocument(signedUrlTarget);
    } else if (type === 'url') {
      extractedText = await mistralOCR.processFromUrl(source);
    }

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'baseline',
        hypothesisId: 'H6',
        location: 'apps/api/src/services/jobs/DocEmbeddingJob.ts:106',
        message: 'Text extraction completed',
        data: { documentId, extractedLength: extractedText?.length ?? 0 },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text extracted from document');
    }

    console.log(`[DocEmbedding] Extracted ${extractedText.length} characters`);

    // Step 2: Split text
    console.log(`[DocEmbedding] Step 2: Splitting text into chunks...`);
    const chunks = await textSplitter.splitText(extractedText);
    console.log(`[DocEmbedding] Split into ${chunks.length} chunks`);

    // Step 3: Generate title
    console.log(`[DocEmbedding] Step 3: Generating title...`);
    const title = await titleGenerator.generateTitle(chunks[0]);
    console.log(`[DocEmbedding] Generated title: ${title}`);

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

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'baseline',
        hypothesisId: 'H7',
        location: 'apps/api/src/services/jobs/DocEmbeddingJob.ts:140',
        message: 'Vector store write completed',
        data: { documentId, chunkCount: chunksWithEmbeddings.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

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
