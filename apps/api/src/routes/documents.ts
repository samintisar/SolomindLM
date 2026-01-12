import { Router, Request, Response } from 'express';
import { supabase, createUserClient } from '../config/database.js';
import { SupabaseStorageService } from '../services/storage/SupabaseStorageService.js';
import { scheduleDocEmbedding } from '../utils/jobHelpers.js';
import { upload } from '../middleware/upload.js';
import { checkSourceLimit } from '../middleware/sourceLimit.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();
const storageService = new SupabaseStorageService();

// Validation schemas
const uploadDocumentSchema = z.object({
  type: z.enum(['file', 'url', 'youtube', 'text']),
  source: z.string().optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(500),
});

// Helper function to add a job to Graphile Worker using the SDK
async function addJob(
  taskIdentifier: string,
  payload: {
    documentId: string;
    userId: string;
    noteId: string;
    type: 'file' | 'url' | 'youtube' | 'text';
    source: string;
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

// Helper to extract JWT token from request (for RLS client)
function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return (req as any).cookies?.access_token || null;
}

// POST /api/documents/upload
router.post('/upload', authenticate, upload.single('file'), checkSourceLimit, async (req: Request, res: Response) => {
  // #region agent log
  const fs = await import('fs').catch(()=>null);const logPath = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry = JSON.stringify({location:'documents.ts:71',message:'Upload endpoint entry',data:{hasUser:!!req.user,userId:req.user?.id,hasFile:!!req.file,fileName:req.file?.originalname,body:req.body},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n';if(fs)fs.promises.appendFile(logPath,logEntry).catch(()=>{});
  // #endregion
  try {
    const userId = req.user!.id;
    const { noteId } = req.body;
    const file = req.file;

    // Validate request body
    const validationResult = uploadDocumentSchema.safeParse(req.body);
    // #region agent log
    const fs2 = await import('fs').catch(()=>null);const logPath2 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry2 = JSON.stringify({location:'documents.ts:78',message:'Validation result',data:{success:validationResult.success,errors:validationResult.success?null:validationResult.error.errors},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n';if(fs2)fs2.promises.appendFile(logPath2,logEntry2).catch(()=>{});
    // #endregion
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error.errors[0].message });
    }
    const { type, source } = validationResult.data;

    if (!noteId) {
      return res.status(400).json({ error: 'noteId is required' });
    }

    if (type === 'file' && !file) {
      return res.status(400).json({ error: 'File is required for type=file' });
    }

    if ((type === 'url' || type === 'youtube' || type === 'text') && !source) {
      return res.status(400).json({ error: 'Source is required for url/youtube/text type' });
    }

    // Verify user owns the notebook
    const { data: notebook } = await supabase
      .from('notebooks')
      .select('id')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single();

    if (!notebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }

    let fileUrl = '';
    let fileName = source || file?.originalname || '';

    if (type === 'file' && file) {
      // #region agent log
      const fs3 = await import('fs').catch(()=>null);const logPath3 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry3 = JSON.stringify({location:'documents.ts:111',message:'Before storage upload',data:{fileName:file.originalname,fileSize:file.size,mimeType:file.mimetype},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})+'\n';if(fs3)fs3.promises.appendFile(logPath3,logEntry3).catch(()=>{});
      // #endregion
      fileUrl = await storageService.uploadFile(
        userId,
        noteId,
        file.buffer,
        file.originalname,
        file.mimetype
      );
      // #region agent log
      const fs4 = await import('fs').catch(()=>null);const logPath4 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry4 = JSON.stringify({location:'documents.ts:119',message:'After storage upload',data:{fileUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})+'\n';if(fs4)fs4.promises.appendFile(logPath4,logEntry4).catch(()=>{});
      // #endregion
    }

    // Get user's JWT token to create a client that respects RLS
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userClient = createUserClient(token);

    // #region agent log
    const fs5 = await import('fs').catch(()=>null);const logPath5 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry5 = JSON.stringify({location:'documents.ts:129',message:'Before database insert',data:{userId,noteId,fileName,type,hasFileUrl:!!fileUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n';if(fs5)fs5.promises.appendFile(logPath5,logEntry5).catch(()=>{});
    // #endregion
    const { data: document, error } = await userClient
      .from('documents')
      .insert({
        user_id: userId,
        notebook_id: noteId,
        file_name: fileName,
        file_type: type,
        file_url: fileUrl,
        status: 'pending',
        metadata: { source: source || fileUrl },
      })
      .select()
      .single();

    // #region agent log
    const fs6 = await import('fs').catch(()=>null);const logPath6 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry6 = JSON.stringify({location:'documents.ts:143',message:'After database insert',data:{hasError:!!error,error:error?String(error):null,hasDocument:!!document,documentId:document?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n';if(fs6)fs6.promises.appendFile(logPath6,logEntry6).catch(()=>{});
    // #endregion
    if (error) {
      console.error('Database insert error:', error);
      return res.status(500).json({ error: 'Failed to create document record' });
    }

    // Schedule background job with Graphile Worker
    // #region agent log
    const fs7 = await import('fs').catch(()=>null);const logPath7 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry7 = JSON.stringify({location:'documents.ts:149',message:'Before job scheduling',data:{documentId:document.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n';if(fs7)fs7.promises.appendFile(logPath7,logEntry7).catch(()=>{});
    // #endregion
    await addJob('docEmbedding', {
      documentId: document.id,
      userId,
      noteId,
      type,
      source: source || fileUrl,
    });
    // #region agent log
    const fs8 = await import('fs').catch(()=>null);const logPath8 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry8 = JSON.stringify({location:'documents.ts:156',message:'After job scheduling',data:{documentId:document.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n';if(fs8)fs8.promises.appendFile(logPath8,logEntry8).catch(()=>{});
    // #endregion

    // #region agent log
    const fs9 = await import('fs').catch(()=>null);const logPath9 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry9 = JSON.stringify({location:'documents.ts:160',message:'Sending success response',data:{documentId:document.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n';if(fs9)fs9.promises.appendFile(logPath9,logEntry9).catch(()=>{});
    // #endregion
    res.status(201).json({
      message: 'Document uploaded successfully',
      documentId: document.id,
      status: 'pending',
    });
  } catch (error) {
    // #region agent log
    const fs10 = await import('fs').catch(()=>null);const logPath10 = 'c:\\Users\\samin\\Documents\\GitHub\\SolomindLM\\.cursor\\debug.log';const logEntry10 = JSON.stringify({location:'documents.ts:166',message:'Upload catch block',data:{errorMessage:error instanceof Error?error.message:String(error),errorName:error instanceof Error?error.name:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n';if(fs10)fs10.promises.appendFile(logPath10,logEntry10).catch(()=>{});
    // #endregion
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userClient = createUserClient(token);

    const { data, error } = await userClient
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
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
router.get('/:id/content', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userClient = createUserClient(token);

    // First verify user owns the document
    const { data: document } = await userClient
      .from('documents')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Fetch all chunks for this document, ordered by index
    const { data: chunks, error } = await userClient
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

// GET /api/documents/:id/signed-url
// Refresh a signed URL for a document file
// This is needed when signed URLs expire (default 24 hours)
router.get('/:id/signed-url', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const expiresIn = parseInt(req.query.expiresIn as string) || 86400; // Default 24 hours

    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userClient = createUserClient(token);

    // Verify user owns the document
    const { data: document } = await userClient
      .from('documents')
      .select('file_url')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.file_url) {
      return res.status(400).json({ error: 'Document has no file URL' });
    }

    // Generate new signed URL
    const signedUrl = await storageService.refreshSignedUrl(document.file_url, expiresIn);

    res.json({
      signedUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Refresh signed URL error:', error);
    res.status(500).json({ error: 'Failed to refresh signed URL' });
  }
});

// GET /api/documents
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { noteId } = req.query;

    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userClient = createUserClient(token);

    let query = userClient
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (noteId) {
      query = query.eq('notebook_id', noteId);
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
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate request body
    const validationResult = updateDocumentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error.errors[0].message });
    }
    const { title } = validationResult.data;

    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userClient = createUserClient(token);

    const { data: document, error: fetchError } = await userClient
      .from('documents')
      .update({ title })
      .eq('id', id)
      .eq('user_id', userId)
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
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userClient = createUserClient(token);

    // Get document info first
    const { data: document } = await userClient
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete file from storage if it exists
    if (document.file_url) {
      await storageService.deleteFile(document.file_url);
    }

    // Delete from database (chunks will be deleted via CASCADE)
    const { error } = await userClient.from('documents').delete().eq('id', id).eq('user_id', userId);

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
