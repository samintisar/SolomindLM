import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { makeWorkerUtils } from 'graphile-worker';
import { pgPool } from '../config/worker.js';

const router = Router();

// Helper function to add a job to Graphile Worker using WorkerUtils
async function addMindMapJob(payload: any) {
  let workerUtils;
  try {
    // Create worker utilities for adding jobs
    workerUtils = await makeWorkerUtils({
      pgPool,
    });

    // Add the job using the proper API
    await workerUtils.addJob(
      'mindmapGeneration',  // task identifier
      payload,              // job payload
      {}                    // job options (empty defaults)
    );

    console.log(`[MindMaps] Successfully added mindmapGeneration job with ID: ${payload.mindMapId}`);
  } catch (error) {
    console.error(`[MindMaps] Failed to add mindmapGeneration job:`, error);
    throw error;
  } finally {
    // Always release the worker utilities
    if (workerUtils) {
      await workerUtils.release();
    }
  }
}

// POST /api/mindmaps/generate - Create mindmap and queue job
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { userId, notebookId, documentIds } = req.body;

    console.log(`[MindMaps] Creating mind map:`, { userId, notebookId, documentIds });

    // Validation
    if (!userId || !notebookId) {
      return res.status(400).json({ error: 'userId and notebookId are required' });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'At least one documentId is required' });
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
    const { data: mindmap, error: mindmapError } = await supabase
      .from('mindmaps')
      .insert({
        id: mindMapId,
        user_id: userId,
        notebook_id: notebookId,
        title: 'Mind Map',
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

// GET /api/mindmaps/:notebookId - Get all mindmaps for a notebook
router.get('/:notebookId', async (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
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

// GET /api/mindmap/:mindMapId - Get single mindmap by ID
router.get('/single/:mindMapId', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
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

// PATCH /api/mindmaps/:mindMapId - Update a mindmap (e.g., rename)
router.patch('/:mindMapId', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const userId = req.query.userId as string;
    const { title } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Verify user owns the mindmap
    const { data: mindmap, error: fetchError } = await supabase
      .from('mindmaps')
      .select('*')
      .eq('id', mindMapId)
      .single();

    if (fetchError || !mindmap) {
      return res.status(404).json({ error: 'Mind map not found' });
    }

    if (mindmap.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update the mindmap title
    const updateData: any = {};
    if (title !== undefined) {
      updateData.title = title;
    }

    const { data: updatedMindmap, error: updateError } = await supabase
      .from('mindmaps')
      .update(updateData)
      .eq('id', mindMapId)
      .select()
      .single();

    if (updateError) {
      console.error('[MindMaps] Error updating mind map:', updateError);
      return res.status(500).json({ error: 'Failed to update mind map' });
    }

    return res.json(updatedMindmap);
  } catch (error) {
    console.error('[MindMaps] Error updating mind map:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update mind map',
    });
  }
});

// DELETE /api/mindmaps/:mindMapId - Delete a mindmap
router.delete('/:mindMapId', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
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
