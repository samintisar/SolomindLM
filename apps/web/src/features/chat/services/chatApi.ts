import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatStreamSourcePolicy } from "../chatStreamTypes";
import type { SendMessageCallbacks } from "./chatStream";
import { CHAT_STREAM_URL, consumePersistentTextStream } from "./chatStream";

export type {
  ApiMessage,
  ChatError,
  ChatHistoryResponse,
  ParsedStreamData,
  SendMessageCallbacks,
} from "./chatStream";
export { CONVEX_SITE_URL, consumePersistentTextStream, parseStreamBody } from "./chatStream";

// ============================================================
// Chat API Hooks
// ============================================================

/**
 * Get conversation history for a notebook
 */
export function useChatHistory(notebookId: string | null) {
  // First get the conversation for this notebook
  const conversation = useQuery(
    api.chat.conversations.getOrCreate,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );

  // Then get messages for that conversation
  const messages = useQuery(
    api.chat.index.getMessages,
    conversation?._id ? { conversationId: conversation._id } : "skip"
  );

  // Return combined data
  if (!conversation) return undefined;
  return {
    conversationId: conversation._id,
    title: conversation.title || "",
    messages: messages || [],
  };
}

/**
 * Rename a conversation
 * Note: This functionality is not yet implemented in the Convex API
 */
export function useRenameConversation() {
  const renameMutation = useMutation(api.chat.messages.renameConversation);
  return useCallback(
    (conversationId: string, title: string) =>
      renameMutation({ conversationId: conversationId as Id<"conversations">, title }),
    [renameMutation]
  );
}

/**
 * Clear conversation history for a notebook
 */
export function useClearHistory(notebookId: string | null) {
  // Get the conversation for this notebook
  const conversation = useQuery(
    api.chat.conversations.getOrCreate,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );

  const clearMessages = useMutation(api.chat.index.clearMessages);

  return async () => {
    if (!conversation?._id) {
      throw new Error("Conversation not found");
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
  const releaseChatGeneration = useMutation(api.chat.messages.releaseChatGeneration);
  const { isAuthenticated } = useConvexAuth();
  const authToken = useAuthToken();

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      notebookId: string,
      message: string,
      callbacks: SendMessageCallbacks,
      documentIds?: string[],
      deepResearch?: boolean,
      sourcePolicy?: ChatStreamSourcePolicy,
      conversationId?: string,
      attachedDocumentIds?: string[]
    ) => {
      let tempMessageId: string | null;

      // Check authentication and token availability
      if (!isAuthenticated || !authToken) {
        callbacks.onError("Authentication required. Please log in.");
        return;
      }

      // Cancel any ongoing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let streamJobMayHaveStarted = false;

      const releaseGenerationIfSafe = async () => {
        try {
          await releaseChatGeneration({
            notebookId: notebookId as Id<"notebooks">,
            conversationId: conversationId ? (conversationId as Id<"conversations">) : undefined,
          });
        } catch {
          // Best-effort: server job may have already decremented the refcount
        }
      };

      try {
        // Step 1: Send the message with optimistic update
        // This immediately adds the user message to the database
        const result = await sendMessageMutation({
          notebookId: notebookId as Id<"notebooks">,
          message,
          documentIds,
          conversationId: conversationId ? (conversationId as Id<"conversations">) : undefined,
        });

        tempMessageId = result.tempMessageId;
        void tempMessageId; // Reserved for optimistic UI; satisfy noUnusedLocals

        // Step 2: Get auth token for cross-origin requests
        // HTTP actions require JWT token via Authorization header (cookies don't work cross-origin)
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        };

        // Step 3: Start streaming the response
        const response = await fetch(CHAT_STREAM_URL, {
          method: "POST",
          credentials: "include",
          headers,
          signal: abortController.signal,
          body: JSON.stringify({
            notebookId,
            message,
            documentIds,
            conversationId: conversationId || undefined,
            userMessageId: result.messageId,
            deepResearch: deepResearch || undefined,
            sourcePolicy: sourcePolicy ?? undefined,
            attachedDocumentIds: attachedDocumentIds ?? undefined,
          }),
        });

        if (!response.ok) {
          await releaseGenerationIfSafe();
          if (response.status === 401) {
            window.dispatchEvent(new CustomEvent("auth-session-expired"));
            callbacks.onError("Session expired. Please log in again.");
            return;
          }
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        streamJobMayHaveStarted = true;

        await consumePersistentTextStream(response, callbacks, abortController.signal);
      } catch (error) {
        if (!streamJobMayHaveStarted) {
          await releaseGenerationIfSafe();
        }
        // If aborted, call onStopped instead of onError
        if (error instanceof Error && error.name === "AbortError") {
          callbacks.onStopped?.();
        } else {
          callbacks.onError(error instanceof Error ? error.message : "Failed to send message");
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [sendMessageMutation, releaseChatGeneration, isAuthenticated, authToken]
  );

  const stopChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return { sendMessage, stopChat };
}

/**
 * Set thumbs up/down feedback on an assistant message.
 * Pass null to remove existing feedback.
 */
export function useSetMessageFeedback() {
  const setFeedback = useMutation(api.chat.messages.setMessageFeedback);
  return useCallback(
    (messageId: string, feedback: "up" | "down" | null) =>
      setFeedback({ messageId: messageId as Id<"messages">, feedback }),
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
    })
      .then((data: any) => {
        if (cancelled) return;
        setResult({
          summary: data?.summary ?? null,
          suggestions: data?.suggestions ?? null,
          isLoading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ summary: null, suggestions: null, isLoading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [notebookId, documentSignature, sourceSuggestions]);

  return result;
}
