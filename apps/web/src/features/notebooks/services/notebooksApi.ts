import type { NotebookItem } from '@/shared/types/index';

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

export const notebooksApi = {
  /**
   * Get all notebooks for the authenticated user
   */
  async getNotebooks(): Promise<NotebookItem[]> {
    const response = await fetch(`${API_BASE_URL}/api/notebooks`, {
      headers: getAuthHeaders(),
    });

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
    const response = await fetch(`${API_BASE_URL}/api/notebooks/${id}`, {
      headers: getAuthHeaders(),
    });

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
    const response = await fetch(`${API_BASE_URL}/api/notebooks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

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
    }
  ): Promise<NotebookItem> {
    const response = await fetch(`${API_BASE_URL}/api/notebooks/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });

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
    const response = await fetch(`${API_BASE_URL}/api/notebooks/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

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
};

