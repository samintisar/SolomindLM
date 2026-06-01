import { Id } from "@convex/_generated/dataModel";
import { AlertCircle, Library, Loader2, Upload, X } from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  useBulkUpload,
  useGetExistingPapers,
  useParseBibliography,
} from "../services/documentsApi";

interface MendeleyImportModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentIds: Id<"documents">[]) => void;
}

interface ParsedPaper {
  title: string;
  authors: string[];
  abstract?: string;
  doi?: string;
  venue?: string;
  publicationYear?: number;
  isOa?: boolean;
  sourceType?: string;
}

export const MendeleyImportModal: React.FC<MendeleyImportModalProps> = ({
  notebookId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [papers, setPapers] = useState<ParsedPaper[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseBibliography = useParseBibliography();
  const bulkUpload = useBulkUpload();
  const existingPapers = useGetExistingPapers(notebookId);

  const newPapers = useMemo(() => {
    if (!existingPapers) return papers;

    const existingDois = new Set(existingPapers.dois);
    const existingTitleHashes = new Set(existingPapers.titleHashes);

    return papers.filter((paper) => {
      if (paper.doi) {
        const normalizedDoi = paper.doi.toLowerCase().trim();
        if (existingDois.has(normalizedDoi)) return false;
      }

      if (paper.title && paper.authors && paper.authors.length > 0) {
        const firstAuthor = paper.authors[0];
        const hash = `${paper.title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`;
        if (existingTitleHashes.has(hash)) return false;
      }

      return true;
    });
  }, [papers, existingPapers]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setPapers([]);

      const text = await file.text();
      setFileContent(text);

      setIsParsing(true);
      try {
        const result = await parseBibliography({ content: text, format: "auto" });
        setPapers(result.papers);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
      } finally {
        setIsParsing(false);
      }
    },
    [parseBibliography]
  );

  const handleImport = useCallback(async () => {
    if (newPapers.length === 0) return;
    setIsImporting(true);
    setError(null);

    try {
      const papersWithTitle = newPapers.map((p) => ({
        title: p.title || "Untitled",
        abstract: p.abstract || "",
        authors: p.authors || [],
        doi: p.doi,
        venue: p.venue,
        publicationYear: p.publicationYear,
        isOa: p.isOa ?? false,
        sourceType: "mendeley",
      }));

      const result = await bulkUpload({ notebookId, papers: papersWithTitle });
      onSuccess?.(result.documentIds);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import papers");
    } finally {
      setIsImporting(false);
    }
  }, [newPapers, notebookId, bulkUpload, onSuccess, onClose]);

  const handleClose = useCallback(() => {
    setFileContent(null);
    setPapers([]);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const skippedCount = papers.length - newPapers.length;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-2">
            <Library className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Import from Mendeley</h2>
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
            Export your Mendeley library as BibTeX, then upload the file below.
          </p>

          {/* File Upload */}
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".bib"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload <span className="font-medium">.bib</span> file from Mendeley
              </p>
              {fileContent && <p className="text-xs text-primary">File loaded</p>}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Parsing */}
          {isParsing && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Parsing bibliography...</p>
            </div>
          )}

          {/* Results */}
          {papers.length > 0 && !isParsing && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div className="px-3 py-1 bg-secondary/30 rounded-lg">
                  <span className="font-medium">{papers.length}</span> found
                </div>
                {skippedCount > 0 && (
                  <div className="px-3 py-1 bg-warning/10 rounded-lg">
                    <span className="font-medium text-warning">{skippedCount}</span> already in
                    notebook
                  </div>
                )}
                <div className="px-3 py-1 bg-primary/10 rounded-lg">
                  <span className="font-medium text-primary">{newPapers.length}</span> new
                </div>
              </div>

              {/* New Papers Preview */}
              {newPapers.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {newPapers.map((paper, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card"
                    >
                      <Library className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{paper.title || "Untitled"}</p>
                        {paper.authors && paper.authors.length > 0 && (
                          <p className="text-xs text-muted-foreground truncate">
                            {paper.authors.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {newPapers.length === 0 && (
                <div className="bg-secondary/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    All papers from this file are already in your notebook.
                  </p>
                </div>
              )}

              {newPapers.length > 0 && (
                <button
                  onClick={handleImport}
                  disabled={isImporting}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Import {newPapers.length} paper{newPapers.length !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MendeleyImportModal;
