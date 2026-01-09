import { Router, Request, Response } from 'express';
import { supabase, createUserClient } from '../config/database.js';

const router = Router();

// Helper to extract user ID from auth token
async function getUserIdFromToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user.id;
}

// Helper to extract JWT token from request
function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * GET /api/folders
 * Get all folders for the authenticated user with notebook counts
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get folders for user
    const { data: folders, error: foldersError } = await supabase
      .from('notebook_folders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (foldersError) {
      console.error('Database error:', foldersError);
      return res.status(500).json({ error: 'Failed to fetch folders' });
    }

    // Get notebook counts for each folder
    const foldersWithCounts = await Promise.all(
      (folders || []).map(async (folder) => {
        const { count } = await supabase
          .from('notebooks')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', folder.id);

        return {
          id: folder.id,
          name: folder.name,
          color: folder.color || 'bg-blue-500',
          icon: folder.icon || 'Folder',
          notebookCount: count || 0,
          created_at: folder.created_at,
          updated_at: folder.updated_at,
        };
      })
    );

    res.json(foldersWithCounts);
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

/**
 * GET /api/folders/:id
 * Get a specific folder by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const { data: folder, error } = await supabase
      .from('notebook_folders')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Folder not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch folder' });
    }

    // Get notebook count
    const { count } = await supabase
      .from('notebooks')
      .select('*', { count: 'exact', head: true })
      .eq('folder_id', folder.id);

    res.json({
      id: folder.id,
      name: folder.name,
      color: folder.color || 'bg-blue-500',
      icon: folder.icon || 'Folder',
      notebookCount: count || 0,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    });
  } catch (error) {
    console.error('Get folder error:', error);
    res.status(500).json({ error: 'Failed to fetch folder' });
  }
});

/**
 * GET /api/folders/:folderId/notebooks
 * Get all notebooks in a specific folder
 */
router.get('/:folderId/notebooks', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { folderId } = req.params;

    // Verify folder exists and belongs to user
    const { data: folder, error: folderError } = await supabase
      .from('notebook_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', userId)
      .single();

    if (folderError || !folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Get notebooks in folder
    const { data: notebooks, error: notebooksError } = await supabase
      .from('notebooks')
      .select('*')
      .eq('folder_id', folderId)
      .order('updated_at', { ascending: false });

    if (notebooksError) {
      console.error('Database error:', notebooksError);
      return res.status(500).json({ error: 'Failed to fetch notebooks' });
    }

    // Get source counts for each notebook
    const notebooksWithCounts = await Promise.all(
      (notebooks || []).map(async (notebook) => {
        const { count } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('note_id', notebook.id);

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
    console.error('Get folder notebooks error:', error);
    res.status(500).json({ error: 'Failed to fetch notebooks' });
  }
});

/**
 * POST /api/folders
 * Create a new folder
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, color, icon } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Get user's JWT token to create a client that respects RLS
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use user client for RLS-respecting operations
    const userClient = createUserClient(token);
    const { data: folder, error } = await userClient
      .from('notebook_folders')
      .insert({
        user_id: userId,
        name: name.trim(),
        color: color || 'bg-blue-500',
        icon: icon || 'Folder',
      })
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Folder name already exists' });
      }
      return res.status(500).json({ error: 'Failed to create folder' });
    }

    res.status(201).json({
      id: folder.id,
      name: folder.name,
      color: folder.color || 'bg-blue-500',
      icon: folder.icon || 'Folder',
      notebookCount: 0,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

/**
 * PUT /api/folders/:id
 * Update a folder
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { name, color, icon } = req.body;

    // First, get the existing folder to verify ownership
    const { data: existingFolder, error: fetchError } = await supabase
      .from('notebook_folders')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingFolder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      updateData.name = name.trim();
    }

    // No description field to update

    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;

    // Get user's JWT token to create a client that respects RLS
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use user client for RLS-respecting operations
    const userClient = createUserClient(token);
    const { data: folder, error } = await userClient
      .from('notebook_folders')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Database update error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Folder name already exists' });
      }
      return res.status(500).json({ error: 'Failed to update folder' });
    }

    // Get notebook count
    const { count } = await supabase
      .from('notebooks')
      .select('*', { count: 'exact', head: true })
      .eq('folder_id', folder.id);

    res.json({
      id: folder.id,
      name: folder.name,
      color: folder.color || 'bg-blue-500',
      icon: folder.icon || 'Folder',
      notebookCount: count || 0,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    });
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

/**
 * DELETE /api/folders/:id
 * Delete a folder (notebooks will have folder_id set to NULL)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    // Verify ownership before deleting
    const { data: existingFolder, error: fetchError } = await supabase
      .from('notebook_folders')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingFolder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Set folder_id to NULL for all notebooks in this folder
    // Use service role client for this operation as it's a bulk update
    await supabase
      .from('notebooks')
      .update({ folder_id: null })
      .eq('folder_id', id);

    // Get user's JWT token to create a client that respects RLS
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use user client for RLS-respecting operations
    const userClient = createUserClient(token);
    // Delete the folder
    const { error } = await userClient
      .from('notebook_folders')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Database delete error:', error);
      return res.status(500).json({ error: 'Failed to delete folder' });
    }

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;
