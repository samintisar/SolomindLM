import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { SupabaseStorageService } from '../services/storage/SupabaseStorageService.js';
import { scheduleDocEmbedding } from '../utils/jobHelpers.js';
import { upload } from '../middleware/upload.js';
import { escapeIdentifier } from 'pg';

const router = Router();
const storageService = new SupabaseStorageService();

// Helper function to add a job to Graphile Worker using the SDK
async function addJob(
  taskIdentifier: string,
  payload: {
    documentId: string;
    userId: string;
    notebookId: string;
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    if (taskIdentifier === 'docEmbedding') {
      await scheduleDocEmbedding(payload, options);
      console.log(`[Upload] Successfully added job '${taskIdentifier}' with document ID: ${payload.documentId}`);
    } else {
      throw new Error(`Unknown task identifier: ${taskIdentifier}`);
    }
  } catch (error: any) {
    console.error(`[Upload] Failed to add job '${taskIdentifier}':`, error);

    // Check if it's a missing function/schema error
    if (error.code === '42883' || error.code === '3F000' ||
        error.message?.includes('graphile_worker') ||
        error.message?.includes('schema')) {
      throw new Error(
        'Graphile Worker is not properly configured. Please start the worker process first to initialize the database schema.'
      );
    }

    throw error;
  }
}

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { userId, noteId, type, source } = req.body;
    const file = req.file;

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'baseline',
        hypothesisId: 'H1',
        location: 'apps/api/src/routes/documents.ts:34',
        message: 'Upload request received',
        data: {
          type,
          userIdProvided: Boolean(userId),
          noteIdProvided: Boolean(noteId),
          hasFile: Boolean(file),
          fileSize: file?.size ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!userId || !noteId) {
      return res.status(400).json({ error: 'userId and noteId are required' });
    }

    if (!type || !['file', 'url', 'youtube', 'text'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be file, url, youtube, or text' });
    }

    if (type === 'file' && !file) {
      return res.status(400).json({ error: 'File is required for type=file' });
    }

    if ((type === 'url' || type === 'youtube' || type === 'text') && !source) {
      return res.status(400).json({ error: 'Source is required for url/youtube/text type' });
    }

    let fileUrl = '';
    let fileName = source || file?.originalname || '';

    if (type === 'file' && file) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'debug-session',
          runId: 'baseline',
          hypothesisId: 'H2',
          location: 'apps/api/src/routes/documents.ts:56',
          message: 'Uploading file to Supabase storage',
          data: {
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            userId,
            noteId,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      fileUrl = await storageService.uploadFile(
        userId,
        noteId,
        file.buffer,
        file.originalname,
        file.mimetype
      );

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'debug-session',
          runId: 'baseline',
          hypothesisId: 'H2',
          location: 'apps/api/src/routes/documents.ts:65',
          message: 'Supabase storage upload succeeded',
          data: {
            fileUrl,
            fileName: file.originalname,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }

    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        note_id: noteId,
        file_name: fileName,
        file_type: type,
        file_url: fileUrl,
        status: 'pending',
        metadata: { source: source || fileUrl },
      })
      .select()
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'baseline',
        hypothesisId: 'H3',
        location: 'apps/api/src/routes/documents.ts:66',
        message: 'Inserted document row',
        data: {
          documentId: document?.id ?? null,
          hasError: Boolean(error),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (error) {
      console.error('Database insert error:', error);
      return res.status(500).json({ error: 'Failed to create document record' });
    }

    // Schedule background job with Graphile Worker
    await addJob('docEmbedding', {
      documentId: document.id,
      userId,
      noteId,
      type,
      source: source || fileUrl,
    });

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'baseline',
        hypothesisId: 'H4',
        location: 'apps/api/src/routes/documents.ts:85',
        message: 'Graphile job queued',
        data: {
          documentId: document.id,
          type,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    res.status(201).json({
      message: 'Document uploaded successfully',
      documentId: document.id,
      status: 'pending',
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// GET /api/documents/:id/content
// Fetches the full reconstructed content from document chunks
router.get('/:id/content', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch all chunks for this document, ordered by index
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select('content, chunk_index')
      .eq('document_id', id)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('Failed to fetch chunks:', error);
      return res.status(500).json({ error: 'Failed to fetch document content' });
    }

    if (!chunks || chunks.length === 0) {
      return res.status(404).json({ error: 'Document content not found' });
    }

    // Reconstruct full content from chunks
    const fullContent = chunks.map((chunk: any) => chunk.content).join('\n\n');

    res.json({
      documentId: id,
      content: fullContent,
      chunkCount: chunks.length,
    });
  } catch (error) {
    console.error('Get document content error:', error);
    res.status(500).json({ error: 'Failed to fetch document content' });
  }
});

// GET /api/documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, noteId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let query = supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (noteId) {
      query = query.eq('note_id', noteId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    res.json(data);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// PATCH /api/documents/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required and must be a string' });
    }

    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .update({ title })
      .eq('id', id)
      .select()
      .single();

    if (fetchError || !document) {
      console.error('Update error:', fetchError);
      return res.status(404).json({ error: 'Document not found or failed to update' });
    }

    res.json(document);
  } catch (error) {
    console.error('Patch document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get document info first
    const { data: document } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete file from storage if it exists
    if (document.file_url) {
      await storageService.deleteFile(document.file_url);
    }

    // Delete from database (chunks will be deleted via CASCADE)
    const { error } = await supabase.from('documents').delete().eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete document' });
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
