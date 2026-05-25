import React, { useState, useCallback } from "react";
import { X, FileText, Loader2, AlertCircle } from "lucide-react";
import { Id } from "@convex/_generated/dataModel";
import { useUpload } from "../services/documentsApi";

interface ManualPaperModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentId: Id<"documents">) => void;
}

export const ManualPaperModal: React.FC<ManualPaperModalProps> = ({
  notebookId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [abstract, setAbstract] = useState("");
  const [doi, setDoi] = useState("");
  const [venue, setVenue] = useState("");
  const [year, setYear] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useUpload();

  const isValid = title.trim() && authors.trim();

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    setIsUploading(true);
    setError(null);

    try {
      const authorList = authors
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const publicationYear = year.trim() ? parseInt(year.trim(), 10) : undefined;

      const result = await upload({
        notebookId,
        type: "paper_record",
        fileName: title.trim(),
        paperRecord: {
          abstract: abstract.trim(),
          authors: authorList,
          doi: doi.trim() || undefined,
          venue: venue.trim() || undefined,
          publicationYear: publicationYear && !isNaN(publicationYear) ? publicationYear : undefined,
          isOa: false,
          pdfUrl: pdfUrl.trim() || undefined,
          sourceType: "manual",
        },
      });
      onSuccess?.(result.documentId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add paper");
    } finally {
      setIsUploading(false);
    }
  }, [
    isValid,
    title,
    authors,
    abstract,
    doi,
    venue,
    year,
    pdfUrl,
    notebookId,
    upload,
    onSuccess,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    setTitle("");
    setAuthors("");
    setAbstract("");
    setDoi("");
    setVenue("");
    setYear("");
    setPdfUrl("");
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
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Add Paper Manually</h2>
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
            Enter paper details manually. Title and authors are required.
          </p>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Paper title"
              className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isUploading}
            />
          </div>

          {/* Authors */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Authors <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="Author names, comma-separated"
              className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isUploading}
            />
            <p className="text-xs text-muted-foreground">Separate multiple authors with commas</p>
          </div>

          {/* Abstract */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Abstract</label>
            <textarea
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Paper abstract"
              rows={4}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              disabled={isUploading}
            />
          </div>

          {/* DOI, Venue, Year, PDF URL - 2 column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">DOI</label>
              <input
                type="text"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder="e.g., 10.1038/s41586-020-2649-2"
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Venue</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Journal or conference"
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Year</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="Publication year"
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">PDF URL</label>
              <input
                type="text"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || isUploading}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Add Paper
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualPaperModal;
