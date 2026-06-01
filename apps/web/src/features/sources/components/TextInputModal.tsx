import { FileText, Loader2, X } from "lucide-react";
import React, { useEffect, useState } from "react";

interface TextInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (text: string) => Promise<void>;
  isUploading: boolean;
}

export const TextInputModal: React.FC<TextInputModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  isUploading,
}) => {
  const [textInput, setTextInput] = useState("");

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTextInput("");
    }
  }, [isOpen]);

  const handleUpload = async () => {
    if (!textInput.trim()) return;

    try {
      await onUpload(textInput);
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
      <div className="relative w-full max-w-2xl bg-card rounded-xl shadow-2xl border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans">Paste Text</h2>
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
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste your text here..."
            className="w-full h-48 px-4 py-3 bg-background border-2 border-border rounded-xl font-serif focus:border-primary focus:outline-none transition-colors resize-none"
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
              disabled={!textInput || isUploading}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-bold font-sans transition-colors flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Adding...
                </>
              ) : (
                "Add Source"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
