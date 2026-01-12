import type { FolderItem, NotebookItem } from '@/shared/types/index';
import { apiGet, apiPost, apiPut, apiDelete } from '@/shared/utils/api';

export const foldersApi = {
  /**
   * Get all folders for the authenticated user
   */
  async getFolders(): Promise<FolderItem[]> {
    const response = await apiGet('/api/folders');

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
    const response = await apiGet(`/api/folders/${id}`);

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
    const response = await apiGet(`/api/folders/${folderId}/notebooks`);

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
    const response = await apiPost('/api/folders', data);

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
    const response = await apiPut(`/api/folders/${id}`, updates);

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
    const response = await apiDelete(`/api/folders/${id}`);

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
