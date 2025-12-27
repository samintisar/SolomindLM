import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';

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

/**
 * GET /api/notebooks
 * Get all notebooks for the authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get notebooks with source count
    const { data: notebooks, error: notebooksError } = await supabase
      .from('notebooks')
      .select('*')
      .eq('user_id', userId)
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
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const { data: notebook, error } = await supabase
      .from('notebooks')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Notebook not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch notebook' });
    }

    // Get source count
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('note_id', notebook.id);

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
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, coverColor, icon, isFeatured } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

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
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { title, coverColor, icon, isFeatured } = req.body;

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
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updateData.title = title.trim();
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

    // Get source count
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('note_id', notebook.id);

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
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromToken(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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

export default router;

