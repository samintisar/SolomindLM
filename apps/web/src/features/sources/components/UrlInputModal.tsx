import React, { useState, useEffect } from "react";
import { X, Globe, Loader2 } from "lucide-react";
import { useToast } from "@/shared/contexts/useToast";

interface UrlInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (urls: string[]) => Promise<void>;
  isUploading: boolean;
}

export const UrlInputModal: React.FC<UrlInputModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  isUploading,
}) => {
  const { error: showError } = useToast();
  const [urlInput, setUrlInput] = useState("");

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrlInput("");
    }
  }, [isOpen]);

  const handleUpload = async () => {
    if (!urlInput.trim()) return;

    const urls = urlInput
      .split(/\s+/)
      .map((url) => url.trim())
      .filter((url) => url.length > 0 && (url.startsWith("http://") || url.startsWith("https://")));

    if (urls.length === 0) {
      showError("Please enter at least one valid URL (starting with http:// or https://).");
      return;
    }

    try {
      await onUpload(urls);
      onClose();
    } catch {
      // Error already handled in parent
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleUpload();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-xl shadow-2xl border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans">Add Website</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com
https://another-example.com

Separate multiple URLs with spaces or new lines"
            className="w-full h-32 px-4 py-3 bg-background border-2 border-border rounded-xl font-serif focus:border-primary focus:outline-none transition-colors resize-none"
            disabled={isUploading}
            autoFocus
          />
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="flex-1 py-3 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 font-bold font-sans transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!urlInput || isUploading}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-bold font-sans transition-colors flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Adding...
                </>
              ) : (
                "Add Sources"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
