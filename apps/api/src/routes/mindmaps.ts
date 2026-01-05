import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleMindmapGeneration } from '../utils/jobHelpers.js';

const router = Router();

// Configuration constants
const CONFIG = {
  MINDMAP: {
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MAX_DOCUMENTS: 10,
  },
} as const;

// Type definitions for Supabase responses
interface MindMapRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  data: Record<string, any>;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Validation helpers
function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= CONFIG.MINDMAP.MAX_DOCUMENTS &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

function validateTitle(title: unknown): boolean {
  return typeof title === 'string' &&
    title.trim().length >= CONFIG.MINDMAP.MIN_TITLE_LENGTH &&
    title.trim().length <= CONFIG.MINDMAP.MAX_TITLE_LENGTH;
}

// Helper function to add a job to Graphile Worker using the SDK
async function addMindMapJob(
  payload: {
    mindmapId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleMindmapGeneration(payload, options);
    console.log(`[MindMaps] Successfully added mindmapGeneration job`);
  } catch (error: any) {
    console.error(`[MindMaps] Failed to add mindmapGeneration job:`, error);

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

// POST /api/mindmaps - Create mindmap and queue job
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, notebookId, documentIds } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'MindMaps',
      action: 'create_mindmap',
      userId,
      notebookId,
    }));

    // Validation: userId and notebookId
    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }
    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    // Validation: documentIds
    if (!validateDocumentIds(documentIds)) {
      return res.status(400).json({
        error: `documentIds must be an array of 1-${CONFIG.MINDMAP.MAX_DOCUMENTS} valid UUIDs`
      });
    }

    // Verify user owns the notebook
    const { data: notebook, error: notebookError } = await supabase
      .from('notebooks')
      .select('user_id')
      .eq('id', notebookId)
      .single();

    if (notebookError || !notebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }

    if (notebook.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate a unique mind map ID
    const mindMapId = crypto.randomUUID();

    // Create mindmap entry with generating status
    // Initial title is a simple placeholder - AI will generate a descriptive title later
    const title = 'Mind Map';
    const { data: mindmap, error: mindmapError } = await supabase
      .from('mindmaps')
      .insert({
        id: mindMapId,
        user_id: userId,
        notebook_id: notebookId,
        title,
        data: {},
        status: 'generating',
        metadata: {
          documentIds,
          phase: 'generating',
          createdAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (mindmapError || !mindmap) {
      console.error('[MindMaps] Error creating mindmap:', mindmapError);
      return res.status(500).json({ error: 'Failed to create mindmap' });
    }

    // Queue the mind map generation job
    await addMindMapJob({
      mindMapId,
      userId,
      notebookId,
      documentIds,
    });

    return res.status(201).json({
      mindMapId,
      status: 'generating',
      mindmap,
    });
  } catch (error) {
    console.error('[MindMaps] Error creating mind map:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create mind map',
    });
  }
});

// GET /api/mindmaps/notebook/:notebookId - Get all mindmaps for a notebook
// MUST come before /:mindMapId route to avoid route conflicts
router.get('/notebook/:notebookId', async (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    const { data: mindmaps, error } = await supabase
      .from('mindmaps')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MindMaps] Error fetching mindmaps:', error);
      return res.status(500).json({ error: 'Failed to fetch mindmaps' });
    }

    return res.json(mindmaps || []);
  } catch (error) {
    console.error('[MindMaps] Error fetching mindmaps:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch mindmaps',
    });
  }
});

// GET /api/mindmaps/:mindMapId - Get single mindmap by ID
// MUST come after /notebook/:notebookId to avoid route conflicts
router.get('/:mindMapId', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof mindMapId !== 'string' || !isValidUUID(mindMapId)) {
      return res.status(400).json({ error: 'Invalid mindMapId format' });
    }

    const { data: mindmap, error } = await supabase
      .from('mindmaps')
      .select('*')
      .eq('id', mindMapId)
      .eq('user_id', userId)
      .single();

    if (error || !mindmap) {
      return res.status(404).json({ error: 'Mind map not found' });
    }

    return res.json(mindmap);
  } catch (error) {
    console.error('[MindMaps] Error fetching mind map:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch mind map',
    });
  }
});

// PATCH /api/mindmaps/:mindMapId - Rename a mindmap
router.patch('/:mindMapId', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const { title } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof mindMapId !== 'string' || !isValidUUID(mindMapId)) {
      return res.status(400).json({ error: 'Invalid mindMapId format' });
    }

    if (!validateTitle(title)) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.MINDMAP.MIN_TITLE_LENGTH} and ${CONFIG.MINDMAP.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the mindmap
    const { data: mindmap, error: fetchError } = await supabase
      .from('mindmaps')
      .select('user_id')
      .eq('id', mindMapId)
      .single();

    if (fetchError || !mindmap) {
      return res.status(404).json({ error: 'Mind map not found' });
    }

    if (mindmap.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedTitle = title.trim();
    const { error: updateError } = await supabase
      .from('mindmaps')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', mindMapId);

    if (updateError) {
      console.error('[MindMaps] Error renaming mind map:', updateError);
      return res.status(500).json({ error: 'Failed to rename mind map' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[MindMaps] Error renaming mind map:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename mind map',
    });
  }
});

// DELETE /api/mindmaps/:mindMapId - Delete a mindmap
router.delete('/:mindMapId', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof mindMapId !== 'string' || !isValidUUID(mindMapId)) {
      return res.status(400).json({ error: 'Invalid mindMapId format' });
    }

    // Verify user owns the mindmap
    const { data: mindmap, error: fetchError } = await supabase
      .from('mindmaps')
      .select('user_id')
      .eq('id', mindMapId)
      .single();

    if (fetchError || !mindmap) {
      return res.status(404).json({ error: 'Mind map not found' });
    }

    if (mindmap.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('mindmaps')
      .delete()
      .eq('id', mindMapId);

    if (deleteError) {
      console.error('[MindMaps] Error deleting mind map:', deleteError);
      return res.status(500).json({ error: 'Failed to delete mind map' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[MindMaps] Error deleting mind map:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete mind map',
    });
  }
});

export default router;
