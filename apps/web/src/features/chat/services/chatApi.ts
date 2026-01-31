import { ReferenceChunk } from '@/shared/types/index';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useStream } from '@convex-dev/persistent-text-streaming/react';
import { useRef, useState, useCallback } from 'react';
import { useConvexAuth } from 'convex/react';

// Convex HTTP actions use the .site URL. Derive from .cloud if only VITE_CONVEX_URL is set.
const CONVEX_SITE_URL =
  import.meta.env.VITE_CONVEX_SITE_URL ||
  import.meta.env.VITE_CONVEX_URL?.replace('.cloud', '.site');
if (!CONVEX_SITE_URL) {
  throw new Error(
    'VITE_CONVEX_URL or VITE_CONVEX_SITE_URL is required for chat. Set in apps/web/.env.local (dev) or hosting env (prod).'
  );
}

/** Chat streaming uses Convex HTTP action endpoint */
const CHAT_STREAM_URL = `${CONVEX_SITE_URL}/chat/stream`;

// ============================================================
// Types
// ============================================================

// Parsed stream data with metadata markers
export interface ParsedStreamData {
  text: string;
  references?: ReferenceChunk[];
  status?: { status: string; message: string };
  groundingCheck?: { passed: boolean; issues: string[]; message: string };
  error?: { message: string; type?: string };
  isDone: boolean;
}

// API response format (with created_at as string)
export interface ApiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  references?: ReferenceChunk[];
  metadata?: Record<string, any>;
}

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

export interface ChatError {
  message: string;
  type?: string;
}

export interface SendMessageCallbacks {
  onToken: (token: string) => void;
  onReferences: (references: ReferenceChunk[]) => void;
  onStatus?: (status: string, message?: string) => void;
  onComplete: () => void;
  onError: (error: string | ChatError) => void;
}

/**
 * Parse stream body with metadata markers
 * Extracts special markers like __REFERENCES:, __STATUS:, __GROUNDING:, __ERROR:, __DONE
 */
export function parseStreamBody(body: string): ParsedStreamData {
  const result: ParsedStreamData = {
    text: '',
    isDone: false,
  };

  // Process the body line by line
  const lines = body.split('\n');
  let currentText = '';

  for (const line of lines) {
    if (line.startsWith('__REFERENCES:')) {
      try {
        const jsonStr = line.slice('__REFERENCES:'.length);
        result.references = JSON.parse(jsonStr);
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith('__STATUS:')) {
      try {
        const parts = line.slice('__STATUS:'.length).split(':', 2);
        if (parts.length >= 2) {
          result.status = { status: parts[0], message: parts[1] };
        }
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith('__GROUNDING:')) {
      try {
        const jsonStr = line.slice('__GROUNDING:'.length);
        result.groundingCheck = JSON.parse(jsonStr);
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith('__ERROR:')) {
      try {
        const jsonStr = line.slice('__ERROR:'.length);
        result.error = JSON.parse(jsonStr);
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith('__DONE')) {
      result.isDone = true;
    } else {
      // Regular text content
      currentText += line + '\n';
    }
  }

  result.text = currentText.trimEnd();
  return result;
}

// ============================================================
// Chat API Service
// ============================================================

/**
 * Get conversation history for a notebook
 */
export function useChatHistory(notebookId: string | null) {
  // First get the conversation for this notebook
  const conversation = useQuery(
    api.conversations.getOrCreate,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );

  // Then get messages for that conversation
  const messages = useQuery(
    api.chat.getMessages,
    conversation?._id ? { conversationId: conversation._id } : 'skip'
  );

  // Return combined data
  if (!conversation) return undefined;
  return {
    conversationId: conversation._id,
    title: conversation.title || '',
    messages: messages || [],
  };
}

/**
 * Rename a conversation
 * Note: This functionality is not yet implemented in the Convex API
 */
export function useRenameConversation() {
  // TODO: Implement updateTitle mutation in convex/chat.ts
  return async (conversationId: string, title: string) => {
    throw new Error('Rename conversation is not yet implemented');
  };
}

/**
 * Clear conversation history for a notebook
 */
export function useClearHistory(notebookId: string | null) {
  // Get the conversation for this notebook
  const conversation = useQuery(
    api.conversations.getOrCreate,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );

  const clearMessages = useMutation(api.chat.clearMessages);

  return async () => {
    if (!conversation?._id) {
      throw new Error('Conversation not found');
    }
    return await clearMessages({
      conversationId: conversation._id,
    });
  };
}

/**
 * Send a message using Persistent Text Streaming with optimistic updates
 *
 * This function:
 * 1. Immediately adds the user message to the UI (optimistic update)
 * 2. Streams the response in real-time as it's generated
 * 3. Handles network failures gracefully with stream persistence
 */
export function useSendMessageV2() {
  const sendMessageMutation = useMutation(api.messages.sendMessageOptimistic);
  const { isAuthenticated } = useConvexAuth();

  const sendMessage = useCallback(async (
    notebookId: string,
    message: string,
    callbacks: SendMessageCallbacks,
    documentIds?: string[]
  ) => {
    let tempMessageId: string | null = null;

    try {
      // Step 1: Send the message with optimistic update
      // This immediately adds the user message to the database
      const result = await sendMessageMutation({
        notebookId: notebookId as Id<'notebooks'>,
        message,
        documentIds,
      });

      tempMessageId = result.tempMessageId;

      // Step 2: Get auth token for cross-origin requests
      // With @convex-dev/auth, cookies are automatically handled by the Convex client
      // For cross-origin requests, we rely on cookies being sent
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Step 3: Start streaming the response
      const response = await fetch(CHAT_STREAM_URL, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          notebookId,
          message,
          documentIds,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent('auth-session-expired'));
          callbacks.onError('Session expired. Please log in again.');
          return;
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Step 4: Read the streaming response
      // With Persistent Text Streaming, this is raw text with embedded metadata
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body received');
      }

      let buffer = '';
      let lastProcessedLength = 0;
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        // Parse the current buffer for metadata markers (including final chunk when done)
        const parsed = parseStreamBody(buffer);

        // Only call onToken with new text since last processed
        if (parsed.text.length > lastProcessedLength) {
          const newText = parsed.text.slice(lastProcessedLength);
          callbacks.onToken(newText);
          lastProcessedLength = parsed.text.length;
        }

        // Handle metadata
        if (parsed.references) {
          callbacks.onReferences(parsed.references);
        }
        if (parsed.status) {
          callbacks.onStatus?.(parsed.status.status, parsed.status.message);
        }
        if (parsed.groundingCheck) {
          // You can add a callback for grounding checks if needed
          console.log('[Chat] Grounding check:', parsed.groundingCheck);
        }
        if (parsed.error) {
          callbacks.onError(parsed.error);
          return;
        }
        if (parsed.isDone) {
          completed = true;
          callbacks.onComplete();
          return;
        }

        // Stream ended: ensure we always clear loading state even if __DONE wasn't in buffer
        if (done) {
          if (!completed) {
            callbacks.onComplete();
          }
          break;
        }
      }
    } catch (error) {
      callbacks.onError(error instanceof Error ? error.message : 'Failed to send message');
    }
  }, [sendMessageMutation]);

  return sendMessage;
}

/**
 * Legacy Send a message and stream the response via SSE
 * @deprecated Use useSendMessageV2() instead for better performance and persistence
 */
export async function sendMessage(
  notebookId: string,
  message: string,
  callbacks: SendMessageCallbacks,
  documentIds?: string[]
): Promise<void> {
  try {
    // With @convex-dev/auth, cookies are automatically handled
    const response = await fetch(CHAT_STREAM_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notebookId,
        message,
        documentIds,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Notify the app about auth expiration
        window.dispatchEvent(new CustomEvent('auth-session-expired'));
        callbacks.onError('Session expired. Please log in again.');
        return;
      }

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
            } else if (data.type === 'status') {
              callbacks.onStatus?.(data.status, data.message);
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
}

/**
 * Legacy method for getting history (for backward compatibility)
 * @deprecated Use useChatHistory hook instead
 */
export async function getHistory(notebookId: string, limit = 50): Promise<ChatHistoryResponse> {
  // This is now handled by the useChatHistory hook
  throw new Error('getHistory() is deprecated. Use useChatHistory hook instead.');
}

/**
 * Legacy method for clearing history (for backward compatibility)
 * @deprecated Use useClearHistory hook instead
 */
export async function clearHistory(notebookId: string): Promise<void> {
  // This is now handled by the useClearHistory hook
  throw new Error('clearHistory() is deprecated. Use useClearHistory hook instead.');
}

/**
 * Legacy method for deleting conversation (for backward compatibility)
 * @deprecated Use useClearHistory hook instead
 */
export async function deleteConversation(notebookId: string): Promise<void> {
  // This is now handled by the useClearHistory hook
  throw new Error('deleteConversation() is deprecated. Use useClearHistory hook instead.');
}

/**
 * Legacy method for renaming conversation (for backward compatibility)
 * @deprecated Use useRenameConversation hook instead
 */
export async function renameConversation(notebookId: string, title: string): Promise<void> {
  // This is now handled by the useRenameConversation hook
  throw new Error('renameConversation() is deprecated. Use useRenameConversation hook instead.');
}

// ============================================================
// Legacy API object for backward compatibility
// ============================================================

/**
 * Legacy API object for backward compatibility
 * @deprecated Use individual hooks instead
 */
export const chatApi = {
  // Hooks
  useChatHistory,
  useRenameConversation,
  useClearHistory,

  // Streaming methods
  sendMessage,
  useSendMessageV2,

  // Utilities
  parseStreamBody,

  // Legacy methods (deprecated)
  getHistory,
  clearHistory,
  deleteConversation,
  renameConversation,
};
