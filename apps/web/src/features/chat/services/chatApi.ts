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

    console.log(`[chatApi] ========== SEND MESSAGE START ==========`);
    console.log(`[chatApi] notebookId=${notebookId}`);
    console.log(`[chatApi] message="${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
    console.log(`[chatApi] API_BASE_URL=${API_BASE_URL}`);
    if (documentIds && documentIds.length > 0) {
      console.log(`[chatApi] documentIds=${documentIds.length} selected documents`);
    }

    const requestBody = {
      userId,
      notebookId,
      message,
      documentIds,
    };
    console.log(`[chatApi] Request body:`, requestBody);

    try {
      console.log(`[chatApi] Fetching ${API_BASE_URL}/api/chat/message...`);
      const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      console.log(`[chatApi] Response status: ${response.status} ${response.statusText}`);
      console.log(`[chatApi] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`[chatApi] Error response:`, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        console.error('[chatApi] No response body');
        throw new Error('No response body received');
      }

      console.log('[chatApi] Starting to read SSE stream...');
      let buffer = '';
      let messageCount = 0;
      let tokenCount = 0;
      let startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[chatApi] Stream done signal received');
          break;
        }

        const chunkSize = value.length;
        buffer += decoder.decode(value, { stream: true });
        console.log(`[chatApi] Received chunk: ${chunkSize} bytes, buffer length: ${buffer.length}`);

        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            messageCount++;
            const dataLine = line.slice(6);
            console.log(`[chatApi] SSE message ${messageCount}: "${dataLine.substring(0, 100)}..."`);

            // Skip keep-alive
            if (dataLine.trim().startsWith(':')) {
              console.log('[chatApi] Skipping keep-alive');
              continue;
            }

            try {
              const data = JSON.parse(dataLine);
              console.log(`[chatApi] Parsed SSE data: type=${data.type}`);

              if (data.type === 'token') {
                tokenCount++;
                const token = data.content;
                console.log(`[chatApi] Token ${tokenCount}: "${token.substring(0, 30)}..."`);
                callbacks.onToken(token);
              } else if (data.type === 'references') {
                console.log(`[chatApi] References: ${data.data.length} items`);
                console.log(`[chatApi] Reference data:`, data.data);
                callbacks.onReferences(data.data);
              } else if (data.type === 'done') {
                console.log('[chatApi] Done signal received');
                callbacks.onComplete();
              } else if (data.type === 'error') {
                console.error('[chatApi] Server error:', data.error);
                callbacks.onError(data.error);
              }
            } catch (e) {
              console.error('[chatApi] Failed to parse SSE data:', dataLine, e);
            }
          }
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`[chatApi] ========== STREAM COMPLETE ==========`);
      console.log(`[chatApi] Total messages: ${messageCount}`);
      console.log(`[chatApi] Total tokens: ${tokenCount}`);
      console.log(`[chatApi] Time elapsed: ${elapsed}ms`);
    } catch (error) {
      console.error('[chatApi] ========== SEND MESSAGE ERROR ==========');
      console.error('[chatApi] Error:', error);
      if (error instanceof Error) {
        console.error('[chatApi] Error name:', error.name);
        console.error('[chatApi] Error message:', error.message);
      }
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
    console.log(`[chatApi] Loaded history: ${data.messages.length} messages`);
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

    console.log('[chatApi] Cleared conversation history');
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

    console.log('[chatApi] Deleted conversation');
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

    console.log('[chatApi] Renamed conversation to:', title);
  },
};
