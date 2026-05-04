import React, { useState } from "react";
import { X, Loader2, Bookmark, Globe, Lock, Eye } from "lucide-react";
import { useCreatePrompt, usePublishPrompt, type StudioTool } from "../services/promptsApi";
import { useToast } from "@/shared/contexts/ToastContext";

// ── Props ──────────────────────────────────────────────────────────────

interface SaveAsPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  studioTool: StudioTool;
  /** Pre-filled prompt text from the Customize modal */
  initialPromptText: string;
  /** Optional notebook ID to associate with the prompt */
  notebookId?: string;
}

// ── Constants ───────────────────────────────────────────────────────────

const TOOL_LABELS: Record<StudioTool, string> = {
  report: "Reports",
  spreadsheet: "Spreadsheets",
  infographic: "Infographics",
  flashcards: "Flashcards",
  quiz: "Quizzes",
  audio: "Audio",
  writtenQuestions: "Written Questions",
  mindmap: "Mind Maps",
};

// ── Component ──────────────────────────────────────────────────────────

export const SaveAsPromptModal: React.FC<SaveAsPromptModalProps> = ({
  isOpen,
  onClose,
  studioTool,
  initialPromptText,
  notebookId,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState(initialPromptText);
  const [makePublic, setMakePublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const createPrompt = useCreatePrompt();
  const publishPrompt = usePublishPrompt();
  const { success, error: showError } = useToast();

  // Reset form when modal opens with new initial text
  if (isOpen && promptText !== initialPromptText) {
    setPromptText(initialPromptText);
  }

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!title.trim()) {
      showError("Please enter a title");
      return;
    }
    if (!promptText.trim()) {
      showError("Please enter prompt text");
      return;
    }

    setIsSaving(true);
    try {
      // Create the prompt (always private initially)
      const promptId = await createPrompt({
        title: title.trim(),
        description: description.trim() || undefined,
        promptText: promptText.trim(),
        studioTool,
        notebookId,
      });

      // If user chose to make it public, publish it
      if (makePublic && promptId) {
        await publishPrompt(promptId);
        success("Prompt saved and published to the library!");
      } else {
        success("Prompt saved to your library!");
      }

      // Reset form
      setTitle("");
      setDescription("");
      setPromptText(initialPromptText);
      setMakePublic(false);
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTitle("");
    setDescription("");
    setPromptText(initialPromptText);
    setMakePublic(false);
    onClose();
  };

  return (
    <div
      data-testid="save-as-prompt-modal"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleCancel}
    >
      <div
        className="relative w-full max-w-lg bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bookmark className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p data-testid="save-as-prompt-tool-label" className="text-xs text-muted-foreground">
                {TOOL_LABELS[studioTool]}
              </p>
              <h2 className="text-lg font-bold leading-snug tracking-tight">
                Save as Prompt
              </h2>
            </div>
          </div>
          <button
            data-testid="save-as-prompt-close"
            onClick={handleCancel}
            aria-label="Close"
            className="p-2 hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Focus on key concepts for exam prep"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
              maxLength={100}
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {title.length}/100
            </p>
          </div>

          {/* Description (optional) */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Description <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this prompt does..."
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
              maxLength={300}
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {description.length}/300
            </p>
          </div>

          {/* Prompt Text */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Prompt Text <span className="text-destructive">*</span>
            </label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter your custom prompt..."
              className="w-full h-32 px-4 py-3 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors resize-none placeholder:text-muted-foreground/50 font-mono"
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {promptText.length}/2000
            </p>
          </div>

          {/* Visibility Toggle */}
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border/50">
            <div className="flex items-center gap-3">
              {makePublic ? (
                <Globe className="w-5 h-5 text-primary" />
              ) : (
                <Lock className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {makePublic ? "Public" : "Private"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {makePublic
                    ? "Anyone can discover and use this prompt"
                    : "Only you can see and use this prompt"}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="save-as-prompt-visibility-toggle"
              role="switch"
              aria-checked={makePublic}
              aria-label={makePublic ? "Set visibility to private" : "Set visibility to public"}
              onClick={() => setMakePublic(!makePublic)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                makePublic ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  makePublic ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Public hint */}
          {makePublic && (
            <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Eye className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                Your prompt will be visible in the public library. Other users can save and rate it.
                You can always unpublish it later from the "My Prompts" tab.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border/50">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !promptText.trim()}
            className="px-5 py-2.5 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4" />
                Save Prompt
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
