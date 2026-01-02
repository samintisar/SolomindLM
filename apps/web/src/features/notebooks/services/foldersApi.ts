import type { FolderItem, NotebookItem } from '@/shared/types/index';

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

export const foldersApi = {
  /**
   * Get all folders for the authenticated user
   */
  async getFolders(): Promise<FolderItem[]> {
    const response = await fetch(`${API_BASE_URL}/api/folders`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error('Failed to fetch folders');
    }

    return response.json();
  },

  /**
   * Get a specific folder by ID
   */
  async getFolder(id: string): Promise<FolderItem> {
    const response = await fetch(`${API_BASE_URL}/api/folders/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Folder not found');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error('Failed to fetch folder');
    }

    return response.json();
  },

  /**
   * Get notebooks in a specific folder
   */
  async getFolderNotebooks(folderId: string): Promise<NotebookItem[]> {
    const response = await fetch(`${API_BASE_URL}/api/folders/${folderId}/notebooks`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Folder not found');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error('Failed to fetch notebooks');
    }

    return response.json();
  },

  /**
   * Create a new folder
   */
  async createFolder(data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }): Promise<FolderItem> {
    const response = await fetch(`${API_BASE_URL}/api/folders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error(errorData.error || 'Failed to create folder');
    }

    return response.json();
  },

  /**
   * Update a folder
   */
  async updateFolder(
    id: string,
    updates: {
      name?: string;
      description?: string;
      color?: string;
      icon?: string;
    }
  ): Promise<FolderItem> {
    const response = await fetch(`${API_BASE_URL}/api/folders/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('Folder not found');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error(errorData.error || 'Failed to update folder');
    }

    return response.json();
  },

  /**
   * Delete a folder
   */
  async deleteFolder(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/folders/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('Folder not found');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error(errorData.error || 'Failed to delete folder');
    }
  },
};
