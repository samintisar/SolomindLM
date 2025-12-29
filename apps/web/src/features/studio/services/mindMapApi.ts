import type { Note } from '@/shared/types/index';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Get auth headers with access token
function getAuthHeaders(): HeadersInit {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    const user = JSON.parse(storedUser);
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.accessToken}`,
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

export interface CreateMindMapParams {
  userId: string;
  notebookId: string;
  documentIds: string[];
}

export interface CreateMindMapResponse {
  mindMapId: string;
  status: string;
  mindmap: MindMapData;
}

export interface MindMapData {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  description: string | null;
  data: any;
  status: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

/**
 * Map a database mindmap response to the frontend Note interface
 */
function mapMindMapToNote(mindmap: MindMapData, type: 'mindmap' = 'mindmap'): Note {
  let preview = '';

  // Determine preview based on status
  if (mindmap.status === 'generating' || mindmap.status === 'mapping' || mindmap.status === 'collapsing' || mindmap.status === 'reducing') {
    preview = 'Mind Map • Generating...';
  } else if (mindmap.status === 'completed') {
    preview = 'Mind Map • Visual Overview';
  } else if (mindmap.status === 'failed') {
    preview = 'Mind Map • Failed';
  } else {
    preview = 'Mind Map • Visual Overview';
  }

  return {
    id: mindmap.id,
    title: mindmap.title,
    preview,
    type,
    content: JSON.stringify(mindmap.data, null, 2),
    status: mindmap.status as Note['status'],
    metadata: mindmap.metadata,
    mindMapData: mindmap.data,
  };
}

export const mindMapApi = {
  /**
   * Create a new mind map and queue generation
   */
  async generateMindMap(params: CreateMindMapParams): Promise<CreateMindMapResponse> {
    const response = await fetch(`${API_BASE_URL}/api/mindmaps/generate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate mind map');
    }

    const result = await response.json();
    return {
      mindMapId: result.mindMapId,
      status: result.status,
      mindmap: result.mindmap,
    };
  },

  /**
   * Get a specific mind map by ID
   */
  async getMindMap(mindMapId: string): Promise<Note> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const queryParams = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/mindmaps/single/${mindMapId}?${queryParams.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch mind map');
    }

    const mindmap = await response.json();
    return mapMindMapToNote(mindmap);
  },

  /**
   * Poll mind map status until completion
   */
  async pollMindMapStatus(
    mindMapId: string,
    onUpdate?: (note: Note) => void,
    maxAttempts = 180, // 6 minutes @ 2s intervals
    interval = 2000
  ): Promise<Note> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getMindMap(mindMapId);

      if (note.status === 'completed' || note.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Mind map generation timed out');
  },

  /**
   * Get all mind maps for a notebook
   */
  async getMindMaps(notebookId: string): Promise<Note[]> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/mindmaps/${notebookId}?${params.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch mind maps');
    }

    const mindmaps = await response.json();
    return mindmaps.map((m: MindMapData) => mapMindMapToNote(m));
  },

  /**
   * Rename a mind map by ID
   */
  async renameMindMap(mindMapId: string, newTitle: string): Promise<Note> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/mindmaps/${mindMapId}?${params.toString()}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: newTitle }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to rename mind map');
    }

    const mindmap = await response.json();
    return mapMindMapToNote(mindmap);
  },

  /**
   * Delete a mind map by ID
   */
  async deleteMindMap(mindMapId: string): Promise<void> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/mindmaps/${mindMapId}?${params.toString()}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete mind map');
    }
  },
};
