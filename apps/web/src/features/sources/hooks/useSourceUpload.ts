import { useState } from "react";
import { useUserLimits } from "@/features/billing/services/subscriptionApi";
import { useToast } from "@/shared/contexts/useToast";
import { useLimitErrorToast } from "@/shared/hooks/useLimitErrorToast";
import { canOfferPurchases } from "@/utils/platformDetection";
import { useCreateDocument, useUploadDocument } from "../services/documentsApi";

interface UseSourceUploadProps {
  sourcesCount: number;
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
}

export interface SourceUpload {
  isUploading: boolean;
  processFiles: (files: File[]) => Promise<void>;
  handleUrlUpload: (urls: string[]) => Promise<void>;
  handleSocialMediaUpload: (urls: string[]) => Promise<void>;
  handleTextUpload: (text: string, title?: string) => Promise<void>;
}

interface LinkUpload {
  type: "url" | "youtube";
  /** What the sign-in prompt says the user is uploading. */
  noun: string;
  /** Prefix for console errors. */
  logLabel: string;
  fileName: (url: string) => string;
}

const WEBSITE_LINKS: LinkUpload = {
  type: "url",
  noun: "URLs",
  logLabel: "URL",
  fileName: (url) => url,
};

// YouTube, TikTok, Instagram and X all go through the transcript pipeline.
const VIDEO_LINKS: LinkUpload = {
  type: "youtube",
  noun: "social media content",
  logLabel: "Social media",
  fileName: () => "YouTube Video",
};

/**
 * Custom hook for handling source uploads (files, URLs, social media, text)
 */
export function useSourceUpload({
  sourcesCount,
  userId,
  noteId,
  onDocumentUploaded,
}: UseSourceUploadProps): SourceUpload {
  const uploadDocument = useUploadDocument();
  const createDocument = useCreateDocument();
  const userLimits = useUserLimits();
  const { handleLimitError } = useLimitErrorToast();
  const { error: showError, info: showInfo } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const maxSources = userLimits.sourceLimit;
  // Until the subscription resolves the cap isn't known; don't block client-side
  // (the server still enforces it) so a Pro user isn't gated on the free cap.
  const atSourceLimit = !userLimits.isLoading && sourcesCount >= maxSources;

  // Shared "source limit reached" toast. Upgrading to Pro raises the per-notebook
  // source cap 20 -> 200, so free users are told that; Pro users only hear the
  // remove-a-source path. The native app can't sell Pro and drops upgrade copy,
  // so the remove-a-source hint rides in the error message there.
  const emitSourceLimitReached = () => {
    const limitMessage = `You've reached your source limit (${sourcesCount}/${maxSources}).`;
    const upgradeHint = userLimits.isPremium
      ? "Remove a source to add another."
      : "Upgrade to Pro for up to 200 sources per notebook, or remove a source to add another.";
    return handleLimitError(
      new Error(`Source limit reached (${sourcesCount}/${maxSources}). ${upgradeHint}`),
      canOfferPurchases()
        ? {
            errorMessage: limitMessage,
            upgradeMessage: `This notebook allows up to ${maxSources} sources. ${upgradeHint}`,
          }
        : { errorMessage: `${limitMessage} Remove a source to add another.` }
    );
  };

  /** The notebook to upload into, or null after telling the user why they can't. */
  const guard = async (noun: string): Promise<string | null> => {
    if (!userId || !noteId) {
      showInfo(`Please log in and select a notebook before uploading ${noun}.`);
      return null;
    }
    if (atSourceLimit) {
      await emitSourceLimitReached();
      return null;
    }
    return noteId;
  };

  const showUploadError = async (err: unknown) => {
    const handled = await handleLimitError(err);
    if (!handled.isLimitError) {
      showError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  // Process files (used by both file input and drag & drop)
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const notebookId = await guard("files");
    if (!notebookId) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const response = await uploadDocument(file, notebookId);
        onDocumentUploaded?.(response.documentId);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      await showUploadError(err);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadLinks = async (urls: string[], link: LinkUpload) => {
    const notebookId = await guard(link.noun);
    if (!notebookId) return;

    if (urls.length === 0) {
      showError("Please enter at least one valid URL (starting with http:// or https://).");
      return;
    }

    const errors: string[] = [];
    setIsUploading(true);
    try {
      for (const url of urls) {
        try {
          const result = await createDocument({
            notebookId,
            type: link.type,
            source: url,
            fileName: link.fileName(url),
          });
          onDocumentUploaded?.(result.documentId);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Upload failed";
          errors.push(`${url}: ${errorMsg}`);
          console.error(`${link.logLabel} upload failed for ${url}:`, err);
        }
      }
    } finally {
      setIsUploading(false);
    }

    if (errors.length > 0 && errors.length === urls.length) {
      showError(`Failed to upload all URLs: ${errors.join("; ")}`, { duration: 10_000 });
      // Rejecting lets the link form keep the user's input instead of closing.
      throw new Error("No URLs could be added");
    }
    if (errors.length > 0) {
      showError(`Some URLs failed: ${errors.join("; ")}`, { duration: 10_000 });
    }
  };

  const handleTextUpload = async (text: string, title?: string) => {
    const notebookId = await guard("text");
    if (!notebookId) return;

    setIsUploading(true);
    try {
      const result = await createDocument({
        notebookId,
        type: "text",
        source: text,
        // A blank title keeps the placeholder; processing then writes one from the text.
        fileName: title?.trim() || "Pasted text",
      });
      onDocumentUploaded?.(result.documentId);
    } catch (err) {
      console.error("Text upload failed:", err);
      await showUploadError(err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    isUploading,
    processFiles,
    handleUrlUpload: (urls) => uploadLinks(urls, WEBSITE_LINKS),
    handleSocialMediaUpload: (urls) => uploadLinks(urls, VIDEO_LINKS),
    handleTextUpload,
  };
}
