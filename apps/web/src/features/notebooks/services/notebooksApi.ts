import type { NotebookItem } from '@/shared/types/index';
import { apiGet, apiPost, apiPut, apiDelete } from '@/shared/utils/api';

export const notebooksApi = {
  /**
   * Get all notebooks for the authenticated user
   */
  async getNotebooks(): Promise<NotebookItem[]> {
    const response = await apiGet('/api/notebooks');

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error('Failed to fetch notebooks');
    }

    return response.json();
  },

  /**
   * Get a specific notebook by ID
   */
  async getNotebook(id: string): Promise<NotebookItem> {
    const response = await apiGet(`/api/notebooks/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Notebook not found');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error('Failed to fetch notebook');
    }

    return response.json();
  },

  /**
   * Create a new notebook
   */
  async createNotebook(data: {
    title: string;
    coverColor?: string;
    icon?: string;
    isFeatured?: boolean;
  }): Promise<NotebookItem> {
    const response = await apiPost('/api/notebooks', data);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error(errorData.error || 'Failed to create notebook');
    }

    return response.json();
  },

  /**
   * Update a notebook
   */
  async updateNotebook(
    id: string,
    updates: {
      title?: string;
      coverColor?: string;
      icon?: string;
      isFeatured?: boolean;
      folderId?: string | null;
    }
  ): Promise<NotebookItem> {
    const response = await apiPut(`/api/notebooks/${id}`, updates);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('Notebook not found');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error(errorData.error || 'Failed to update notebook');
    }

    return response.json();
  },

  /**
   * Delete a notebook
   */
  async deleteNotebook(id: string): Promise<void> {
    const response = await apiDelete(`/api/notebooks/${id}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('Notebook not found');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in again.');
      }
      throw new Error(errorData.error || 'Failed to delete notebook');
    }
  },

  /**
   * Get notebooks for a specific folder
   */
  async getFolderNotebooks(folderId: string): Promise<NotebookItem[]> {
    const response = await apiGet(`/api/folders/${folderId}/notebooks`);

    if (!response.ok) {
      throw new Error(`Failed to fetch folder notebooks: ${response.statusText}`);
    }

    return response.json();
  },
};

/**
 * Helper function to fetch notebooks for a folder
 */
export async function fetchFolderNotebooks(folderId: string): Promise<NotebookItem[]> {
  return notebooksApi.getFolderNotebooks(folderId);
}
