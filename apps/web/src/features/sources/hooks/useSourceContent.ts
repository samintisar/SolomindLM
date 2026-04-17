import { useState, useEffect } from "react";
import { useDocumentContent } from "../services/documentsApi";
import { useAuth } from "@/features/auth/AuthContext";
import { Source } from "@/shared/types";

interface UseSourceContentResult {
  // State
  contentCache: Record<string, string>;
  contentErrors: Record<string, string>;
  loadingContentId: string | null;

  // Content access
  getContent: (sourceId: string) => string | undefined;
  isLoading: (sourceId: string) => boolean;
  hasError: (sourceId: string) => boolean;

  // Actions
  handleCopySourceMarkdown: (sourceId: string, sourceTitle: string) => Promise<void>;
  handleDownloadSourceMarkdown: (sourceId: string, sourceTitle: string) => void;

  // State modifiers
  onContentUpdate: (sourceId: string, content: string) => void;
  onError: (sourceId: string, error: string) => void;
  onLoadingStart: (sourceId: string) => void;

  // Helpers
  normalizeContentNewlines: (raw: string) => string;
}

/**
 * Custom hook for managing source content viewing, caching, and copy/download functionality
 */
export function useSourceContent(): UseSourceContentResult {
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [contentErrors, setContentErrors] = useState<Record<string, string>>({});
  const [loadingContentId, setLoadingContentId] = useState<string | null>(null);
  const { user } = useAuth();

  // Clear cache on user change for isolation
  useEffect(() => {
    setContentCache({});
    setContentErrors({});
    setLoadingContentId(null);
  }, [user?.id]);

  // Normalize newlines so markdown parses correctly (e.g. \r\n -> \n; preserve structure)
  const normalizeContentNewlines = (raw: string) => raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Get content for a specific source
  const getContent = (sourceId: string): string | undefined => {
    return contentCache[sourceId];
  };

  // Check if content is loading for a source
  const isLoading = (sourceId: string): boolean => {
    return loadingContentId === sourceId;
  };

  // Check if there's an error for a source
  const hasError = (sourceId: string): boolean => {
    return Boolean(contentErrors[sourceId]);
  };

  // Copy source markdown to clipboard
  const handleCopySourceMarkdown = async (sourceId: string, _sourceTitle: string) => {
    const markdownContent = contentCache[sourceId];
    if (!markdownContent) return;

    try {
      await navigator.clipboard.writeText(markdownContent);
    } catch (err) {
      console.error("Copy failed:", err);
      throw err;
    }
  };

  // Download source markdown as a file
  const handleDownloadSourceMarkdown = (sourceId: string, sourceTitle: string) => {
    const markdownContent = contentCache[sourceId];
    if (!markdownContent) return;

    const safeName = sourceTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "source";
    const filename = `${safeName}.md`;
    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // State modifiers
  const onContentUpdate = (sourceId: string, content: string) => {
    const normalized = normalizeContentNewlines(content);
    setContentCache((prev) => ({
      ...prev,
      [sourceId]: normalized,
    }));
    // Clear any previous errors
    setContentErrors((prev) => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
    setLoadingContentId(null);
  };

  const onError = (sourceId: string, error: string) => {
    setContentErrors((prev) => ({
      ...prev,
      [sourceId]: error,
    }));
    setLoadingContentId(null);
  };

  const onLoadingStart = (sourceId: string) => {
    setLoadingContentId(sourceId);
  };

  return {
    contentCache,
    contentErrors,
    loadingContentId,
    getContent,
    isLoading,
    hasError,
    handleCopySourceMarkdown,
    handleDownloadSourceMarkdown,
    onContentUpdate,
    onError,
    onLoadingStart,
    normalizeContentNewlines,
  };
}

/**
 * Hook to fetch and cache content for a specific source
 */
export function useSourceContentFetcher(
  source: Source | null | undefined,
  sourceId: string | null,
  onContentUpdate: (sourceId: string, content: string) => void,
  onError: (sourceId: string, error: string) => void,
  onLoadingStart: (sourceId: string) => void
) {
  const documentContent = useDocumentContent(
    source && source.status === "completed" ? sourceId : null
  );

  useEffect(() => {
    if (sourceId && documentContent) {
      if (documentContent.content) {
        onContentUpdate(sourceId, documentContent.content);
      }
    } else if (sourceId && source?.status === "completed") {
      // Check if we've been waiting too long (might be an error)
      if (documentContent === undefined) {
        onLoadingStart(sourceId);
      }
    }
  }, [sourceId, documentContent, source?.status, onContentUpdate, onError, onLoadingStart]);
}
