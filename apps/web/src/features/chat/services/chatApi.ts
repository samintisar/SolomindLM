import { ReferenceChunk } from '@/shared/types/index';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ============================================================
// Types
// ============================================================

// API response format (with created_at as string)
export interface ApiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  references?: ReferenceChunk[];
  metadata?: Record<string, any>;
}

export interface ChatHistoryResponse {
  conversationId: string;
  title: string;
  messages: ApiMessage[];
}

export interface SendMessageCallbacks {
  onToken: (token: string) => void;
  onReferences: (references: ReferenceChunk[]) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get auth headers for API requests
 */
function getAuthHeaders(): HeadersInit {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.accessToken}`,
      };
    } catch {
      // Invalid stored user, continue without auth
    }
  }
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Get userId from localStorage
 */
function getUserId(): string | null {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return user.id || user.user?.id || null;
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================================
// Chat API Service
// ============================================================

export const chatApi = {
  /**
   * Send a message and stream the response via SSE
   */
  async sendMessage(
    notebookId: string,
    message: string,
    callbacks: SendMessageCallbacks,
    documentIds?: string[]
  ): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      callbacks.onError('User not authenticated. Please log in.');
      return;
    }

    const requestBody = {
      userId,
      notebookId,
      message,
      documentIds,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body received');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataLine = line.slice(6);

            // Skip keep-alive
            if (dataLine.trim().startsWith(':')) {
              continue;
            }

            try {
              const data = JSON.parse(dataLine);

              if (data.type === 'token') {
                callbacks.onToken(data.content);
              } else if (data.type === 'references') {
                callbacks.onReferences(data.data);
              } else if (data.type === 'done') {
                callbacks.onComplete();
              } else if (data.type === 'error') {
                callbacks.onError(data.error);
              }
            } catch (e) {
              // Failed to parse SSE data, skip
            }
          }
        }
      }
    } catch (error) {
      callbacks.onError(error instanceof Error ? error.message : 'Failed to send message');
    }
  },

  /**
   * Get conversation history for a notebook
   */
  async getHistory(notebookId: string, limit = 50): Promise<ChatHistoryResponse> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({
      userId,
      limit: limit.toString(),
    });

    const response = await fetch(
      `${API_BASE_URL}/api/chat/history/${notebookId}?${params.toString()}`,
      { headers: getAuthHeaders() }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to fetch conversation history');
    }

    const data = await response.json();
    return data;
  },

  /**
   * Clear conversation history for a notebook
   */
  async clearHistory(notebookId: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/chat/history/${notebookId}?${params.toString()}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to clear conversation history');
    }
  },

  /**
   * Delete a conversation
   */
  async deleteConversation(notebookId: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/chat/conversation/${notebookId}?${params.toString()}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to delete conversation');
    }
  },

  /**
   * Rename a conversation
   */
  async renameConversation(notebookId: string, title: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/chat/rename/${notebookId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, title }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to rename conversation');
    }
  },
};
