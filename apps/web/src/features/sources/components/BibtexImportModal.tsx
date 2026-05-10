import React, { useState, useCallback, useRef } from "react";
import { X, FileText, Upload, Loader2, AlertCircle, CheckSquare, Square } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

interface BibtexImportModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentIds: Id<"documents">[]) => void;
}

type Tab = "file" | "paste";

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

export const BibtexImportModal: React.FC<BibtexImportModalProps> = ({
  notebookId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("file");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [papers, setPapers] = useState<ParsedPaper[]>([]);
  const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<{ total: number; withDoi: number; withoutDoi: number; malformed: number } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseBibliography = useMutation(api.documents.parseBibliography);
  const bulkUpload = useMutation(api.documents.bulkUpload);

  const handleParse = useCallback(async (content: string) => {
    if (!content.trim()) return;
    setIsParsing(true);
    setError(null);

    try {
      const format: "auto" | "bibtex" | "ris" = activeTab === "file"
        ? (fileContent?.trim().startsWith("TY  -") ? "ris" : "auto")
        : "auto";

      const result = await parseBibliography({ content, format });
      setPapers(result.papers);
      setStats(result.stats);
      setWarnings(result.warnings || []);
      setSelectedPapers(new Set(result.papers.map((_paper: ParsedPaper, i: number) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse bibliography");
    } finally {
      setIsParsing(false);
    }
  }, [activeTab, fileContent, parseBibliography]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPapers([]);
    setSelectedPapers(new Set());
    setStats(null);
    setWarnings([]);

    const text = await file.text();
    setFileContent(text);
    handleParse(text);
  }, [handleParse]);

  const handleImport = useCallback(async () => {
    if (selectedPapers.size === 0) return;
    setIsImporting(true);
    setError(null);

    try {
      const selected = Array.from(selectedPapers).map((i) => papers[i]);
      const papersWithTitle = selected.map((p) => ({
        title: p.title || "Untitled",
        abstract: p.abstract || "",
        authors: p.authors || [],
        doi: p.doi,
        venue: p.venue,
        publicationYear: p.publicationYear,
        isOa: p.isOa ?? false,
        sourceType: p.sourceType || "bibtex",
      }));

      const result = await bulkUpload({ notebookId, papers: papersWithTitle });
      onSuccess?.(result.documentIds);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import papers");
    } finally {
      setIsImporting(false);
    }
  }, [selectedPapers, papers, notebookId, bulkUpload, onSuccess, onClose]);

  const togglePaper = useCallback((index: number) => {
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedPapers.size === papers.length) {
      setSelectedPapers(new Set());
    } else {
      setSelectedPapers(new Set(papers.map((_, i) => i)));
    }
  }, [selectedPapers.size, papers]);

  const handleClose = useCallback(() => {
    setActiveTab("file");
    setFileContent(null);
    setPasteContent("");
    setPapers([]);
    setSelectedPapers(new Set());
    setStats(null);
    setWarnings([]);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const withoutDoiCount = papers.filter((p) => !p.doi).length;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Import from BibTeX / RIS</h2>
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
          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setActiveTab("file")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "file"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Upload File
            </button>
            <button
              onClick={() => setActiveTab("paste")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "paste"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Paste Text
            </button>
          </div>

          {/* File Upload */}
          {activeTab === "file" && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".bib,.ris"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
              >
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload <span className="font-medium">.bib</span> or <span className="font-medium">.ris</span> file
                </p>
                {fileContent && (
                  <p className="text-xs text-primary">File loaded, ready to parse</p>
                )}
              </div>
            </div>
          )}

          {/* Paste Text */}
          {activeTab === "paste" && (
            <div className="space-y-4">
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste your BibTeX or RIS content here..."
                rows={8}
                className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm resize-none"
                disabled={isParsing || isImporting}
              />
              <button
                onClick={() => handleParse(pasteContent)}
                disabled={!pasteContent.trim() || isParsing || isImporting}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isParsing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Parse Bibliography
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                {warnings.map((w, i) => (
                  <p key={i} className="text-sm text-warning">{w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="flex gap-4 text-sm">
              <div className="px-3 py-1 bg-secondary/30 rounded-lg">
                <span className="font-medium">{stats.total}</span> total
              </div>
              <div className="px-3 py-1 bg-primary/10 rounded-lg">
                <span className="font-medium text-primary">{stats.withDoi}</span> with DOI
              </div>
              <div className="px-3 py-1 bg-destructive/10 rounded-lg">
                <span className="font-medium text-destructive">{stats.withoutDoi}</span> without DOI
              </div>
            </div>
          )}

          {/* Warning for papers without DOI */}
          {withoutDoiCount > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-warning">
                {withoutDoiCount} paper{withoutDoiCount !== 1 ? "s" : ""} missing DOI. These may have limited metadata.
              </p>
            </div>
          )}

          {/* Preview List */}
          {papers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Preview</h3>
                <button
                  onClick={toggleAll}
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  {selectedPapers.size === papers.length ? (
                    <>
                      <CheckSquare className="w-4 h-4" /> Deselect all
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" /> Select all
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {papers.map((paper, index) => (
                  <div
                    key={index}
                    onClick={() => togglePaper(index)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedPapers.has(index)
                        ? "border-primary bg-primary/5"
                        : "border-border/50 bg-card hover:bg-secondary/20"
                    }`}
                  >
                    {selectedPapers.has(index) ? (
                      <CheckSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{paper.title || "Untitled"}</p>
                      {paper.authors && paper.authors.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                          {paper.authors.join(", ")}
                        </p>
                      )}
                      {!paper.doi && (
                        <span className="text-xs text-warning">No DOI</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleImport}
                disabled={selectedPapers.size === 0 || isImporting}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Import {selectedPapers.size} selected paper{selectedPapers.size !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BibtexImportModal;
