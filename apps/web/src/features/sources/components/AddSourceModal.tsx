import React, { useRef, useEffect } from "react";
import {
  X,
  FileStack,
  Upload,
  Link as LinkIcon,
  Youtube,
  Clipboard,
  FileText,
  Globe,
  File,
  HardDrive,
} from "lucide-react";

const MAX_SOURCES = 100;

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (files: File[]) => void;
  onUrlClick: () => void;
  onSocialMediaClick: () => void;
  onTextClick: () => void;
  onDiscoverClick: () => void;
  onGoogleDriveClick: () => void;
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  sourcesCount: number;
  userId?: string | null;
  noteId?: string | null;
  isUploading?: boolean;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const AddSourceModal: React.FC<AddSourceModalProps> = ({
  isOpen,
  onClose,
  onFileUpload: _onFileUpload,
  onUrlClick,
  onSocialMediaClick,
  onTextClick,
  onDiscoverClick,
  onGoogleDriveClick,
  isDragging,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  sourcesCount,
  userId,
  noteId,
  isUploading: _isUploading = false,
  fileInputRef,
  onFileSelect,
}) => {
  // Keep ref to latest onDragLeave so we don't need it in the effect deps (avoids infinite loop:
  // onDragLeave is recreated each render, so [isOpen, onDragLeave] would retrigger after setState).
  const onDragLeaveRef = useRef(onDragLeave);
  onDragLeaveRef.current = onDragLeave;

  // Reset dragging state when modal closes (run only when isOpen changes, not when callback identity changes).
  useEffect(() => {
    if (!isOpen) {
      const syntheticEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        currentTarget: document.createElement("div"),
        relatedTarget: null,
      } as unknown as React.DragEvent<HTMLDivElement>;
      onDragLeaveRef.current(syntheticEvent);
    }
  }, [isOpen]);

  const canUpload = Boolean(userId && noteId && sourcesCount < MAX_SOURCES);
  const showAuthWarning = !userId || !noteId;
  const showLimitWarning = sourcesCount >= MAX_SOURCES;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
              <FileStack className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">SolomindLM</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 md:p-10 space-y-8 bg-card/50">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-medium">Add sources</h3>
              <button
                onClick={() => {
                  onClose();
                  onDiscoverClick();
                }}
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-sm font-medium"
              >
                <Globe className="w-4 h-4" />
                Discover sources
              </button>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-3xl">
              Sources let SolomindLM base its responses on the information that matters most to you.
              <br />
              (Examples: marketing plans, course reading, research notes, meeting transcripts, sales
              documents, etc.)
            </p>
          </div>

          {/* Hidden File Input */}
          {fileInputRef && onFileSelect && (
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={onFileSelect}
              accept=".pdf,.docx,.pptx,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.avif,.wav,.mp3,.m4a,.webm,.flac"
              multiple
            />
          )}

          {/* Upload Area */}
          <div
            onClick={() => canUpload && fileInputRef?.current?.click()}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 transition-all group ${
              !canUpload
                ? "opacity-50 cursor-not-allowed border-border bg-secondary/5"
                : isDragging
                  ? "border-primary bg-primary/10 cursor-pointer scale-[1.02]"
                  : "border-border bg-secondary/5 hover:bg-secondary/10 cursor-pointer"
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
              <Upload className="w-6 h-6 text-primary shrink-0" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-primary">Upload sources</h3>
              <p className="text-sm text-muted-foreground">
                Drag & drop or{" "}
                <span className="text-primary underline decoration-dotted font-medium">
                  choose file
                </span>{" "}
                to upload
              </p>
            </div>
            <p className="text-xs text-muted-foreground/60 text-center max-w-xl mt-4 font-mono">
              Supported file types: PDF, Word, PowerPoint, Text, Markdown, JSON, CSV, PNG, JPEG,
              AVIF, WAV, MP3, M4A, WebM, FLAC
            </p>
          </div>

          {/* Grid Options */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <div className="border border-border/50 rounded-xl p-5 space-y-4 bg-card shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <LinkIcon className="w-4 h-4" />
                Links
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onUrlClick}
                  disabled={!canUpload}
                  className="h-11 flex items-center justify-center gap-2 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Globe className="w-4 h-4 text-chart-3 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="text-sm font-medium">Website</span>
                </button>
                <button
                  onClick={onSocialMediaClick}
                  disabled={!canUpload}
                  className="h-11 flex items-center justify-center gap-2 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Youtube className="w-4 h-4 text-destructive group-hover:scale-110 transition-transform shrink-0" />
                  <span className="text-sm font-medium">Transcripts</span>
                </button>
              </div>
            </div>

            <div className="border border-border/50 rounded-xl p-5 space-y-4 bg-card shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Clipboard className="w-4 h-4" />
                Paste text
              </div>
              <div className="space-y-2">
                <button
                  onClick={onTextClick}
                  disabled={!canUpload}
                  className="h-11 w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-8 h-8 rounded-xl bg-background flex items-center justify-center border border-border shadow-sm group-hover:scale-105 transition-transform shrink-0">
                    <FileText className="w-4 h-4 text-chart-4" />
                  </div>
                  <span className="text-sm font-medium">Copied text</span>
                </button>
              </div>
            </div>

            <div className="border border-border/50 rounded-xl p-5 space-y-4 bg-card shadow-sm hover:shadow-md transition-shadow md:col-span-2 xl:col-span-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <HardDrive className="w-4 h-4" />
                Google Drive
              </div>
              <div className="space-y-2">
                <button
                  onClick={onGoogleDriveClick}
                  disabled={!canUpload}
                  className="h-11 w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <HardDrive className="w-4 h-4 text-chart-2 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="text-sm font-medium">Choose from Google Drive</span>
                </button>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {showAuthWarning && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3">
              <X className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-warning">Authentication required</p>
                <p className="text-xs text-warning/80 mt-1">
                  Please log in and select a notebook to upload sources.
                </p>
              </div>
            </div>
          )}
          {showLimitWarning && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
              <X className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Source limit reached</p>
                <p className="text-xs text-destructive/80 mt-1">
                  You've reached the maximum of {MAX_SOURCES} sources. Remove some sources to add
                  new ones.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Limit */}
        <div className="p-4 bg-secondary/10 border-t border-border flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0 font-medium">
            <File className="w-4 h-4 shrink-0" />
            <span>Source limit</span>
          </div>
          <div className="flex-1 h-2 bg-secondary/50 rounded-xl overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                sourcesCount >= MAX_SOURCES ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${Math.min((sourcesCount / MAX_SOURCES) * 100, 100)}%` }}
            />
          </div>
          <span
            className={`font-mono font-medium ${
              sourcesCount >= MAX_SOURCES ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {sourcesCount} / {MAX_SOURCES}
          </span>
        </div>
      </div>
    </div>
  );
};
