
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, FileText, Globe, CheckSquare, Square, ChevronLeft,
  X, Upload, Link as LinkIcon, Youtube, Clipboard, HardDrive, LayoutGrid, File,
  FileStack, Loader2, CheckCircle, XCircle, Check, MoreVertical, Edit2, Trash2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Source } from '@/shared/types/index';
import { DiscoverSourcesModal } from './DiscoverSourcesModal';
import { documentsApi } from '../services/documentsApi';
import { useDocumentStatus } from '../hooks/useDocumentStatus';

interface SourcesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sources: Source[];
  onToggleSource: (id: string) => void;
  onToggleAll: () => void;
  onAddSource: (source: Source) => void;
  onDeleteSource: (id: string) => void;
  onRenameSource: (id: string, newTitle: string) => void;
  width: number;
  isResizing: boolean;
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
}

export const SourcesPanel: React.FC<SourcesPanelProps> = ({
  isOpen,
  onClose,
  sources,
  onToggleSource,
  onToggleAll,
  onAddSource,
  onDeleteSource,
  onRenameSource,
  width,
  isResizing,
  userId,
  noteId,
  onDocumentUploaded,
}) => {
  const [viewingSourceId, setViewingSourceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showYouTubeInput, setShowYouTubeInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [loadingContentId, setLoadingContentId] = useState<string | null>(null);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});

  const viewingSource = useMemo(() => 
    sources.find(s => s.id === viewingSourceId), 
    [sources, viewingSourceId]
  );

  // Fetch content when a source is being viewed
  useEffect(() => {
    if (viewingSource && viewingSourceId && !contentCache[viewingSourceId]) {
      const fetchContent = async () => {
        setLoadingContentId(viewingSourceId);
        try {
          const content = await documentsApi.getDocumentContent(viewingSourceId);
          setContentCache(prev => ({
            ...prev,
            [viewingSourceId]: content,
          }));
        } catch (error) {
          console.error('Failed to load document content:', error);
        } finally {
          setLoadingContentId(null);
        }
      };

      fetchContent();
    }
  }, [viewingSourceId, contentCache]);

  const allSelected = sources.length > 0 && sources.every(s => s.selected);
  const selectedCount = sources.filter(s => s.selected).length;

  // File upload handler
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !noteId) return;

    setIsUploading(true);
    try {
      const response = await documentsApi.uploadFile(userId, noteId, file);
      onDocumentUploaded?.(response.documentId);
      setIsModalOpen(false);
    } catch (err) {
      console.error('Upload failed:', err);
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // URL upload handler
  const handleUrlUpload = async () => {
    if (!urlInput || !userId || !noteId) return;

    setIsUploading(true);
    try {
      const response = await documentsApi.uploadUrl(userId, noteId, urlInput, 'url');
      onDocumentUploaded?.(response.documentId);
      setShowUrlInput(false);
      setUrlInput('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('URL upload failed:', err);
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // YouTube upload handler
  const handleYouTubeUpload = async () => {
    if (!urlInput || !userId || !noteId) return;

    setIsUploading(true);
    try {
      const response = await documentsApi.uploadUrl(userId, noteId, urlInput, 'youtube');
      onDocumentUploaded?.(response.documentId);
      setShowYouTubeInput(false);
      setUrlInput('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('YouTube upload failed:', err);
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div
        style={{ width: isOpen ? width : 0 }}
        className={`
          relative shrink-0 bg-sidebar border-r-2 border-border h-full flex flex-col
          overflow-hidden
          ${!isResizing ? 'panel-transition' : ''}
          ${isOpen ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10 h-14">
          {viewingSource ? (
            <div className="flex items-center gap-2 text-sidebar-foreground overflow-hidden">
              <button 
                onClick={() => setViewingSourceId(null)}
                className="p-1 -ml-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="font-sans font-bold text-sm tracking-wide truncate" title={viewingSource.title}>
                {viewingSource.title}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sidebar-foreground">
                <FileStack className="w-4 h-4" />
                <span className="font-sans font-bold text-sm tracking-wide uppercase">Sources</span>
                <span className="ml-2 text-xs text-muted-foreground bg-sidebar-accent px-1.5 py-0.5 rounded-full font-mono">
                  {selectedCount}
                </span>
              </div>
              <button 
                onClick={onClose}
                className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto w-full">
          {viewingSource ? (
            <div className="p-6 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono bg-sidebar-accent/50 px-2 py-1 rounded-sm">
                    {viewingSource.type} • {viewingSource.date}
                  </span>

                  <button
                    onClick={() => onToggleSource(viewingSource.id)}
                    className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    {viewingSource.selected ? (
                      <>
                        <CheckSquare className="w-4 h-4" />
                        Included
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4" />
                        Include Source
                      </>
                    )}
                  </button>
              </div>

              {/* Error State */}
              {viewingSource.status === 'failed' && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-destructive shrink-0" />
                    <p className="text-sm font-medium text-destructive">Failed to process document</p>
                  </div>
                  <p className="text-xs text-destructive/80">
                    There was an error while processing this document. Please try uploading it again.
                  </p>
                </div>
              )}

              {/* Progress Steps for Processing Documents */}
              {viewingSource.status === 'processing' && (
                <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground font-sans">Processing document...</p>
                  {[
                    { label: 'Uploading', done: true },
                    { label: 'Extracting content', done: false },
                    { label: 'Generating title', done: false },
                    { label: 'Creating embeddings', done: false },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 shrink-0 ${
                        step.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                      }`}>
                        {step.done ? <Check className="w-3 h-3" /> : null}
                      </div>
                      <span className={step.done ? 'font-medium' : 'text-muted-foreground'}>{step.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Loading State */}
              {loadingContentId === viewingSourceId && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading content...</p>
                  </div>
                </div>
              )}

              {/* Content Display */}
              {loadingContentId !== viewingSourceId && (
                <div className="prose prose-sm prose-stone dark:prose-invert max-w-none font-serif leading-relaxed text-foreground/90">
                  <ReactMarkdown>{contentCache[viewingSourceId] || "No content available."}</ReactMarkdown>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-5">
              {/* Refined Action Bar */}
              <div className="flex gap-2 p-1.5 bg-background/50 border border-border rounded-lg shadow-inner">
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 transition-all font-sans font-bold text-[11px] uppercase tracking-wider ${width < 300 ? 'px-3' : ''}`}
                  title={width < 300 ? 'Add Source' : ''}
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  {width >= 300 && <span>Add Source</span>}
                </button>
                <button 
                  onClick={() => setIsDiscoverOpen(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-card border border-border text-foreground rounded-md shadow-xs hover:bg-secondary hover:border-primary/30 transition-all font-sans font-bold text-[11px] uppercase tracking-wider ${width < 300 ? 'px-3' : ''}`}
                  title={width < 300 ? 'Discover' : ''}
                >
                  <Search className="w-4 h-4 text-primary shrink-0" />
                  {width >= 300 && <span>Discover</span>}
                </button>
              </div>

              {/* Search & List */}
              <div className="space-y-3">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none shrink-0" />
                  <input 
                    type="text" 
                    placeholder="Search sources..." 
                    className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-serif shadow-xs"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-1 font-sans">
                    <span>{sources.length} items</span>
                    <button 
                      onClick={onToggleAll}
                      className="hover:text-primary transition-colors cursor-pointer select-none font-medium"
                    >
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {sources.map((source) => {
                    const status = source.status || 'completed';
                    const isRenaming = renamingId === source.id;
                    return (
                      <div
                        key={source.id}
                        className="group flex flex-col bg-card border border-border rounded-lg hover:shadow-md transition-all cursor-pointer overflow-visible relative"
                        onClick={() => !isRenaming && setViewingSourceId(source.id)}
                      >
                        <div className="flex items-center gap-3 p-3">
                          <div className="text-muted-foreground shrink-0 flex items-center justify-center">
                            {source.type === 'WEB' ? <Globe className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {isRenaming ? (
                                <input
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && renameValue.trim()) {
                                      onRenameSource(source.id, renameValue.trim());
                                      setRenamingId(null);
                                    } else if (e.key === 'Escape') {
                                      setRenamingId(null);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 px-2 py-1 text-sm bg-background border border-primary rounded font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                  autoFocus
                                />
                              ) : (
                                <h4 className="text-sm font-medium text-foreground truncate leading-tight">{source.title}</h4>
                              )}
                              {/* Status badge */}
                              {status === 'processing' && (
                                <div className="flex items-center gap-1 text-[10px] font-medium text-yellow-600 dark:text-yellow-500 font-sans shrink-0">
                                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                  <span>Processing</span>
                                </div>
                              )}
                              {status === 'completed' && (
                                <div className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-500 font-sans shrink-0">
                                  <CheckCircle className="w-3 h-3 shrink-0" />
                                  <span>Ready</span>
                                </div>
                              )}
                              {status === 'failed' && (
                                <div className="flex items-center gap-1 text-[10px] font-medium text-destructive font-sans shrink-0">
                                  <XCircle className="w-3 h-3 shrink-0" />
                                  <span>Failed</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-sans">{source.type} • {source.date}</p>
                          </div>
                          {!isRenaming && (
                            <div className="flex items-center gap-2 shrink-0">
                              <div
                                className="text-primary p-1.5 hover:bg-secondary rounded-full transition-colors flex items-center justify-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleSource(source.id);
                                }}
                              >
                                {source.selected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 opacity-50 group-hover:opacity-100" />}
                              </div>
                              <div className="relative z-50">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === source.id ? null : source.id);
                                  }}
                                  className={`p-1.5 hover:bg-secondary rounded-full transition-colors flex items-center justify-center ${
                                    openMenuId === source.id
                                      ? 'text-foreground bg-secondary'
                                      : 'text-muted-foreground group-hover:text-foreground opacity-0 group-hover:opacity-100'
                                  }`}
                                  title="More options"
                                >
                                  <MoreVertical className="w-5 h-5" />
                                </button>
                                {openMenuId === source.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                                    <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-50 min-w-[140px]">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRenamingId(source.id);
                                          setRenameValue(source.title);
                                          setOpenMenuId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary first:rounded-t-lg transition-colors"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                        Rename
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm(`Delete "${source.title}"?`)) {
                                            onDeleteSource(source.id);
                                          }
                                          setOpenMenuId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 last:rounded-b-lg transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Source Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-sans">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center">
                    <FileStack className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">NotebookLM</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-secondary/50 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto p-6 md:p-10 space-y-8 bg-card/50">
                  <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-medium">Add sources</h3>
                        <button 
                          onClick={() => { setIsModalOpen(false); setIsDiscoverOpen(true); }}
                          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full border border-border hover:bg-secondary/50 transition-colors text-sm font-medium"
                        >
                            <Search className="w-4 h-4" />
                            Discover sources
                        </button>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed max-w-3xl">
                          Sources let NotebookLM base its responses on the information that matters most to you.<br/>
                          (Examples: marketing plans, course reading, research notes, meeting transcripts, sales documents, etc.)
                      </p>
                  </div>

                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.txt,.md,.docx"
                  />

                  {/* Upload Area */}
                  <div
                    onClick={() => userId && fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center gap-4 bg-secondary/5 hover:bg-secondary/10 transition-colors cursor-pointer group ${!userId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                          <Upload className="w-6 h-6 text-primary shrink-0" />
                      </div>
                      <div className="text-center space-y-2">
                          <h3 className="text-lg font-bold text-primary">Upload sources</h3>
                          <p className="text-sm text-muted-foreground">Drag & drop or <span className="text-primary underline decoration-dotted font-medium">choose file</span> to upload</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 text-center max-w-xl mt-4 font-mono">
                          Supported file types: PDF, .txt, Markdown, Audio (e.g. mp3), .docx, .avif, .bmp, .gif, .ico, .jp2, .png, .webp, .tif, .tiff, .heic, .heif, .jpeg, .jpg, .jpe
                      </p>
                  </div>

                  {/* Grid Options */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Column 1 */}
                      <div className="border border-border/50 rounded-xl p-5 space-y-4 bg-card shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                              <LayoutGrid className="w-4 h-4" />
                              Google Workspace
                          </div>
                          <div className="space-y-2">
                              <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all text-left group">
                                  <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center border border-border shadow-sm group-hover:scale-105 transition-transform shrink-0">
                                      <HardDrive className="w-4 h-4 text-emerald-600" />
                                  </div>
                                  <span className="text-sm font-medium">Google Drive</span>
                              </button>
                          </div>
                      </div>

                      {/* Column 2 */}
                      <div className="border border-border/50 rounded-xl p-5 space-y-4 bg-card shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                              <LinkIcon className="w-4 h-4" />
                              Link
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={() => userId ? setShowUrlInput(true) : null}
                                disabled={!userId}
                                className="flex items-center justify-center gap-2 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                  <Globe className="w-4 h-4 text-sky-600 group-hover:scale-110 transition-transform shrink-0" />
                                  <span className="text-sm font-medium">Website</span>
                              </button>
                              <button
                                onClick={() => userId ? setShowYouTubeInput(true) : null}
                                disabled={!userId}
                                className="flex items-center justify-center gap-2 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                  <Youtube className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform shrink-0" />
                                  <span className="text-sm font-medium">YouTube</span>
                              </button>
                          </div>
                      </div>

                      {/* Column 3 */}
                      <div className="border border-border/50 rounded-xl p-5 space-y-4 bg-card shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                              <Clipboard className="w-4 h-4" />
                              Paste text
                          </div>
                          <div className="space-y-2">
                              <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all text-left group">
                                  <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center border border-border shadow-sm group-hover:scale-105 transition-transform shrink-0">
                                      <FileText className="w-4 h-4 text-indigo-600" />
                                  </div>
                                  <span className="text-sm font-medium">Copied text</span>
                              </button>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Footer Limit */}
              <div className="p-4 bg-secondary/10 border-t border-border flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground shrink-0 font-medium">
                      <File className="w-4 h-4 shrink-0" />
                      <span>Source limit</span>
                  </div>
                  <div className="flex-1 h-2 bg-secondary/50 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[13%] rounded-full" />
                  </div>
                  <span className="text-muted-foreground font-mono font-medium">{sources.length} / 300</span>
              </div>
          </div>
        </div>
      )}

      {/* URL Input Modal */}
      {showUrlInput && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowUrlInput(false)} />
          <div className="relative w-full max-w-md bg-card rounded-xl shadow-2xl border border-border">
            <div className="flex items-center justify-between p-6 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-bold font-sans">Add Website</h2>
              </div>
              <button onClick={() => setShowUrlInput(false)} className="p-2 hover:bg-secondary/50 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-3 bg-background border-2 border-border rounded-xl font-serif focus:border-primary focus:outline-none transition-colors"
                disabled={isUploading}
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUrlInput(false)}
                  disabled={isUploading}
                  className="flex-1 py-3 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 font-bold font-sans transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUrlUpload}
                  disabled={!urlInput || isUploading}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-bold font-sans transition-colors flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      Adding...
                    </>
                  ) : (
                    'Add Source'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* YouTube Input Modal */}
      {showYouTubeInput && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowYouTubeInput(false)} />
          <div className="relative w-full max-w-md bg-card rounded-xl shadow-2xl border border-border">
            <div className="flex items-center justify-between p-6 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Youtube className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-bold font-sans">Add YouTube Video</h2>
              </div>
              <button onClick={() => setShowYouTubeInput(false)} className="p-2 hover:bg-secondary/50 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-4 py-3 bg-background border-2 border-border rounded-xl font-serif focus:border-primary focus:outline-none transition-colors"
                disabled={isUploading}
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowYouTubeInput(false)}
                  disabled={isUploading}
                  className="flex-1 py-3 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 font-bold font-sans transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleYouTubeUpload}
                  disabled={!urlInput || isUploading}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-bold font-sans transition-colors flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      Adding...
                    </>
                  ) : (
                    'Add Video'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discover Modal */}
      <DiscoverSourcesModal 
        isOpen={isDiscoverOpen} 
        onClose={() => setIsDiscoverOpen(false)} 
        onAddSource={onAddSource}
      />
    </>
  );
};
