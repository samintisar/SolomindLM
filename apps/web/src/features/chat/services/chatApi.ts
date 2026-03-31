import { ReferenceChunk } from '@/shared/types/index';
import { useQuery, useMutation, useAction, useConvexAuth } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useAuthToken } from '@convex-dev/auth/react';

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
  toolCall?: { tool: string; query: string; status: 'searching' | 'done'; resultCount?: number };
  followUps?: string[];
  clarification?: { question: string };
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
// API Response Types
// ============================================================

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
  onToolCall?: (toolCall: { tool: string; query: string; status: 'searching' | 'done'; resultCount?: number }) => void;
  onFollowUps?: (questions: string[]) => void;
  onClarification?: (question: string) => void;
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
    } else if (line.startsWith('__TOOL_CALL:')) {
      try {
        result.toolCall = JSON.parse(line.slice('__TOOL_CALL:'.length));
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith('__FOLLOWUPS:')) {
      try {
        result.followUps = JSON.parse(line.slice('__FOLLOWUPS:'.length));
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith('__CLARIFICATION:')) {
      try {
        result.clarification = JSON.parse(line.slice('__CLARIFICATION:'.length));
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
    api.chat.conversations.getOrCreate,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );

  // Then get messages for that conversation
  const messages = useQuery(
    api.chat.index.getMessages,
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
  return async (_conversationId: string, _title: string) => {
    throw new Error('Rename conversation is not yet implemented');
  };
}

/**
 * Clear conversation history for a notebook
 */
export function useClearHistory(notebookId: string | null) {
  // Get the conversation for this notebook
  const conversation = useQuery(
    api.chat.conversations.getOrCreate,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );

  const clearMessages = useMutation(api.chat.index.clearMessages);

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
export function useSendMessage() {
  const sendMessageMutation = useMutation(api.chat.messages.sendMessageOptimistic);
  const { isAuthenticated } = useConvexAuth();
  const authToken = useAuthToken();

  const sendMessage = useCallback(async (
    notebookId: string,
    message: string,
    callbacks: SendMessageCallbacks,
    documentIds?: string[]
  ) => {
    let tempMessageId: string | null = null;

    // Check authentication and token availability
    if (!isAuthenticated || !authToken) {
      callbacks.onError('Authentication required. Please log in.');
      return;
    }

    try {
      // Step 1: Send the message with optimistic update
      // This immediately adds the user message to the database
      const result = await sendMessageMutation({
        notebookId: notebookId as Id<'notebooks'>,
        message,
        documentIds,
      });

      tempMessageId = result.tempMessageId;
      void tempMessageId; // Reserved for optimistic UI; satisfy noUnusedLocals

      // Step 2: Get auth token for cross-origin requests
      // HTTP actions require JWT token via Authorization header (cookies don't work cross-origin)
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
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
      let lastReferencesJson: string | null = null;
      let lastToolCallJson: string | null = null;
      let lastFollowUpsJson: string | null = null;

      try {
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

          // Handle metadata (dedupe: parseStreamBody re-scans the full buffer every chunk)
          if (parsed.references) {
            const j = JSON.stringify(parsed.references);
            if (j !== lastReferencesJson) {
              lastReferencesJson = j;
              callbacks.onReferences(parsed.references);
            }
          }
          if (parsed.status) {
            callbacks.onStatus?.(parsed.status.status, parsed.status.message);
          }
          if (parsed.toolCall) {
            const j = JSON.stringify(parsed.toolCall);
            if (j !== lastToolCallJson) {
              lastToolCallJson = j;
              callbacks.onToolCall?.(parsed.toolCall);
            }
          }
          if (parsed.followUps) {
            const j = JSON.stringify(parsed.followUps);
            if (j !== lastFollowUpsJson) {
              lastFollowUpsJson = j;
              callbacks.onFollowUps?.(parsed.followUps);
            }
          }
          if (parsed.clarification) {
            callbacks.onClarification?.(parsed.clarification.question);
          }
          if (parsed.groundingCheck) {
            console.log('[Chat] Grounding check:', parsed.groundingCheck);
          }
          if (parsed.error) {
            callbacks.onError(parsed.error);
            break;
          }
          if (parsed.isDone) {
            completed = true;
            callbacks.onComplete();
            try {
              await reader.cancel();
            } catch {
              /* stream may already be closed */
            }
            break;
          }

          // Stream ended: ensure we always clear loading state even if __DONE wasn't in buffer
          if (done) {
            if (!completed) {
              callbacks.onComplete();
            }
            break;
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* already released or locked by cancel */
        }
      }
    } catch (error) {
      callbacks.onError(error instanceof Error ? error.message : 'Failed to send message');
    }
  }, [sendMessageMutation, isAuthenticated, authToken]);

  return sendMessage;
}

/**
 * Set thumbs up/down feedback on an assistant message.
 * Pass null to remove existing feedback.
 */
export function useSetMessageFeedback() {
  const setFeedback = useMutation(api.chat.messages.setMessageFeedback);
  return useCallback(
    (messageId: string, feedback: 'up' | 'down' | null) =>
      setFeedback({ messageId: messageId as Id<'messages'>, feedback }),
    [setFeedback]
  );
}

interface SourceSuggestionsResult {
  summary: string | null;
  suggestions: string[] | null;
  isLoading: boolean;
}

export function useSourceSuggestions(
  notebookId: string | null,
  documents: any[]
): SourceSuggestionsResult {
  const [result, setResult] = useState<SourceSuggestionsResult>({
    summary: null,
    suggestions: null,
    isLoading: false,
  });
  const fetchedSignatureRef = useRef<string | null>(null);

  const sourceSuggestions = useAction(api.chat.sourceSuggestions.getSourceSuggestions);

  const documentSignature = useMemo(() => {
    const completed = documents.filter((d: any) => d.status === "completed");
    return completed
      .map((d: any) => `${d._id}:${d.fileName}:${d.wordCount ?? 0}:${d.totalChunks ?? 0}`)
      .join("|");
  }, [documents]);

  useEffect(() => {
    if (!notebookId || !documentSignature) {
      setResult({ summary: null, suggestions: null, isLoading: false });
      fetchedSignatureRef.current = null;
      return;
    }

    // Skip if already fetched this signature
    if (fetchedSignatureRef.current === documentSignature) return;
    fetchedSignatureRef.current = documentSignature;

    let cancelled = false;
    setResult((prev) => ({ ...prev, isLoading: true }));

    sourceSuggestions({
      notebookId: notebookId as Id<"notebooks">,
      documentSignature,
    }).then((data: any) => {
      if (cancelled) return;
      setResult({
        summary: data?.summary ?? null,
        suggestions: data?.suggestions ?? null,
        isLoading: false,
      });
    }).catch(() => {
      if (cancelled) return;
      setResult({ summary: null, suggestions: null, isLoading: false });
    });

    return () => { cancelled = true; };
  }, [notebookId, documentSignature, sourceSuggestions]);

  return result;
}
