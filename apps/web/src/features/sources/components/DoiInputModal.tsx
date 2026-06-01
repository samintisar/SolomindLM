import { Id } from "@convex/_generated/dataModel";
import { AlertCircle, BookOpen, Loader2, Search, X } from "lucide-react";
import React, { useCallback, useState } from "react";
import { useResolveDoi, useUpload } from "../services/documentsApi";

interface DoiInputModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentId: Id<"documents">) => void;
}

interface ResolvedPaper {
  title: string;
  authors: string[];
  abstract?: string;
  doi?: string;
  venue?: string;
  publicationYear?: number;
  isOa?: boolean;
  sourceType?: string;
  pdfUrl?: string;
  landingPageUrl?: string;
}

export const DoiInputModal: React.FC<DoiInputModalProps> = ({
  notebookId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [doi, setDoi] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<ResolvedPaper | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveDoi = useResolveDoi();
  const upload = useUpload();

  const handleResolve = useCallback(async () => {
    if (!doi.trim()) return;
    setIsResolving(true);
    setError(null);
    setPreview(null);

    try {
      const result = await resolveDoi({ doi: doi.trim() });
      if (result) {
        setPreview(result);
      } else {
        setError("Could not resolve DOI. Please check the DOI and try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve DOI");
    } finally {
      setIsResolving(false);
    }
  }, [doi, resolveDoi]);

  const handleAddToNotebook = useCallback(async () => {
    if (!preview) return;
    setIsUploading(true);
    setError(null);

    try {
      const { title, ...paperRecordFields } = preview;
      const result = await upload({
        notebookId,
        type: "paper_record",
        fileName: title || doi.trim(),
        paperRecord: paperRecordFields,
      });
      onSuccess?.(result.documentId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add paper");
    } finally {
      setIsUploading(false);
    }
  }, [preview, doi, notebookId, upload, onSuccess, onClose]);

  const handleClose = useCallback(() => {
    setDoi("");
    setPreview(null);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Import from DOI</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-6 bg-card/50">
          <p className="text-muted-foreground text-sm">
            Enter a DOI to automatically fetch paper metadata.
          </p>

          {/* DOI Input */}
          <div className="flex gap-3">
            <input
              type="text"
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
              placeholder="e.g., 10.1038/s41586-020-2649-2"
              className="flex-1 w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => e.key === "Enter" && handleResolve()}
              disabled={isResolving || isUploading}
            />
            <button
              onClick={handleResolve}
              disabled={!doi.trim() || isResolving || isUploading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isResolving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Resolve
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="border border-border/50 rounded-xl p-5 space-y-4 bg-card shadow-sm">
              <h3 className="font-semibold text-lg">{preview.title || "Untitled Paper"}</h3>
              {preview.authors && preview.authors.length > 0 && (
                <p className="text-sm text-muted-foreground">{preview.authors.join(", ")}</p>
              )}
              {preview.abstract && (
                <p className="text-sm text-muted-foreground line-clamp-4">{preview.abstract}</p>
              )}
              <div className="flex gap-4 text-xs text-muted-foreground">
                {preview.venue && <span>Venue: {preview.venue}</span>}
                {preview.publicationYear && <span>Year: {preview.publicationYear}</span>}
                {preview.doi && <span>DOI: {preview.doi}</span>}
              </div>
              <button
                onClick={handleAddToNotebook}
                disabled={isUploading}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BookOpen className="w-4 h-4" />
                )}
                Add to Notebook
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoiInputModal;
