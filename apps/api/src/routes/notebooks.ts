import { Router, Request, Response } from 'express';
import { supabase, createUserClient } from '../config/database.js';
import { checkNotebookLimit } from '../middleware/notebookLimit.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createNotebookSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  coverColor: z.string().optional(),
  icon: z.string().optional(),
  isFeatured: z.boolean().optional(),
  folderId: z.string().uuid().optional(),
});

const updateNotebookSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(200, 'Title must be less than 200 characters').optional(),
  coverColor: z.string().optional(),
  icon: z.string().optional(),
  isFeatured: z.boolean().optional(),
  folderId: z.string().uuid().nullable().optional(),
});

// Helper to extract JWT token from request (for RLS client)
function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  // Fallback to cookies (cookie-parser populates req.cookies)
  return (req as any).cookies?.access_token || null;
}

/**
 * GET /api/notebooks
 * Get all notebooks for the authenticated user
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get user's JWT token to create a client that respects RLS
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use user client for RLS-respecting operations
    const userClient = createUserClient(token);

    // Get notebooks with source count - RLS will ensure only user's notebooks are returned
    const { data: notebooks, error: notebooksError } = await userClient
      .from('notebooks')
      .select('*')
      .eq('user_id', userId) // Defense in depth: explicit user_id filter
      .order('updated_at', { ascending: false });

    if (notebooksError) {
      console.error('Database error:', notebooksError);
      return res.status(500).json({ error: 'Failed to fetch notebooks' });
    }

    // Get source counts for each notebook - filter by user_id for security
    const notebooksWithCounts = await Promise.all(
      (notebooks || []).map(async (notebook) => {
        const { count } = await userClient
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('notebook_id', notebook.id)
          .eq('user_id', userId); // Filter by user_id for security

        const metadata = (notebook.metadata as Record<string, any>) || {};

        return {
          id: notebook.id,
          title: notebook.title,
          date: new Date(notebook.updated_at || notebook.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }),
          sourceCount: count || 0,
          author: metadata.author,
          coverColor: metadata.coverColor || 'bg-yellow-500',
          icon: metadata.icon || 'Folder',
          isFeatured: metadata.isFeatured || false,
          folderId: notebook.folder_id,
          created_at: notebook.created_at,
          updated_at: notebook.updated_at,
        };
      })
    );

    res.json(notebooksWithCounts);
  } catch (error) {
    console.error('Get notebooks error:', error);
    res.status(500).json({ error: 'Failed to fetch notebooks' });
  }
});

/**
 * GET /api/notebooks/:id
 * Get a specific notebook by ID
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Get user's JWT token to create a client that respects RLS
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use user client for RLS-respecting operations
    const userClient = createUserClient(token);

    const { data: notebook, error } = await userClient
      .from('notebooks')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId) // Defense in depth: explicit user_id filter
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Notebook not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch notebook' });
    }

    // Get source count - filter by user_id for security
    const { count } = await userClient
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('notebook_id', notebook.id)
      .eq('user_id', userId); // Filter by user_id for security

    const metadata = (notebook.metadata as Record<string, any>) || {};

    res.json({
      id: notebook.id,
      title: notebook.title,
      date: new Date(notebook.updated_at || notebook.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      sourceCount: count || 0,
      author: metadata.author,
      coverColor: metadata.coverColor || 'bg-yellow-500',
      icon: metadata.icon || 'Folder',
      isFeatured: metadata.isFeatured || false,
      folderId: notebook.folder_id,
      created_at: notebook.created_at,
      updated_at: notebook.updated_at,
    });
  } catch (error) {
    console.error('Get notebook error:', error);
    res.status(500).json({ error: 'Failed to fetch notebook' });
  }
});

/**
 * POST /api/notebooks
 * Create a new notebook
 */
router.post('/', authenticate, checkNotebookLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Validate request body
    const validationResult = createNotebookSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error.errors[0].message });
    }
    const { title, coverColor, icon, isFeatured } = validationResult.data;

    const metadata: Record<string, any> = {};
    if (coverColor) metadata.coverColor = coverColor;
    if (icon) metadata.icon = icon;
    if (isFeatured !== undefined) metadata.isFeatured = isFeatured;

    const { data: notebook, error } = await supabase
      .from('notebooks')
      .insert({
        user_id: userId,
        title: title.trim(),
        metadata: metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return res.status(500).json({ error: 'Failed to create notebook' });
    }

    res.status(201).json({
      id: notebook.id,
      title: notebook.title,
      date: new Date(notebook.updated_at || notebook.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      sourceCount: 0,
      coverColor: metadata.coverColor || 'bg-yellow-500',
      icon: metadata.icon || 'Folder',
      isFeatured: metadata.isFeatured || false,
      folderId: notebook.folder_id,
      created_at: notebook.created_at,
      updated_at: notebook.updated_at,
    });
  } catch (error) {
    console.error('Create notebook error:', error);
    res.status(500).json({ error: 'Failed to create notebook' });
  }
});

/**
 * PUT /api/notebooks/:id
 * Update a notebook
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate request body
    const validationResult = updateNotebookSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error.errors[0].message });
    }
    const { title, coverColor, icon, isFeatured, folderId } = validationResult.data;

    // First, get the existing notebook to verify ownership
    const { data: existingNotebook, error: fetchError } = await supabase
      .from('notebooks')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingNotebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) {
      updateData.title = title.trim();
    }

    // Handle folderId - can be set to a folder UUID or null to remove from folder
    if (folderId !== undefined) {
      updateData.folder_id = folderId;
    }

    // Update metadata
    const existingMetadata = (existingNotebook.metadata as Record<string, any>) || {};
    const newMetadata = { ...existingMetadata };

    if (coverColor !== undefined) newMetadata.coverColor = coverColor;
    if (icon !== undefined) newMetadata.icon = icon;
    if (isFeatured !== undefined) newMetadata.isFeatured = isFeatured;

    updateData.metadata = newMetadata;

    const { data: notebook, error } = await supabase
      .from('notebooks')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Database update error:', error);
      return res.status(500).json({ error: 'Failed to update notebook' });
    }

    // Get source count - filter by user_id for security
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userClient = createUserClient(token);
    const { count } = await userClient
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('notebook_id', notebook.id)
      .eq('user_id', userId); // Filter by user_id for security

    const metadata = (notebook.metadata as Record<string, any>) || {};

    res.json({
      id: notebook.id,
      title: notebook.title,
      date: new Date(notebook.updated_at || notebook.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      sourceCount: count || 0,
      author: metadata.author,
      coverColor: metadata.coverColor || 'bg-yellow-500',
      icon: metadata.icon || 'Folder',
      isFeatured: metadata.isFeatured || false,
      folderId: notebook.folder_id,
      created_at: notebook.created_at,
      updated_at: notebook.updated_at,
    });
  } catch (error) {
    console.error('Update notebook error:', error);
    res.status(500).json({ error: 'Failed to update notebook' });
  }
});

/**
 * DELETE /api/notebooks/:id
 * Delete a notebook
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Verify ownership before deleting
    const { data: existingNotebook, error: fetchError } = await supabase
      .from('notebooks')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingNotebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }

    // Delete the notebook (related documents will be handled by CASCADE if foreign keys are set up)
    const { error } = await supabase
      .from('notebooks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Database delete error:', error);
      return res.status(500).json({ error: 'Failed to delete notebook' });
    }

    res.json({ message: 'Notebook deleted successfully' });
  } catch (error) {
    console.error('Delete notebook error:', error);
    res.status(500).json({ error: 'Failed to delete notebook' });
  }
});

/**
 * GET /api/notebooks/:notebookId/notes - Get all notes (reports + user notes) for a notebook
 */
router.get('/:notebookId/notes', authenticate, async (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const userId = req.user!.id;

    // Verify user owns the notebook
    const { data: notebook, error: notebookError } = await supabase
      .from('notebooks')
      .select('id')
      .eq('id', notebookId)
      .eq('user_id', userId)
      .single();

    if (notebookError || !notebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }

    // Only fetch reports and text notes (other types like audio, quiz, flashcards will have their own tables)
    const { data: notes, error } = await supabase
      .from('notes')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .in('note_type', ['report', 'text'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Notes] Error fetching notes:', error);
      return res.status(500).json({ error: 'Failed to fetch notes' });
    }

    return res.json(notes || []);
  } catch (error) {
    console.error('[Notes] Error fetching notes:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch notes',
    });
  }
});

export default router;

